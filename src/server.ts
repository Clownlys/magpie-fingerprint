import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { loadDetector, parseNumbers, type Detector } from 'lmfpd-sdk';
import { options, type Options } from './config';
import { Gateway } from './gateway';
import { Store } from './store';
import { boundedText, BodyTooLargeError } from './http';
import { normalizeChatStream } from './sse';
import { serviceIdentity, VERSION } from './service-identity';
import { createJob, runJob } from './detector';
import { demoModels, demoHistory, demoAnalysis } from './demo';
import { AUTORUN_FILE, AutoRunScheduler, normalizeAutoRun, scheduleAutoRun } from './scheduler';
import {
  MILK_ATTEMPTS,
  QUALITY_IDS,
  QUALITY_MAX_TOKENS,
  QUALITY_PROMPTS,
  QUALITY_TIMEOUT_SECONDS,
  findQualityPrompt,
  grade,
  repeatCoverage,
} from './quality';
import type {
  AutoRunConfig,
  Job,
  Model,
  ProbeResult,
  Provenance,
  TargetResult,
  RunConfig,
} from './types';

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, { status, headers });
const equal = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const isTerminal = (job: Job) => !['queued', 'running'].includes(job.state);
const uuid = () => crypto.randomUUID();
type SampleTicket = {
  job: Job;
  result: TargetResult;
  index: number;
  secret: string;
  controller: AbortController;
  used: boolean;
  done: Promise<void>;
  finish: () => void;
};

