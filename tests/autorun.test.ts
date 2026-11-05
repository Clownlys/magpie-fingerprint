import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server';
import { AUTORUN_FILE } from '../src/scheduler';
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
  dir = await mkdtemp(join(tmpdir(), 'magpie-fingerprint-autorun-'));
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
test('bootstrap exposes the auto-run schedule', async () => {
  const boot = await (await api('bootstrap')).json();
  expect(boot.autorun).toBeTruthy();
  expect(typeof boot.autorun.enabled).toBe('boolean');
  expect(Array.isArray(boot.autorun.models)).toBe(true);
});
test('saves valid settings, persists them and restarts into the same schedule', async () => {
  const put = await api('autorun', {
    method: 'PUT',
    body: JSON.stringify({
      enabled: true,
      intervalMinutes: 45,
      models: ['openai/gpt-5.5', 'not-in-catalog'],
      effort: '',
    }),
  });
  expect(put.status).toBe(200);
  const saved = await put.json();
  expect(saved.enabled).toBe(true);
  expect(saved.intervalMinutes).toBe(45);
  // Unknown models are dropped so a stale catalog cannot schedule phantom runs.
  expect(saved.models).toEqual(['openai/gpt-5.5']);
  expect(saved.nextRunAt).toBeTruthy();
  const persisted = JSON.parse(await readFile(join(dir, AUTORUN_FILE), 'utf8'));
  expect(persisted.intervalMinutes).toBe(45);
  expect(persisted.nextRunAt).toBe(saved.nextRunAt);
});
test('rejects invalid settings without touching the stored schedule', async () => {
  for (const body of [
    { enabled: true, intervalMinutes: -1, models: [] },
    { enabled: true, intervalMinutes: 10, models: 'gpt' },
    { intervalMinutes: 10, models: [] },
  ]) {
    const put = await api('autorun', { method: 'PUT', body: JSON.stringify(body) });
    expect(put.status).toBe(400);
  }
  const current = await (await api('autorun')).json();
  expect(current.intervalMinutes).toBe(45);
});
test('run-now respects the busy lock and single-model jobs launch', async () => {
  const run = await api('autorun/run', { method: 'POST' });
  expect(run.status).toBe(202);
  const job = await run.json();
  expect(job.config.targets.map((t: any) => t.model)).toEqual(['openai/gpt-5.5']);
  const second = await api('autorun/run', { method: 'POST' });
  expect(second.status).toBe(409);
  await api(`jobs/${job.id}/cancel`, { method: 'POST' });
});
