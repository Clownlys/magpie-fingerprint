import { describe, expect, test } from 'bun:test';
import { AutoRunScheduler, normalizeAutoRun, scheduleAutoRun } from '../src/scheduler';
import type { AutoRunConfig } from '../src/types';

const config = (over: Partial<AutoRunConfig> = {}): AutoRunConfig => ({
  enabled: true,
  intervalMinutes: 60,
  models: ['openai/gpt-5.5'],
  effort: '',
  ...over,
});

describe('normalizeAutoRun', () => {
  test('accepts valid settings and clamps model entries', () => {
    const next = normalizeAutoRun({
      enabled: true,
      intervalMinutes: 30,
      models: [' a/b ', '', 42, 'c/d'],
      effort: 'high',
    })!;
    expect(next.enabled).toBe(true);
    expect(next.intervalMinutes).toBe(30);
    expect(next.models).toEqual(['a/b', 'c/d']);
    expect(next.effort).toBe('high');
  });
  test('rejects invalid intervals, flags and payloads', () => {
    expect(normalizeAutoRun(null)).toBeNull();
    expect(normalizeAutoRun({ enabled: 'yes', intervalMinutes: 10, models: [] })).toBeNull();
    expect(normalizeAutoRun({ enabled: true, intervalMinutes: -5, models: [] })).toBeNull();
    expect(normalizeAutoRun({ enabled: true, intervalMinutes: 20000, models: [] })).toBeNull();
    expect(normalizeAutoRun({ enabled: true, intervalMinutes: 1.5, models: [] })).toBeNull();
    expect(
      normalizeAutoRun({ enabled: true, intervalMinutes: 10, models: Array(25).fill('m') }),
    ).toBeNull();
  });
});

describe('scheduleAutoRun', () => {
  test('clears the schedule when disabled, interval is zero or models are empty', () => {
    for (const next of [
      config({ enabled: false }),
      config({ intervalMinutes: 0 }),
      config({ models: [] }),
    ]) {
      expect(
        scheduleAutoRun({ ...next, nextRunAt: new Date().toISOString() }).nextRunAt,
      ).toBeUndefined();
    }
  });
  test('keeps a still-future schedule across restarts and re-arms overdue ones', () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    expect(scheduleAutoRun(config({ nextRunAt: future })).nextRunAt).toBe(future);
    const overdue = scheduleAutoRun(
      config({ nextRunAt: new Date(Date.now() - 1000).toISOString() }),
    );
    expect(Date.parse(overdue.nextRunAt!)).toBeGreaterThan(Date.now());
  });
});

describe('AutoRunScheduler', () => {
  test('fires when due, records the run and re-arms', async () => {
    let current = config({ nextRunAt: new Date(Date.now() + 20).toISOString() });
    const writes: AutoRunConfig[] = [];
    let fired = 0;
    const scheduler = new AutoRunScheduler(
      () => current,
      async (next) => {
        current = next;
        writes.push(next);
      },
      () => {
        fired++;
        void scheduler.markRan();
      },
      () => Date.now(),
    );
    scheduler.reschedule();
    await Bun.sleep(1400); // Minimum armed delay is one second.
    expect(fired).toBe(1);
    expect(writes[0].lastRunAt).toBeTruthy();
    expect(Date.parse(current.nextRunAt!)).toBeGreaterThan(Date.now());
    scheduler.stop();
  });
  test('never arms when disabled or without models', async () => {
    let fired = 0;
    const scheduler = new AutoRunScheduler(
      () => config({ enabled: false, nextRunAt: new Date(Date.now() + 10).toISOString() }),
      async () => {},
      () => fired++,
    );
    scheduler.reschedule();
    await Bun.sleep(120);
    expect(fired).toBe(0);
    scheduler.stop();
  });
});
