import type { Analysis, Challenge, Sample, Api } from 'lmfpd-sdk';
export type { Analysis, Challenge, Sample, Api };

/** Streaming performance metrics recorded by the sample proxy. */
declare module 'lmfpd-sdk' {
  interface Sample {
    /** Time to first stream byte; mirrors first_byte_ms for display. */
    ttft_ms?: number | null;
    /** Wall time from first stream byte to stream end. */
    gen_ms?: number | null;
    /** Approximate output tokens per second (chars/4 over the generation window). */
    tokens_per_s?: number | null;
  }
}

export interface AutoRunConfig {
  enabled: boolean;
  /** 0 disables scheduled runs; otherwise 1..10080 minutes. */
  intervalMinutes: number;
  /** Model IDs to test each cycle; empty means never auto-run. */
  models: string[];
  effort: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  efforts: string[];
  nativeEndpoints: string[];
}
export interface Account {
  id: string;
  name: string;
  provider: string;
}
export interface Target {
  model: string;
  account?: string;
}
export interface RunConfig {
  targets: Target[];
  api: Api | 'auto';
  effort: string;
  serviceTier: 'default' | 'flex' | 'fast' | 'ultrafast';
  strict: boolean;
  targetParallel: number;
  sampleParallel: number;
  deadlineSeconds: number;
}
export interface Provenance {
  session: string;
  requestedModel: string;
  provider?: string;
  model?: string;
  route?: unknown;
  routeError?: string;
  mismatch?: boolean;
  streamNormalization?: 'chat-done-after-stop';
}
export interface TargetResult {
  id: string;
  target: Target;
  api: Api;
  state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  samples: Sample[];
  provenance: Provenance[];
  analysis: Analysis | null;
  error: string | null;
}
export interface Job {
  id: string;
  createdAt: string;
  finishedAt?: string;
  state: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
  config: RunConfig;
  challenges: Challenge[];
  results: TargetResult[];
  bank: { builtAt: string; sdk: string };
  error?: string;
  demo?: boolean;
}
export interface Bootstrap {
  version: string;
  demo: boolean;
  models: Model[];
  accounts: Account[];
  jobs: Job[];
  bank: { builtAt: string; modelCount?: number } | null;
  gateway: { url: string; reachable: boolean; error?: string };
  bankError?: string;
  autorun: AutoRunConfig;
}
