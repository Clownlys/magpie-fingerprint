import type { Analysis, Job, Model, RunConfig } from './types';
import { generateChallenges } from 'lmfpd-sdk';
export const demoModels: Model[] = [
  {
    id: 'anthropic/claude-sonnet-4.6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    efforts: ['low', 'medium', 'high'],
    nativeEndpoints: ['/v1/messages'],
  },
  {
    id: 'openai/gpt-5.5',
    name: 'GPT-5.5',
    provider: 'openai',
    efforts: ['low', 'medium', 'high'],
    nativeEndpoints: ['/v1/responses'],
  },
  {
    id: 'relay/claude-opus-4.7',
    name: 'Claude Opus 4.7',
    provider: 'relay',
    efforts: ['low', 'medium', 'high'],
    nativeEndpoints: ['/v1/messages'],
  },
  {
    id: 'google/gemini-3.1-pro',
    name: 'Gemini 3.1 Pro',
    provider: 'google',
    efforts: [],
    nativeEndpoints: [],
  },
];
export function demoAnalysis(model: string): Analysis {
  const id = model.split('/').slice(1).join('/');
  const candidates = [id, 'claude-sonnet-4.6', 'gpt-5.4', 'gemini-3.1-pro', 'deepseek-v3.2'].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  return {
    decision: 'scored',
    prediction: id,
    prediction_name: id,
    family_prediction: id.split('-')[0],
    family_prediction_name: id.split('-')[0],
    results: candidates.map((v, i) => ({
      model: v,
      display_name: v,
      family: v.split('-')[0],
      family_name: v.split('-')[0],
      score: 1 - i * 0.17,
      probability: i === 0 ? 0.87 : 0.13 / (candidates.length - 1),
    })),
    ranking_score: 1,
    probability: 0.87,
    probability_status: 'reference_calibrated',
    probability_scope: 'Reference bank candidates only (illustrative demo)',
    calibration: null,
    used_outputs: 3,
    diagnostics: [0, 1, 2].map((index) => ({
      index,
      parsed_numbers: 300,
      minimum_numbers: 165,
      accepted: true,
      raw_out_of_range_count: 0,
    })),
    sequence: null,
    method: 'Illustrative demo; no measurement',
    model_version: { base_sha256: 'demo-not-measured' },
    evidence: {
      insufficient: false,
      label: 'Demo',
      reason: 'Illustrative data only',
      threshold: null,
      method: 'demo',
    },
  };
}
export function demoHistory(): Job {
  const createdAt = new Date(Date.now() - 3600_000).toISOString();
  const config: RunConfig = {
    targets: demoModels.slice(0, 2).map((m) => ({ model: m.id })),
    api: 'auto',
    effort: '',
    serviceTier: 'default',
    strict: false,
    targetParallel: 1,
    sampleParallel: 3,
    deadlineSeconds: 300,
  };
  return {
    id: 'demo-example',
    createdAt,
    finishedAt: createdAt,
    state: 'completed',
    config,
    challenges: generateChallenges(),
    bank: { builtAt: 'Demo reference data', sdk: '0.2.0' },
    demo: true,
    results: config.targets.map((target, i) => ({
      id: `demo-${i}`,
      target,
      api: i ? 'responses' : 'messages',
      state: 'completed',
      samples: [0, 1, 2].map(() => ({
        state: 'complete',
        text: '137, 42, 291, 65, 188',
        raw_text: '137, 42, 291, 65, 188 (illustrative excerpt)',
        count: 300,
        expected_count: 300,
        first_byte_ms: 650,
        ttft_ms: 650,
        gen_ms: 2600,
        tokens_per_s: 42,
        response_model: target.model.split('/')[1],
        response_id: 'demo',
        error: null,
      })),
      provenance: [0, 1, 2].map((n) => ({
        session: `demo-${n}`,
        requestedModel: target.model,
        provider: target.model.split('/')[0],
        model: target.model,
      })),
      analysis: demoAnalysis(target.model),
      error: null,
    })),
  };
}
