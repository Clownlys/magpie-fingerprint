import type { AutoRunConfig } from './types';

export const AUTORUN_FILE = 'autorun.json';
const MIN_INTERVAL = 0;
const MAX_INTERVAL = 10080;

/** Sanitize untrusted autorun settings; returns null when fundamentally invalid. */
export function normalizeAutoRun(input: unknown): AutoRunConfig | null {
  if (typeof input !== 'object' || input === null) return null;
  const raw = input as Record<string, unknown>;
  const interval = Number(raw.intervalMinutes);
  if (!Number.isInteger(interval) || interval < MIN_INTERVAL || interval > MAX_INTERVAL)
    return null;
  if (typeof raw.enabled !== 'boolean') return null;
  if (!Array.isArray(raw.models) || raw.models.length > 24) return null;
  const models = [
    ...new Set(
      raw.models
        .filter((m): m is string => typeof m === 'string' && !!m.trim() && m.length <= 256)
        .map((m) => m.trim()),
    ),
  ];
  const effort = typeof raw.effort === 'string' && raw.effort.length <= 64 ? raw.effort : '';
  return {
    enabled: raw.enabled,
    intervalMinutes: interval,
    models,
    effort,
  };
}

function nextRun(config: AutoRunConfig): string | undefined {
  if (!config.enabled || !config.intervalMinutes || !config.models.length) return undefined;
  const base = config.lastRunAt ? Date.parse(config.lastRunAt) : Date.now();
  const from = Number.isFinite(base) ? base : Date.now();
  return new Date(from + config.intervalMinutes * 60_000).toISOString();
}

/** Reconciles nextRunAt after a config or time change. */
export function scheduleAutoRun(config: AutoRunConfig): AutoRunConfig {
  const next = { ...config };
  const scheduled = next.enabled && next.intervalMinutes > 0 && next.models.length > 0;
  if (!scheduled) {
    delete next.nextRunAt;
    return next;
  }
  const pending = next.nextRunAt ? Date.parse(next.nextRunAt) : NaN;
  // Keep a still-future schedule across restarts; otherwise arm one from now.
  next.nextRunAt =
    Number.isFinite(pending) && pending > Date.now()
      ? next.nextRunAt
      : nextRun({ ...next, lastRunAt: undefined });
  return next;
}

/** Background timer that fires when the persisted schedule is due. */
export class AutoRunScheduler {
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private read: () => AutoRunConfig,
    private write: (config: AutoRunConfig) => Promise<void>,
    private fire: () => void,
    private now: () => number = () => Date.now(),
  ) {}
  /** Re-arm from the current config; drops any pending timer first. */
  reschedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const config = this.read();
    if (!config.enabled || !config.intervalMinutes || !config.models.length) return;
    const due = config.nextRunAt ? Date.parse(config.nextRunAt) : this.now();
    const delay = Math.max(1000, (Number.isFinite(due) ? due : this.now()) - this.now());
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.fire();
    }, delay);
    this.timer.unref?.();
  }
  /** Record a finished (or attempted) cycle and re-arm. */
  async markRan() {
    const config = this.read();
    const next = scheduleAutoRun({ ...config, lastRunAt: new Date().toISOString() });
    await this.write(next);
    this.reschedule();
  }
  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
