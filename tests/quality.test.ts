import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { grade, repeatCoverage, QUALITY_IDS, findQualityPrompt } from '../src/quality';
import { normalizeAutoRun, scheduleAutoRun } from '../src/scheduler';
import { startServer } from '../src/server';
import type { AutoRunConfig } from '../src/types';
let dir: string, base: string, token: string, service: Awaited<ReturnType<typeof startServer>>;
const api = (path: string, init: RequestInit = {}) =>
  fetch(`${base}/api/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  });
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'magpie-fingerprint-quality-'));
  await mkdir(join(dir, 'ui'));
  await writeFile(join(dir, 'ui/index.html'), '<!doctype html><head></head><body>Test</body>');
  service = await startServer({ port: 0, dataDir: dir, uiDir: join(dir, 'ui'), demo: true });
  base = `http://127.0.0.1:${service.port}`;
  const html = await (await fetch(base)).text();
  token = JSON.parse(html.match(/window\.__FINGERPRINT__=(.*?)<\/script>/)![1]).token;
});
afterAll(async () => {
  await service?.close();
  await rm(dir, { recursive: true, force: true });
});
test('prompt bank matches the upstream inventory', () => {
  expect(QUALITY_IDS).toEqual(['milk', 'repeat', 'japan', 'person', 'html', 'svg', 'map']);
  for (const id of QUALITY_IDS) expect(findQualityPrompt(id)!.text.length).toBeGreaterThan(10);
  expect(findQualityPrompt('milk')!.automatic).toBe(true);
});
test('grade auto-scores the milk probe like the upstream rule', () => {
  expect(grade('milk', '46.24')).toBe('passed');
  expect(grade('milk', '**46.24** inches')).toBe('passed');
  expect(grade('milk', '…final answer: 46.24 inches.')).toBe('passed');
  expect(grade('milk', '48 inches')).toBe('failed');
  expect(grade('milk', 'I cannot compute it')).toBe('failed');
  for (const id of ['repeat', 'japan', 'person', 'html', 'svg', 'map'])
    expect(grade(id, 'anything')).toBe('manual');
});
test('repeatCoverage counts verbatim fragment hits', () => {
  const prompt = findQualityPrompt('repeat')!.text;
  expect(repeatCoverage(prompt)).toBe(15);
  expect(repeatCoverage('StarSrvGroupBody and intFragmentation only')).toBe(2);
  expect(repeatCoverage('nothing here')).toBe(0);
});
test('autorun accepts and validates the quality settings', () => {
  const ok = normalizeAutoRun({
    enabled: true,
    intervalMinutes: 15,
    models: [],
    quality: { enabled: true, questions: ['milk', 'svg', 'bogus'] },
  });
  expect(ok).toBeNull(); // Unknown question ids are rejected outright.
  const next = normalizeAutoRun({
    enabled: true,
    intervalMinutes: 15,
    models: [],
    effort: '',
    quality: { enabled: true, questions: ['milk', 'milk', 'svg'] },
  })!;
  expect(next.quality).toEqual({ enabled: true, questions: ['milk', 'svg'] });
  expect(scheduleAutoRun(next).nextRunAt).toBeTruthy(); // Quality-only cycles schedule.
  expect(scheduleAutoRun({ ...next, quality: { enabled: false, questions: [] } }).nextRunAt).toBeUndefined();
});
test('bootstrap exposes the probe inventory', async () => {
  const boot = await (await api('bootstrap')).json();
  expect(boot.qualityPrompts.map((p: any) => p.id)).toEqual(QUALITY_IDS);
});
test('creates a quality job, finishes it in demo and persists reviews', async () => {
  const post = await api('jobs', {
    method: 'POST',
    body: JSON.stringify({
      targets: [{ model: 'openai/gpt-5.5' }],
      api: 'auto',
      effort: '',
      serviceTier: 'default',
      strict: false,
      targetParallel: 1,
      sampleParallel: 1,
      deadlineSeconds: 600,
      questions: ['milk', 'repeat'],
    }),
  });
  expect(post.status).toBe(202);
  const job = await post.json();
  expect(job.kind).toBe('quality');
  expect(job.results[0].probes.map((p: any) => p.id)).toEqual(['milk', 'repeat']);
  await Bun.sleep(1600);
  const finished = await (await api(`jobs/${job.id}`)).json();
  expect(finished.state).toBe('completed');
  expect(finished.results[0].probes[0].verdict).toBe('passed');
  expect(finished.results[0].probes[1].verdict).toBe('manual');
  const bad = await api('jobs', {
    method: 'POST',
    body: JSON.stringify({
      targets: [{ model: 'openai/gpt-5.5' }],
      api: 'auto',
      effort: '',
      serviceTier: 'default',
      strict: false,
      targetParallel: 1,
      sampleParallel: 1,
      deadlineSeconds: 600,
      questions: ['no-such-probe'],
    }),
  });
  expect(bad.status).toBe(400);
  const review = await api(`jobs/${job.id}/review`, {
    method: 'POST',
    body: JSON.stringify({ targetId: finished.results[0].id, probeIndex: 1, review: 'accepted' }),
  });
  expect(review.status).toBe(200);
  const reviewed = await review.json();
  expect(reviewed.results[0].probes[1].review).toBe('accepted');
  expect(reviewed.results[0].probes[1].reviewedAt).toBeTruthy();
  const badReview = await api(`jobs/${job.id}/review`, {
    method: 'POST',
    body: JSON.stringify({ targetId: finished.results[0].id, probeIndex: 1, review: 'maybe' }),
  });
  expect(badReview.status).toBe(400);
});