export async function startServer(input: Options = {}) {
  const opt = options(input);
  const gateway = new Gateway(opt.gateway, opt.apiKey);
  const store = new Store(join(opt.dataDir, opt.demo ? 'demo-jobs' : 'jobs'));
  const token = randomBytes(32).toString('hex');
  const active = new Map<string, AbortController>();
  const tickets = new Map<string, SampleTicket>();
  const listeners = new Map<string, Set<(job: Job) => void>>();
  let detector: Detector | undefined,
    bankError = '',
    loading: Promise<Detector | undefined> | undefined;
  let models: Model[] = [],
    catalogError = '';
  let closed = false,
    creatingJob = false;
  let modelCount: number | undefined;
  let autorun: AutoRunConfig = scheduleAutoRun({
    enabled: opt.autoIntervalMinutes > 0 && !!opt.autoModels.trim(),
    intervalMinutes: Math.min(10080, Math.max(0, Math.round(Number(opt.autoIntervalMinutes) || 0))),
    models: opt.autoModels
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
      .slice(0, 24),
    effort: opt.autoEffort,
  });
  const autorunPath = join(opt.dataDir, AUTORUN_FILE);
  const saveAutorun = async () => {
    await mkdir(opt.dataDir, { recursive: true, mode: 0o700 });
    const temp = `${autorunPath}.tmp`;
    await writeFile(temp, JSON.stringify(autorun), { mode: 0o600 });
    await rename(temp, autorunPath);
  };
  const scheduler = new AutoRunScheduler(
    () => autorun,
    async (next) => {
      autorun = next;
      await saveAutorun();
    },
    () => {
      void (async () => {
        if (closed || active.size || creatingJob) return void scheduler.reschedule();
        if (!autorun.enabled) return;
        try {
          await startAutoJob();
        } catch {
          /* Failed cycles simply wait for the next scheduled tick. */
        } finally {
          await scheduler.markRan();
        }
      })();
    },
  );
  const emit = (job: Job) => {
    for (const fn of listeners.get(job.id) || []) fn(job);
  };
  const persist = async (job: Job) => {
    emit(job);
    await store.save(job);
  };
  async function ensureDetector(force = false) {
    if (opt.demo) return undefined;
    if (detector && !force) return detector;
    if (loading) return loading;
    loading = (async () => {
      try {
        await mkdir(opt.dataDir, { recursive: true, mode: 0o700 });
        const cache = join(
          opt.dataDir,
          force ? `reference-refresh-${uuid()}.bin` : 'reference.bin',
        );
        try {
          const next = await loadDetector({
            ...(opt.bankSource ? { source: opt.bankSource } : {}),
            cache,
          });
          if (force && !opt.bankSource) await rename(cache, join(opt.dataDir, 'reference.bin'));
          detector = next;
          try {
            const bytes = await readFile(join(opt.dataDir, 'reference.bin'));
            modelCount = JSON.parse(bytes.subarray(4, 4 + bytes.readUInt32LE(0)).toString()).models
              ?.length;
          } catch {
            /* Local reference directories need no downloaded cache. */
          }
        } finally {
          if (force) await unlink(cache).catch(() => {});
        }
        bankError = '';
        return detector;
      } catch (e) {
        bankError = gateway.redact(e);
        return undefined;
      } finally {
        loading = undefined;
      }
    })();
    return loading;
  }
  async function catalog() {
    if (opt.demo) {
      models = demoModels;
      return { models, accounts: [] };
    }
    try {
      const result = await gateway.catalog();
      models = result.models;
      catalogError = '';
      return result;
    } catch (e) {
      catalogError = gateway.redact(e);
      return { models: [], accounts: [] };
    }
  }
  // The SDK talks only to this private, one-shot, job-bound transport. It is
  // never exposed through Magpie's page service and cannot select a URL/model.
  const transport = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    idleTimeout: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.headers.get('host') !== url.host || url.hostname !== '127.0.0.1')
        return new Response('Forbidden', { status: 403 });
      const match = url.pathname.match(
        /^\/sample\/([\w-]+)\/v1\/(responses|chat\/completions|messages)$/,
      );
      const ticket = match ? tickets.get(match[1]) : undefined;
      if (!ticket || req.method !== 'POST' || ticket.used || ticket.controller.signal.aborted)
        return new Response('Unknown sample', { status: 404 });
      const key =
        req.headers.get('authorization')?.replace(/^Bearer /, '') ||
        req.headers.get('x-api-key') ||
        '';
      if (!equal(key, ticket.secret)) return new Response('Unauthorized', { status: 401 });
      ticket.used = true;
      const { job, result, index, controller } = ticket;
      const provenance: Provenance = {
        session: `fp-${uuid()}`,
        requestedModel: result.target.model,
      };
      result.provenance[index] = provenance;
      let finishing: Promise<void> | undefined;
      const finish = () =>
        (finishing ??= (async () => {
          try {
            await gateway.route(provenance);
            emit(job);
          } finally {
            ticket.finish();
          }
        })());
      try {
        const payload = await boundedText(req, 16384);
        if (payload.length > 16384) throw new Error('Sample request too large.');
        const body = JSON.parse(payload);
        if (body.model !== result.target.model)
          throw new Error('Sample model does not match its job.');
        const expected = {
          responses: 'responses',
          chat_completions: 'chat/completions',
          messages: 'messages',
        }[result.api];
        if (match![2] !== expected) throw new Error('Sample protocol does not match its job.');
        const startedAt = Date.now();
        const headers = gateway.headers({
          'X-Magpie-Session': provenance.session,
          ...(result.target.account ? { 'X-Magpie-Account': result.target.account } : {}),
        });
        for (const name of ['anthropic-version', 'anthropic-beta', 'accept']) {
          const value = req.headers.get(name);
          if (value) (headers as Record<string, string>)[name] = value;
        }
        const upstream = await fetch(`${gateway.url}/v1/${expected}`, {
          method: 'POST',
          headers,
          body: payload,
          signal: controller.signal,
          redirect: 'error',
          timeout: false,
        });
        provenance.provider = upstream.headers.get('X-Magpie-Provider') || undefined;
        provenance.model = upstream.headers.get('X-Magpie-Model') || undefined;
        provenance.mismatch = !!(
          (provenance.model && provenance.model !== result.target.model) ||
          (provenance.provider && provenance.provider !== result.target.model.split('/')[0])
        );
        if (!upstream.ok || !upstream.body) {
          await upstream.body?.cancel();
          await finish();
          return json(
            {
              error: {
                message: `Magpie returned HTTP ${upstream.status}. Inspect Magpie's request log for details.`,
              },
            },
            upstream.ok ? 502 : upstream.status,
          );
        }
        let ended = false,
          text = '',
          lineBuffer = '',
          totalBytes = 0;
        const responseBody =
          result.api === 'chat_completions' &&
          upstream.headers.get('content-type')?.includes('text/event-stream')
            ? normalizeChatStream(upstream.body, () => {
                provenance.streamNormalization = 'chat-done-after-stop';
              })
            : upstream.body;
        const reader = responseBody.getReader();
        let lastEmit = 0;
        const decoder = new TextDecoder();
        // Record TTFT and throughput once the stream settles (completed or not).
        const finalizeSample = () => {
          const sample = result.samples[index];
          if (!sample || sample.state === 'failed') return;
          sample.ttft_ms = sample.first_byte_ms;
          if (sample.first_byte_ms == null || !text.length) return;
          const genMs = Math.max(1, Date.now() - startedAt - sample.first_byte_ms);
          sample.gen_ms = genMs;
          sample.tokens_per_s = Math.round(((text.length / 4) * 1000) / genMs);
        };
        const recordChunk = (bytes: Uint8Array) => {
          const sample = result.samples[index];
          if (!sample) return;
          totalBytes += bytes.byteLength;
          if (totalBytes > 2 * 1024 * 1024)
            throw new Error('Sample exceeded the 2 MiB response limit.');
          sample.state = 'streaming';
          sample.first_byte_ms ??= Date.now() - startedAt;
          lineBuffer += decoder.decode(bytes, { stream: true });
          let newline: number;
          while ((newline = lineBuffer.indexOf('\n')) >= 0) {
            const line = lineBuffer.slice(0, newline).trim();
            lineBuffer = lineBuffer.slice(newline + 1);
            if (!line.startsWith('data:')) continue;
            try {
              const event = JSON.parse(line.slice(5));
              const delta =
                event.choices?.[0]?.delta?.content ??
                (event.type === 'response.output_text.delta' ? event.delta : undefined) ??
                (event.type === 'content_block_delta' ? event.delta?.text : undefined);
              if (typeof delta === 'string') text += delta;
            } catch {
              /* SSE metadata and [DONE] are not sample text. */
            }
          }
          if (text.length > 100000 || lineBuffer.length > 100000)
            throw new Error('Sample text exceeded the response limit.');
          sample.raw_text = text;
          sample.count = parseNumbers(text).length;
          if (Date.now() - lastEmit > 150) {
            lastEmit = Date.now();
            emit(job);
          }
        };
        const stream = new ReadableStream<Uint8Array>({
          async pull(out) {
            try {
              const chunk = await reader.read();
              if (chunk.done) {
                ended = true;
                finalizeSample();
                await finish();
                out.close();
              } else {
                recordChunk(chunk.value);
                out.enqueue(chunk.value);
              }
            } catch (e) {
              await reader.cancel().catch(() => {});
              if (!ended) {
                ended = true;
                finalizeSample();
                await finish();
              }
              out.error(e);
            }
          },
          async cancel() {
            if (!ended) {
              ended = true;
              await reader.cancel().catch(() => {});
              await finish();
            }
          },
        });
        return new Response(stream, {
          headers: {
            'content-type': upstream.headers.get('content-type') || 'text/event-stream',
            'cache-control': 'no-store',
          },
        });
      } catch (e) {
        await finish();
        return json(
          {
            error: {
              message: controller.signal.aborted
                ? 'Detection cancelled or deadline exceeded.'
                : gateway.redact(e),
            },
          },
          502,
        );
      }
    },
  });

  async function launch(job: Job, engine?: Detector) {
    const controller = new AbortController();
    active.set(job.id, controller);
    const timer = setTimeout(
      () => controller.abort(new Error('Job deadline exceeded')),
      job.config.deadlineSeconds * 1000,
    );
    try {
      if (opt.demo) {
        job.demo = true;
        job.state = 'running';
        await persist(job);
        for (const r of job.results) {
          r.state = 'running';
          for (let i = 0; i < 3; i++) {
            if (controller.signal.aborted) break;
            r.samples[i] = {
              state: 'streaming',
              text: '',
              raw_text: '',
              count: 0,
              expected_count: job.challenges[i].expected_count,
              first_byte_ms: 650,
              response_model: r.target.model.split('/')[1],
              response_id: 'demo',
              error: null,
            };
            emit(job);
            await Bun.sleep(350);
            r.samples[i] = {
              ...r.samples[i],
              state: 'complete',
              text: '137, 42, 291, 65, 188',
              raw_text: '137, 42, 291, 65, 188 (illustrative excerpt)',
              count: job.challenges[i].expected_count,
              ttft_ms: 650,
              gen_ms: 2600,
              tokens_per_s: 42,
            };
            r.provenance[i] = {
              session: `demo-${i}`,
              requestedModel: r.target.model,
              model: r.target.model,
              provider: r.target.model.split('/')[0],
            };
            emit(job);
          }
          r.state = controller.signal.aborted ? 'cancelled' : 'completed';
          r.analysis = controller.signal.aborted ? null : demoAnalysis(r.target.model);
          await persist(job);
          if (controller.signal.aborted) break;
        }
        job.state = controller.signal.aborted ? 'cancelled' : 'completed';
        job.finishedAt = new Date().toISOString();
      } else {
        if (!engine) throw new Error(bankError || 'Reference data is not loaded.');
        await runJob(job, {
          detector: engine,
          signal: controller.signal,
          sampleEndpoint: (result, index) => {
            const id = uuid();
            let finish!: () => void;
            const done = new Promise<void>((r) => {
              finish = r;
            });
            const ticket: SampleTicket = {
              job,
              result,
              index,
              secret: randomBytes(32).toString('hex'),
              controller,
              used: false,
              done,
              finish,
            };
            tickets.set(id, ticket);
            return {
              baseUrl: `http://127.0.0.1:${transport.port}/sample/${id}/v1`,
              apiKey: ticket.secret,
            };
          },
          afterSample: async (result, index) => {
            const entry = [...tickets.values()].find(
              (t) => t.job === job && t.result === result && t.index === index,
            );
            if (entry?.used) await Promise.race([entry.done, Bun.sleep(3500)]);
          },
          onUpdate: () => persist(job),
        });
      }
    } catch (e) {
      job.state = controller.signal.aborted ? 'cancelled' : 'failed';
      job.error = gateway.redact(e);
      job.finishedAt = new Date().toISOString();
    } finally {
      clearTimeout(timer);
      active.delete(job.id);
      if (controller.signal.aborted && !job.error)
        job.error = errorText(controller.signal.reason || 'Cancelled');
      for (const [id, t] of tickets)
        if (t.job === job) {
          t.finish();
          tickets.delete(id);
        }
      for (const r of job.results)
        if (r.state === 'running' || r.state === 'queued') {
          r.state = 'cancelled';
          r.analysis = null;
        }
      await persist(job);
    }
  }
  /** Shared job creation for the page API and the scheduled auto-runner. */
  const startJob = async (config: RunConfig): Promise<Job> => {
    if (active.size || creatingJob)
      throw Object.assign(new Error('A detection batch is already running.'), { status: 409 });
    if (store.jobs.size >= 200)
      throw Object.assign(
        new Error('History limit reached (200 batches). Export and delete older batches first.'),
        { status: 409 },
      );
    creatingJob = true;
    try {
      await catalog();
      if (Array.isArray(config.questions) && config.questions.length > 0) {
        const job = createQualityJob(config, models);
        store.jobs.set(job.id, job);
        await store.save(job);
        void runQualityJob(job).catch((e) => {
          job.state = 'failed';
          job.error = `Could not save task history: ${gateway.redact(e)}`;
          emit(job);
        });
        return job;
      }
      const engine = await ensureDetector();
      if (!opt.demo && !engine)
        throw Object.assign(new Error(bankError || 'Reference data unavailable'), { status: 503 });
      const job = createJob(config, models, opt.demo ? 'Demo reference data' : engine!.builtAt);
      if (opt.demo) job.demo = true;
      store.jobs.set(job.id, job);
      await store.save(job);
      void launch(job, engine).catch((e) => {
        job.state = 'failed';
        job.error = `Could not save task history: ${gateway.redact(e)}`;
        emit(job);
      });
      return job;
    } finally {
      creatingJob = false;
    }
  };
  const startAutoJob = async (): Promise<Job> => {
    if (!autorun.enabled) throw new Error('Auto-run is disabled.');
    await catalog();
    const known = new Set(models.map((m) => m.id));
    let last: Job | undefined;
    if (autorun.models.length) {
      const targets = autorun.models.filter((m) => known.has(m)).map((model) => ({ model }));
      if (!targets.length && !autorun.quality?.questions.length)
        throw new Error('None of the auto-run models are in the current catalog.');
      last = await startJob({
        targets,
        api: 'auto',
        effort: autorun.effort,
        serviceTier: 'default',
        strict: false,
        targetParallel: 2,
        sampleParallel: 3,
        deadlineSeconds: 300,
      });
    }
    if (autorun.quality?.enabled && autorun.quality.questions.length) {
      const targets = autorun.models.filter((m) => known.has(m)).map((model) => ({ model }));
      if (targets.length)
        last = await startJob({
          targets,
          api: 'auto',
          effort: '',
          serviceTier: 'default',
          strict: false,
          targetParallel: 2,
          sampleParallel: 1,
          deadlineSeconds: 600,
          questions: autorun.quality.questions,
        });
    }
    if (!last) throw new Error('Auto-run is disabled.');
    return last;
  };
  /** Probe-suite job creation; no reference bank or challenges involved. */
  function createQualityJob(config: RunConfig, catalog: Model[]): Job {
    const questions = [...new Set(config.questions || [])];
    if (!questions.length || questions.length > QUALITY_IDS.length)
      throw Object.assign(new Error('questions must list 1 to 7 probe ids'), { status: 400 });
    for (const id of questions)
      if (!findQualityPrompt(id))
        throw Object.assign(new Error(`unknown quality question: ${id}`), { status: 400 });
    if (!Array.isArray(config.targets) || config.targets.length < 1 || config.targets.length > 24)
      throw Object.assign(new Error('targets must contain 1 to 24 items'), { status: 400 });
    const keys = config.targets.map((t) => `${t.model}\0${t.account ?? ''}`);
    if (new Set(keys).size !== keys.length)
      throw Object.assign(new Error('duplicate targets are not allowed'), { status: 400 });
    for (const target of config.targets) {
      if (typeof target.model !== 'string' || !target.model.trim())
        throw Object.assign(new Error('target model must be text'), { status: 400 });
      if (!catalog.some((candidate) => candidate.id === target.model))
        throw Object.assign(new Error(`unknown model: ${target.model}`), { status: 400 });
    }
    return {
      id: uuid(),
      createdAt: new Date().toISOString(),
      state: 'queued',
      kind: 'quality',
      config: { ...config, questions },
      challenges: [],
      results: config.targets.map((target, index) => ({
        id: `target-${index + 1}-${uuid()}`,
        target,
        api: 'chat_completions',
        state: 'queued',
        samples: [],
        provenance: [],
        analysis: null,
        error: null,
        probes: questions.map((id) => ({
          id,
          question: findQualityPrompt(id)!.text,
          answer: '',
          verdict: 'running' as const,
          error: null,
          ttftMs: null,
          genMs: null,
          tokensPerS: null,
          attempt: 0,
        })),
      })),
      bank: { builtAt: 'Behavioral probes', sdk: 'quality' },
    };
  }
  /** One streaming chat round-trip through the gateway with TTFT/tokens-per-s. */
  const askQualityOnce = async (
    model: string,
    prompt: string,
    session: string,
    controller: AbortController,
    onDelta: (answer: string) => void,
  ): Promise<{ answer: string; ttftMs: number | null; genMs: number | null; tokensPerS: number | null }> => {
    const startedAt = Date.now();
    const upstream = await fetch(`${gateway.url}/v1/chat/completions`, {
      method: 'POST',
      headers: gateway.headers({
        'content-type': 'application/json',
        'X-Magpie-Session': session,
      }),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: QUALITY_MAX_TOKENS,
      }),
      signal: controller.signal,
      redirect: 'error',
      timeout: false,
    });
    if (!upstream.ok || !upstream.body)
      throw new Error(
        upstream.ok ? 'Empty response body' : `Magpie returned HTTP ${upstream.status}.`,
      );
    let answer = '',
      ttftMs: number | null = null,
      firstAt = 0,
      lineBuffer = '';
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (ttftMs == null) {
          ttftMs = Date.now() - startedAt;
          firstAt = Date.now();
        }
        lineBuffer += decoder.decode(chunk.value, { stream: true });
        let newline: number;
        while ((newline = lineBuffer.indexOf('\n')) >= 0) {
          const line = lineBuffer.slice(0, newline).trim();
          lineBuffer = lineBuffer.slice(newline + 1);
          if (!line.startsWith('data:')) continue;
          try {
            const event = JSON.parse(line.slice(5));
            const delta = event.choices?.[0]?.delta?.content;
            if (typeof delta === 'string') {
              answer += delta;
              onDelta(answer);
            }
          } catch {
            /* SSE metadata and [DONE] are not answer text. */
          }
        }
        if (answer.length > 400000) throw new Error('Probe answer exceeded the size limit.');
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const genMs = ttftMs == null ? null : Math.max(1, Date.now() - firstAt);
    const tokensPerS =
      genMs && answer.length ? Math.round(((answer.length / 4) * 1000) / genMs) : null;
    return { answer, ttftMs, genMs, tokensPerS };
  };
  async function runQualityJob(job: Job) {
    const controller = new AbortController();
    active.set(job.id, controller);
    const timer = setTimeout(
      () => controller.abort(new Error('Job deadline exceeded')),
      job.config.deadlineSeconds * 1000,
    );
    job.state = 'running';
    await persist(job);
    try {
      if (opt.demo) {
        job.demo = true;
        for (const r of job.results) {
          r.state = 'running';
          for (const probe of r.probes || []) {
            if (controller.signal.aborted) break;
            probe.attempt = 1;
            emit(job);
            await Bun.sleep(300);
            Object.assign(probe, {
              answer:
                probe.id === 'milk'
                  ? 'The average adult height is **46.24 inches**.'
                  : '(Demo answer; no measurement.)',
              verdict: probe.id === 'milk' ? 'passed' : 'manual',
              error: null,
              ttftMs: 650,
              genMs: 2100,
              tokensPerS: 48,
              repeatHits: probe.id === 'repeat' ? repeatCoverage('') : undefined,
            } satisfies Partial<ProbeResult>);
            emit(job);
          }
          r.state = controller.signal.aborted ? 'cancelled' : 'completed';
          await persist(job);
          if (controller.signal.aborted) break;
        }
        job.state = controller.signal.aborted ? 'cancelled' : 'completed';
        job.finishedAt = new Date().toISOString();
      } else {
        let cursor = 0;
        const worker = async () => {
          while (true) {
            const index = cursor++;
            if (index >= job.results.length) return;
            const result = job.results[index];
            result.state = 'running';
            await persist(job);
            for (const probe of result.probes || []) {
              if (controller.signal.aborted) {
                probe.verdict = 'unavailable';
                continue;
              }
              const prompt = findQualityPrompt(probe.id)!;
              const attempts = prompt.automatic ? MILK_ATTEMPTS : 1;
              for (let attempt = 1; attempt <= attempts; attempt++) {
                probe.attempt = attempt;
                probe.answer = '';
                probe.verdict = 'running';
                probe.error = null;
                await persist(job);
                try {
                  const outcome = await askQualityOnce(
                    result.target.model,
                    prompt.text,
                    `qp-${job.id}-${probe.id}-${attempt}`,
                    controller,
                    (answer) => {
                      probe.answer = answer;
                      emit(job);
                    },
                  );
                  Object.assign(probe, outcome, { error: null });
                  if (prompt.automatic) {
                    const verdict = grade(probe.id, probe.answer);
                    if (verdict === 'passed' || attempt === attempts) {
                      probe.verdict = verdict;
                      probe.needsReview = verdict === 'failed';
                    } else continue; // One independent retest before review.
                  } else {
                    probe.verdict = 'manual';
                    if (probe.id === 'repeat') probe.repeatHits = repeatCoverage(probe.answer);
                  }
                  break;
                } catch (e) {
                  probe.error = gateway.redact(e);
                  probe.verdict = 'unavailable';
                  if (prompt.automatic && attempt < attempts && !controller.signal.aborted)
                    continue;
                  break;
                }
              }
              await persist(job);
            }
            result.state = controller.signal.aborted
              ? 'cancelled'
              : (result.probes || []).some((p) => p.verdict === 'unavailable')
                ? 'failed'
                : 'completed';
            await persist(job);
          }
        };
        await Promise.all(
          Array.from(
            { length: Math.min(Math.max(1, job.config.targetParallel), job.results.length) },
            worker,
          ),
        );
        job.finishedAt = new Date().toISOString();
        job.state = controller.signal.aborted
          ? 'cancelled'
          : job.results.some((r) => r.state === 'failed')
            ? 'failed'
            : 'completed';
      }
    } catch (e) {
      job.state = controller.signal.aborted ? 'cancelled' : 'failed';
      job.error = gateway.redact(e);
      job.finishedAt = new Date().toISOString();
    } finally {
      clearTimeout(timer);
      active.delete(job.id);
      for (const r of job.results)
        for (const p of r.probes || [])
          if (p.verdict === 'running') p.verdict = 'unavailable';
      await persist(job);
    }
  }
  const uiDir =
    opt.uiDir || resolve(import.meta.dir, import.meta.dir.endsWith('/src') ? '../dist/ui' : 'ui');
  let server: ReturnType<typeof Bun.serve>;
  let initialized = Promise.resolve();
  try {
    server = Bun.serve({
      hostname: '127.0.0.1',
      port: opt.port,
      idleTimeout: 0,
      async fetch(req) {
        const url = new URL(req.url);
        const own = `127.0.0.1:${server.port}`;
        const host = req.headers.get('host');
        if (host !== own && host !== `localhost:${server.port}`)
          return new Response('Invalid host', { status: 403 });
        const origin = req.headers.get('origin');
        if (
          origin &&
          origin !== 'null' &&
          origin !== `http://${own}` &&
          origin !== `http://localhost:${server.port}`
        )
          return new Response('Invalid origin', { status: 403 });
        const cors: Record<string, string> = {
          'access-control-allow-origin': origin || '*',
          'access-control-allow-headers': 'Authorization, Content-Type',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
          vary: 'Origin',
          'cache-control': 'no-store',
        };
        if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
        if (url.pathname === '/_fingerprint/health' && req.method === 'GET')
          return json(serviceIdentity(opt), 200, cors);
        await initialized;
        const api = url.pathname.startsWith('/api/');
        if (api && !equal(req.headers.get('authorization')?.replace(/^Bearer /, '') || '', token))
          return json({ error: 'Unauthorized' }, 401, cors);
        try {
          let response: Response;
          if (api) {
            const path = url.pathname;
            if (path === '/api/bootstrap' && req.method === 'GET') {
              const [cat] = await Promise.all([catalog(), ensureDetector()]);
              response = json({
                version: VERSION,
                demo: opt.demo,
                ...cat,
                jobs: store.list(),
                bank: opt.demo
                  ? { builtAt: 'Demo reference data', modelCount: 64 }
                  : detector
                    ? { builtAt: detector.builtAt, modelCount }
                    : null,
                gateway: {
                  url: opt.gateway,
                  reachable: opt.demo || !catalogError,
                  ...(catalogError ? { error: catalogError } : {}),
                },
                autorun,
                qualityPrompts: QUALITY_PROMPTS.map(({ id, name, automatic }) => ({
                  id,
                  name,
                  automatic,
                })),
                ...(bankError ? { bankError } : {}),
              });
            } else if (path === '/api/models' && req.method === 'GET')
              response = json(await catalog());
            else if (path === '/api/jobs' && req.method === 'GET') response = json(store.list());
            else if (path === '/api/jobs' && req.method === 'POST') {
              if (Number(req.headers.get('content-length') || 0) > 16384)
                return json({ error: 'Request too large' }, 413, cors);
              const text = await boundedText(req, 16384);
              const config = JSON.parse(text) as RunConfig;
              response = json(await startJob(config), 202);
            } else if (path === '/api/autorun' && req.method === 'GET') response = json(autorun);
            else if (path === '/api/autorun' && req.method === 'PUT') {
              if (Number(req.headers.get('content-length') || 0) > 4096)
                return json({ error: 'Request too large' }, 413, cors);
              const next = normalizeAutoRun(JSON.parse(await boundedText(req, 4096)));
              if (!next) return json({ error: 'Invalid auto-run settings.' }, 400, cors);
              await catalog();
              const known = new Set(models.map((m) => m.id));
              next.models = next.models.filter((m) => known.has(m));
              autorun = scheduleAutoRun(next);
              await saveAutorun();
              scheduler.reschedule();
              response = json(autorun);
            } else if (path === '/api/autorun/run' && req.method === 'POST') {
              const job = await startAutoJob();
              await scheduler.markRan();
              response = json(job, 202);
            } else if (path === '/api/reload-data' && req.method === 'POST') {
              await ensureDetector(true);
              response = json({
                bank: detector ? { builtAt: detector.builtAt } : null,
                error: bankError || undefined,
              });
            } else {
              const m = path.match(/^\/api\/jobs\/([\w-]+)(?:\/(cancel|events|export|review))?$/);
              const job = m ? store.jobs.get(m[1]) : undefined;
              if (!job) return json({ error: 'Job not found' }, 404, cors);
              if (m![2] === 'cancel' && req.method === 'POST') {
                active.get(job.id)?.abort(new Error('Cancelled by user'));
                response = json(job);
              } else if (m![2] === 'review' && req.method === 'POST') {
                if (Number(req.headers.get('content-length') || 0) > 4096)
                  return json({ error: 'Request too large' }, 413, cors);
                const body = JSON.parse(await boundedText(req, 4096)) as {
                  targetId?: string;
                  probeIndex?: number;
                  review?: string;
                  note?: string;
                };
                const result = job.results.find((r) => r.id === body.targetId);
                const probe =
                  result?.probes?.[
                    Number.isInteger(body.probeIndex) && body.probeIndex! >= 0
                      ? body.probeIndex!
                      : -1
                  ];
                if (!probe)
                  return json({ error: 'Probe not found' }, 404, cors);
                if (body.review !== 'accepted' && body.review !== 'rejected')
                  return json({ error: 'review must be accepted or rejected' }, 400, cors);
                probe.review = body.review;
                probe.reviewNote =
                  typeof body.note === 'string' ? body.note.slice(0, 2000) : undefined;
                probe.reviewedAt = new Date().toISOString();
                await persist(job);
                response = json(job);
              } else if (m![2] === 'export' && req.method === 'GET')
                response = new Response(
                  JSON.stringify({ schema: 'magpie-fingerprint/v1', ...job }, null, 2),
                  {
                    headers: {
                      'content-type': 'application/json',
                      'content-disposition': `attachment; filename="fingerprint-${job.id}.json"`,
                    },
                  },
                );
              else if (m![2] === 'events' && req.method === 'GET') {
                if ((listeners.get(job.id)?.size || 0) >= 6)
                  return json({ error: 'Too many event subscribers.' }, 429, cors);
                const encoder = new TextEncoder();
                let release = () => {};
                const stream = new ReadableStream<Uint8Array>({
                  start(out) {
                    let finished = false;
                    let beat: ReturnType<typeof setInterval> | undefined;
                    const send = (j: Job) => {
                      if (finished || ((out.desiredSize ?? 0) <= 0 && !isTerminal(j))) return;
                      try {
                        out.enqueue(
                          encoder.encode(`event: snapshot\ndata: ${JSON.stringify(j)}\n\n`),
                        );
                        if (isTerminal(j)) {
                          finished = true;
                          release();
                          out.close();
                        }
                      } catch {
                        finished = true;
                        release();
                      }
                    };
                    const set = listeners.get(job.id) || new Set();
                    set.add(send);
                    listeners.set(job.id, set);
                    release = () => {
                      if (beat) clearInterval(beat);
                      set.delete(send);
                      if (!set.size) listeners.delete(job.id);
                    };
                    beat = setInterval(() => {
                      if (!finished && (out.desiredSize ?? 0) > 0)
                        try {
                          out.enqueue(encoder.encode(': heartbeat\n\n'));
                        } catch {
                          finished = true;
                          release();
                        }
                    }, 15000);
                    req.signal.addEventListener(
                      'abort',
                      () => {
                        finished = true;
                        release();
                        try {
                          out.close();
                        } catch {}
                      },
                      { once: true },
                    );
                    send(job);
                  },
                  cancel() {
                    release();
                  },
                });
                response = new Response(stream, {
                  headers: { 'content-type': 'text/event-stream', 'x-accel-buffering': 'no' },
                });
              } else if (!m![2] && req.method === 'GET') response = json(job);
              else if (!m![2] && req.method === 'DELETE') {
                if (active.has(job.id))
                  return json({ error: 'Cancel the running batch before deleting it.' }, 409, cors);
                await store.remove(job.id);
                response = json({ ok: true });
              } else response = json({ error: 'Method not allowed' }, 405);
            }
            for (const [k, v] of Object.entries(cors)) response.headers.set(k, v);
            return response;
          }
          if (req.method !== 'GET' && req.method !== 'HEAD')
            return new Response('Method not allowed', { status: 405 });
          if (url.pathname === '/' || url.pathname === '/index.html') {
            const uiOrigin = url.searchParams.get('uiOrigin');
            if (uiOrigin) {
              const parsed = new URL(uiOrigin);
              if (
                !['http:', 'https:'].includes(parsed.protocol) ||
                parsed.hostname.includes('*') ||
                parsed.origin !== uiOrigin
              )
                throw new Error('Invalid UI origin.');
            }
            const connectSources = [
              ...new Set([`http://${host}`, ...(uiOrigin ? [uiOrigin] : [])]),
            ];
            let html = await readFile(join(uiDir, 'index.html'), 'utf8').catch(
              () =>
                '<!doctype html><title>Build required</title><p>Run bun run build to create the Fingerprint interface.</p>',
            );
            const boot = JSON.stringify({
              token,
              initialProvider: url.searchParams.get('provider') || '',
              theme: url.searchParams.get('theme') || '',
              lang: url.searchParams.get('lang') || '',
            }).replaceAll('<', '\\u003c');
            const nonce = randomBytes(16).toString('base64');
            html = html.replace(
              '</head>',
              `<script nonce="${nonce}">window.__FINGERPRINT__=${boot}</script></head>`,
            );
            return new Response(html, {
              headers: {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
                'referrer-policy': 'no-referrer',
                'x-content-type-options': 'nosniff',
                // Opaque sandbox origins cannot reliably match 'self'. The
                // launcher supplies the HTTP(S) origin of Magpie's proxy;
                // it affects this document's CSP only, never API admission.
                'content-security-policy': `default-src 'self'; connect-src 'self' ${connectSources.join(' ')}; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'`,
              },
            });
          }
          const decoded = decodeURIComponent(url.pathname);
          const file = resolve(uiDir, `.${decoded}`);
          if (!file.startsWith(`${resolve(uiDir)}/`) || decoded.includes('..'))
            return new Response('Not found', { status: 404 });
          const asset = Bun.file(file);
          if (!(await asset.exists())) return new Response('Not found', { status: 404 });
          const mime: Record<string, string> = {
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.woff2': 'font/woff2',
          };
          return new Response(asset, {
            headers: {
              'content-type': mime[extname(file)] || 'application/octet-stream',
              'access-control-allow-origin': '*',
              'x-content-type-options': 'nosniff',
            },
          });
        } catch (e) {
          const status = (e as { status?: number }).status;
          return json(
            { error: gateway.redact(e) },
            e instanceof BodyTooLargeError
              ? 413
              : status && status >= 400 && status < 500
                ? status
                : 400,
            cors,
          );
        }
      },
    });
  } catch (e) {
    transport.stop(true);
    throw e;
  }
  initialized = (async () => {
    // Only the process that owns the listening port may repair persisted jobs.
    await store.load();
    if (opt.demo && !store.jobs.size) {
      const job = demoHistory();
      store.jobs.set(job.id, job);
    }
    // A persisted schedule beats the manifest defaults; ignore damaged files.
    try {
      const saved = normalizeAutoRun(JSON.parse(await readFile(autorunPath, 'utf8')));
      if (saved) autorun = scheduleAutoRun(saved);
    } catch {
      /* First run, or the settings file was unreadable: keep the defaults. */
    }
    scheduler.reschedule();
  })();
  try {
    await initialized;
  } catch (error) {
    server.stop(true);
    transport.stop(true);
    throw error;
  }
  return {
    port: server.port,
    demo: opt.demo,
    async close() {
      if (closed) return;
      closed = true;
      scheduler.stop();
      for (const c of active.values()) c.abort(new Error('Plugin service stopped'));
      while (active.size) await Bun.sleep(20);
      await store.flush();
      server.stop(true);
      transport.stop(true);
    },
  };
}
