import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowClockwise,
  CaretDown,
  CheckCircle,
  CircleNotch,
  Clipboard,
  ClockCounterClockwise,
  DownloadSimple,
  Lightning,
  List,
  MagnifyingGlass,
  Moon,
  Monitor,
  Play,
  Stop,
  Sun,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import type { Bootstrap, Job, Model, RunConfig, Target, TargetResult } from '../src/types';
import { embedded, subscribeTheme } from './magpie';
import './vendor/magpie-ui.css';
import './style.css';

declare global {
  interface Window {
    __FINGERPRINT__?: { token?: string; initialProvider?: string; theme?: string; lang?: string };
  }
}
const apiUrl = (path: string) => new URL(path.replace(/^\//, ''), document.baseURI).toString();
const token = () => window.__FINGERPRINT__?.token;
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (token()) headers.set('Authorization', `Bearer ${token()}`);
  if (init?.body) headers.set('content-type', 'application/json');
  const r = await fetch(apiUrl(path), { ...init, headers });
  if (r.status === 401) location.reload();
  if (!r.ok) {
    const data = await r.json().catch(() => null);
    throw new Error(data?.error || `${r.status} ${r.statusText}`);
  }
  return r.json();
}
const zh = {
  overview: '总览',
  detect: '指纹检测',
  history: '检测历史',
  settings: '运行设置',
  ready: '服务已连接',
  offline: '服务离线',
  start: '开始检测',
  cancel: '取消任务',
  search: '搜索模型',
  selected: '已选择',
  noModels: '暂无可用模型',
  provider: '提供商',
  model: '模型',
  account: '账号',
  protocol: '协议',
  effort: '推理强度',
  tier: '服务等级',
  strict: '完整样本',
  targetParallel: '模型并行',
  sampleParallel: '样本并行',
  deadline: '超时（秒）',
  estimated: '预计请求',
  live: '实时进度',
  results: '检测结果',
  candidates: '候选排名',
  details: '样本详情',
  export: '导出 JSON',
  demo: '示例数据',
  clear: '清空选择',
  completed: '已完成',
  running: '运行中',
  failed: '失败',
  queued: '排队中',
  cancelled: '已取消',
  autorun: '定时检测',
  autorunEnable: '启用定时检测',
  autorunInterval: '间隔（分钟）',
  autorunModels: '检测模型（逗号分隔）',
  autorunApply: '保存设置',
  autorunSaved: '定时设置已保存',
  autorunNext: '下次检测',
  autorunLast: '上次检测',
  autorunNever: '未启用',
  runNow: '立即检测',
  ttft: '首字',
  tokensPerS: 'token/s',
  verdict: '指纹结论',
  confidence: '置信度',
  lastRun: '最近检测',
  trend: '对比上次',
  trendUp: '置信度上升',
  trendDown: '置信度下降',
  trendFlat: '基本持平',
  noData: '未检测',
  qualityTab: '降智速测',
  fingerprintMode: '指纹检测',
  qualityMode: '降智速测',
  questions: '探针题目',
  auto: '自动判分',
  manual: '人工复核',
  qualityIntro: '用行为探针快速判断模型是否降智；牛奶题为自动判分，其余需人工复核。',
  probePassed: '通过',
  probeFailed: '未通过',
  probeManual: '待复核',
  probeUnavailable: '不可用',
  accepted: '复核通过',
  rejected: '复核驳回',
  reviewAccept: '通过',
  reviewReject: '驳回',
  repeatHits: '复述命中',
  needsReview: '需复核',
  answer: '回答原文',
  quality: '降智',
  autorunQuality: '定时降智速测',
};
const en = {
  overview: 'Overview',
  detect: 'Fingerprint',
  history: 'History',
  settings: 'Run settings',
  ready: 'Service connected',
  offline: 'Service offline',
  start: 'Start detection',
  cancel: 'Cancel job',
  search: 'Search models',
  selected: 'selected',
  noModels: 'No models available',
  provider: 'Provider',
  model: 'Model',
  account: 'Account',
  protocol: 'Protocol',
  effort: 'Reasoning effort',
  tier: 'Service tier',
  strict: 'Complete samples',
  targetParallel: 'Model parallelism',
  sampleParallel: 'Sample parallelism',
  deadline: 'Deadline (sec)',
  estimated: 'Estimated requests',
  live: 'Live progress',
  results: 'Results',
  candidates: 'Candidate ranking',
  details: 'Sample details',
  export: 'Export JSON',
  demo: 'Demo data',
  clear: 'Clear selection',
  completed: 'Completed',
  running: 'Running',
  failed: 'Failed',
  queued: 'Queued',
  cancelled: 'Cancelled',
  autorun: 'Auto-run',
  autorunEnable: 'Enable scheduled detection',
  autorunInterval: 'Interval (minutes)',
  autorunModels: 'Models (comma-separated)',
  autorunApply: 'Save settings',
  autorunSaved: 'Auto-run settings saved',
  autorunNext: 'Next run',
  autorunLast: 'Last run',
  autorunNever: 'Disabled',
  runNow: 'Run now',
  ttft: 'TTFT',
  tokensPerS: 'tok/s',
  verdict: 'Verdict',
  confidence: 'Confidence',
  lastRun: 'Last check',
  trend: 'vs previous',
  trendUp: 'Confidence up',
  trendDown: 'Confidence down',
  trendFlat: 'Stable',
  noData: 'Not tested',
  qualityTab: 'Quality',
  fingerprintMode: 'Fingerprint',
  qualityMode: 'Quality probes',
  questions: 'Probe questions',
  auto: 'Auto-graded',
  manual: 'Manual review',
  qualityIntro:
    'Behavioral probes for quick degradation checks; the milk puzzle is auto-graded, others need human review.',
  probePassed: 'Passed',
  probeFailed: 'Failed',
  probeManual: 'Needs review',
  probeUnavailable: 'Unavailable',
  accepted: 'Accepted',
  rejected: 'Rejected',
  reviewAccept: 'Accept',
  reviewReject: 'Reject',
  repeatHits: 'Repeat hits',
  needsReview: 'Needs review',
  answer: 'Answer',
  quality: 'Quality',
  autorunQuality: 'Scheduled quality probes',
};

const terminal = (state: string) => !['queued', 'running'].includes(state);
const integerInRange = (value: unknown, min: number, max: number) =>
  Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
const stateLabel = (t: typeof zh, state: string) =>
  ({
    completed: t.completed,
    running: t.running,
    failed: t.failed,
    queued: t.queued,
    cancelled: t.cancelled,
    interrupted: t === zh ? '已中断' : 'Interrupted',
    scored: t === zh ? '已评分' : 'Scored',
    partial: t === zh ? '部分样本' : 'Partial',
    unscorable: t === zh ? '不可评分' : 'Unscorable',
    not_model: t === zh ? '序列不符合检测假设' : 'Unexpected sequence',
    complete: t === zh ? '完成' : 'Complete',
    truncated: t === zh ? '已截断' : 'Truncated',
    waiting: t === zh ? '等待响应' : 'Waiting',
    streaming: t === zh ? '接收中' : 'Streaming',
  })[state] || state;
function App() {
  const [lang, setLang] = useState<'zh' | 'en'>(() => {
    try {
      return (
        (!embedded && (localStorage.getItem('fp-lang') as 'zh' | 'en')) ||
        (window.__FINGERPRINT__?.lang?.startsWith('en') ? 'en' : 'zh')
      );
    } catch {
      return window.__FINGERPRINT__?.lang?.startsWith('en') ? 'en' : 'zh';
    }
  });
  const t = lang === 'zh' ? zh : en;
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    try {
      return (
        (!embedded && (localStorage.getItem('fp-theme') as any)) ||
        window.__FINGERPRINT__?.theme ||
        'system'
      );
    } catch {
      return (window.__FINGERPRINT__?.theme as 'light' | 'dark') || 'system';
    }
  });
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState('');
  const [section, setSection] = useState<'overview' | 'detect' | 'history'>('overview');
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<Job[]>([]);
  const [query, setQuery] = useState('');
  const [provider, setProvider] = useState('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [account, setAccount] = useState('');
  const [config, setConfig] = useState({
    api: 'auto',
    effort: '',
    serviceTier: 'default',
    strict: false,
    targetParallel: 2,
    sampleParallel: 3,
    deadlineSeconds: 300,
  } as any);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [detectMode, setDetectMode] = useState<'fingerprint' | 'quality'>('fingerprint');
  const [qualityQs, setQualityQs] = useState<string[]>(['milk']);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const configValid =
    integerInRange(config.targetParallel, 1, 3) &&
    integerInRange(config.sampleParallel, 1, 3) &&
    integerInRange(config.deadlineSeconds, 10, 900);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const paint = () => {
      document.documentElement.dataset.theme =
        theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
    };
    paint();
    media.addEventListener('change', paint);
    try {
      if (!embedded) localStorage.setItem('fp-theme', theme);
    } catch {}
    return () => media.removeEventListener('change', paint);
  }, [theme]);
  useEffect(() => {
    if (!embedded) document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    try {
      if (!embedded) localStorage.setItem('fp-lang', lang);
    } catch {}
  }, [lang]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent) return;
      const m = e.data;
      if (m?.magpie === 1 && m.event === 'action' && m.data?.provider?.id) {
        setProvider(m.data.provider.id);
        setSection('detect');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  useEffect(
    () =>
      subscribeTheme((next) => {
        setTheme(next.dark ? 'dark' : 'light');
        setLang(next.lang?.startsWith('zh') ? 'zh' : 'en');
      }),
    [],
  );
  const load = async () => {
    setError('');
    try {
      const b = await api<Bootstrap>('api/bootstrap');
      setBoot(b);
      setHistory(b.jobs || []);
      setJob((current) => current || b.jobs.find((j) => !terminal(j.state)) || null);
      if (window.__FINGERPRINT__?.initialProvider)
        setProvider(window.__FINGERPRINT__.initialProvider);
      setError(b.gateway.error || b.bankError || '');
    } catch (e) {
      setError(String(e));
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!job || terminal(job.state)) return;
    const controller = new AbortController();
    const id = job.id;
    const watch = async () => {
      let done = false;
      while (!controller.signal.aborted && !done) {
        try {
          const response = await fetch(apiUrl(`api/jobs/${id}/events`), {
            headers: { Authorization: `Bearer ${token()}` },
            signal: controller.signal,
          });
          if (response.status === 401) location.reload();
          if (!response.ok || !response.body)
            throw new Error(`Progress connection: HTTP ${response.status}`);
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          try {
            while (!controller.signal.aborted) {
              const part = await reader.read();
              if (part.done) break;
              buffer += decoder.decode(part.value, { stream: true });
              let split: number;
              while ((split = buffer.indexOf('\n\n')) >= 0) {
                const event = buffer.slice(0, split);
                buffer = buffer.slice(split + 2);
                const data = event.split('\n').find((line) => line.startsWith('data: '));
                if (!data) continue;
                const next = JSON.parse(data.slice(6)) as Job;
                setJob((current) => (current?.id === id ? next : current));
                setHistory((list) => [next, ...list.filter((j) => j.id !== id)]);
                done = terminal(next.state);
              }
            }
          } finally {
            await reader.cancel().catch(() => {});
          }
        } catch (e) {
          if (!controller.signal.aborted) setError(String(e));
        }
        if (!done && !controller.signal.aborted)
          await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    };
    void watch();
    return () => controller.abort();
  }, [job?.id]);
  const models = boot?.models || [];
  const providers = useMemo(
    () => ['all', ...Array.from(new Set(models.map((m) => m.provider)))],
    [models],
  );
  const filtered = models.filter(
    (m) =>
      (provider === 'all' || m.provider === provider) &&
      `${m.name} ${m.id}`.toLowerCase().includes(query.toLowerCase()),
  );
  const selectedModels = models.filter((m) => selected.includes(m.id));
  const effortChoices =
    selectedModels[0]?.efforts.filter((effort) =>
      selectedModels.every((model) => model.efforts.includes(effort)),
    ) || [];
  const effort = effortChoices.includes(config.effort) ? config.effort : '';
  const estimate =
    detectMode === 'quality' ? selected.length * qualityQs.length : selected.length * 3;
  const toggle = (id: string) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length < 24 ? [...s, id] : s,
    );
  const setField = (k: string, v: any) => setConfig((c: any) => ({ ...c, [k]: v }));
  const start = async () => {
    if (!selected.length || starting) return;
    if (account && new Set(selectedModels.map((m) => m.provider)).size > 1) {
      setError(
        lang === 'zh'
          ? '固定账号时请只选择同一提供商的模型。'
          : 'Select models from one provider when pinning an account.',
      );
      return;
    }
    setStarting(true);
    setError('');
    const qualityMode = detectMode === 'quality';
    const cfg: RunConfig = {
      targets: selected.map((model) => ({ model, ...(account ? { account } : {}) })),
      api: config.api,
      effort: qualityMode ? '' : effort,
      serviceTier: config.serviceTier,
      strict: config.strict,
      targetParallel: Number(config.targetParallel),
      sampleParallel: Number(config.sampleParallel),
      deadlineSeconds: qualityMode ? 600 : Number(config.deadlineSeconds),
      ...(qualityMode ? { questions: qualityQs } : {}),
    };
    try {
      const j = await api<Job>('api/jobs', { method: 'POST', body: JSON.stringify(cfg) });
      setJob(j);
      setHistory((h) => [j, ...h.filter((x) => x.id !== j.id)]);
      setExpanded(j.results[0]?.id || null);
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  };
  // Persist a human review verdict for a manual quality probe.
  const reviewProbe = async (
    jobId: string,
    targetId: string,
    probeIndex: number,
    review: 'accepted' | 'rejected',
  ) => {
    try {
      const x = await api<Job>(`api/jobs/${jobId}/review`, {
        method: 'POST',
        body: JSON.stringify({ targetId, probeIndex, review }),
      });
      setJob((current) => (current?.id === x.id ? x : current));
      setHistory((list) => list.map((j) => (j.id === x.id ? x : j)));
    } catch (e) {
      setError(String(e));
    }
  };
  const cancel = async () => {
    if (!job) return;
    try {
      const x = await api<Job>(`api/jobs/${job.id}/cancel`, { method: 'POST' });
      setJob(x);
    } catch (e) {
      setError(String(e));
    }
  };
  const download = async () => {
    if (!job) return;
    try {
      const r = await fetch(apiUrl(`api/jobs/${job.id}/export`), {
        headers: token() ? { Authorization: `Bearer ${token()}` } : {},
      });
      if (!r.ok) throw new Error('Export failed');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `fingerprint-${job.id}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) {
      setError(String(e));
    }
  };
  const deleteJob = async (id: string) => {
    try {
      await api(`api/jobs/${id}`, { method: 'DELETE' });
      setHistory((h) => h.filter((x) => x.id !== id));
      if (job?.id === id) setJob(null);
    } catch (e) {
      setError(String(e));
    }
  };
  // One-model quick detection from the overview dashboard.
  const runOne = async (model: string, questions?: string[]) => {
    if (starting || history.some((j) => !terminal(j.state))) return;
    setStarting(true);
    setError('');
    try {
      const j = await api<Job>('api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          targets: [{ model }],
          api: 'auto',
          effort: '',
          serviceTier: 'default',
          strict: false,
          targetParallel: 1,
          sampleParallel: questions ? 1 : 3,
          deadlineSeconds: questions ? 600 : 300,
          ...(questions ? { questions } : {}),
        } satisfies RunConfig),
      });
      setJob(j);
      setHistory((h) => [j, ...h.filter((x) => x.id !== j.id)]);
      setExpanded(j.results[0]?.id || null);
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
    }
  };
  return (
    <div className={`app-shell ${embedded ? 'embedded' : 'standalone'}`}>
      {!embedded && <h1 className="standalone-title">Fingerprint</h1>}
      <div className="page-tools">
        <nav
          className="segs"
          aria-label={lang === 'zh' ? '指纹检测视图' : 'Fingerprint views'}
          role="tablist"
          onKeyDown={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
              e.preventDefault();
              const order: Array<'overview' | 'detect' | 'history'> = [
                'overview',
                'detect',
                'history',
              ];
              const index = order.indexOf(section);
              const next =
                e.key === 'Home'
                  ? order[0]
                  : e.key === 'End'
                    ? order[order.length - 1]
                    : order[
                        (index + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length
                      ];
              setSection(next);
              document.getElementById(`tab-${next}`)?.focus();
            }
          }}
        >
          <button
            className={`opt ${section === 'overview' ? 'on' : ''}`}
            id="tab-overview"
            role="tab"
            aria-selected={section === 'overview'}
            aria-controls="fingerprint-panel"
            tabIndex={section === 'overview' ? 0 : -1}
            onClick={() => setSection('overview')}
          >
            {t.overview}
          </button>
          <button
            className={`opt ${section === 'detect' ? 'on' : ''}`}
            id="tab-detect"
            role="tab"
            aria-selected={section === 'detect'}
            aria-controls="fingerprint-panel"
            tabIndex={section === 'detect' ? 0 : -1}
            onClick={() => setSection('detect')}
          >
            {t.detect}
          </button>
          <button
            className={`opt ${section === 'history' ? 'on' : ''}`}
            id="tab-history"
            role="tab"
            aria-selected={section === 'history'}
            aria-controls="fingerprint-panel"
            tabIndex={section === 'history' ? 0 : -1}
            onClick={() => setSection('history')}
          >
            {t.history}
            {history.length > 0 && <span className="tab-count">{history.length}</span>}
          </button>
        </nav>
        <div className="page-status">
          {boot?.demo ? (
            <span className="badge">{t.demo}</span>
          ) : (
            <span className="service-dot" role="status">
              <i className={boot?.gateway.reachable ? '' : 'bad'} />
              {!boot
                ? error
                  ? t.offline
                  : lang === 'zh'
                    ? '正在连接…'
                    : 'Connecting…'
                : boot.gateway.reachable
                  ? t.ready
                  : t.offline}
            </span>
          )}
          <button
            className="icon icon-button"
            onClick={load}
            aria-label={lang === 'zh' ? '刷新模型与检测历史' : 'Refresh models and history'}
            title={lang === 'zh' ? '刷新' : 'Refresh'}
          >
            <ArrowClockwise size={15} />
          </button>
          {!embedded && (
            <>
              <button className="text" onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}>
                {lang === 'zh' ? 'EN' : '中文'}
              </button>
              <button
                className="icon icon-button"
                aria-label={lang === 'zh' ? `主题：${theme}` : `Theme: ${theme}`}
                onClick={() =>
                  setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
                }
              >
                {theme === 'system' ? (
                  <Monitor size={15} />
                ) : theme === 'dark' ? (
                  <Moon size={15} />
                ) : (
                  <Sun size={15} />
                )}
              </button>
            </>
          )}
        </div>
      </div>
      <main
        className="main"
        id="fingerprint-panel"
        role="tabpanel"
        aria-labelledby={`tab-${section}`}
      >
        {error && (
          <div className="notice error" role="alert">
            <WarningCircle size={18} />
            <span>{error}</span>
            <button onClick={load} aria-label={lang === 'zh' ? '重新连接' : 'Reconnect'}>
              <ArrowClockwise size={16} />
            </button>
          </div>
        )}
        {section === 'history' ? (
          <History
            history={history}
            t={t}
            onSelect={(j) => {
              setJob(j);
              setExpanded(j.results[0]?.id || null);
              setSection('detect');
            }}
            onDelete={deleteJob}
          />
        ) : section === 'overview' ? (
          <Overview
            history={history}
            models={models}
            autorun={boot?.autorun}
            qualityPrompts={boot?.qualityPrompts}
            t={t}
            lang={lang}
            busy={starting || history.some((j) => !terminal(j.state))}
            expanded={expanded}
            setExpanded={setExpanded}
            onRunModel={runOne}
            onError={setError}
            onSaved={() => load()}
          />
        ) : (
          <>
            <div className="intro">
              <nav className="segs mode-segs" aria-label={t.detect}>
                <button
                  className={`opt ${detectMode === 'fingerprint' ? 'on' : ''}`}
                  onClick={() => setDetectMode('fingerprint')}
                >
                  {t.fingerprintMode}
                </button>
                <button
                  className={`opt ${detectMode === 'quality' ? 'on' : ''}`}
                  onClick={() => setDetectMode('quality')}
                >
                  {t.qualityMode}
                </button>
              </nav>
              <p>
                {detectMode === 'quality'
                  ? t.qualityIntro
                  : lang === 'zh'
                    ? '选择模型，用同一组挑战比较响应指纹。'
                    : 'Select models to compare their fingerprints with shared challenges.'}
              </p>
              {detectMode === 'fingerprint' && boot?.bank && (
                <span title={boot.bank.builtAt}>
                  {lang === 'zh' ? '参考库' : 'Reference bank'} · {boot.bank.modelCount ?? '—'}{' '}
                  {lang === 'zh' ? '个模型' : 'models'}
                </span>
              )}
            </div>
            {boot?.demo && (
              <div className="notice demo">
                <Lightning size={15} />
                <span>
                  {lang === 'zh'
                    ? '示例数据，可直接试用检测流程。'
                    : 'Demo data. Try the detection workflow.'}
                </span>
              </div>
            )}
            <div className="workspace-grid">
              <section className="list panel models-panel">
                <div className="panel-title">
                  <div>
                    <h2>
                      {lang === 'zh' ? '选择模型' : 'Models'}{' '}
                      <span className="section-count">{models.length}</span>
                    </h2>
                  </div>
                  <span className="selection-count">
                    {selected.length} {t.selected}
                  </span>
                  <button
                    className="text ghost-button"
                    onClick={() => setSelected([])}
                    disabled={!selected.length}
                  >
                    {t.clear}
                  </button>
                </div>
                <div className="filter-row">
                  <div className="search">
                    <MagnifyingGlass size={17} />
                    <input
                      placeholder={t.search}
                      aria-label={t.search}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <select
                    aria-label={t.provider}
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    {providers.map((p) => (
                      <option key={p} value={p}>
                        {p === 'all' ? t.provider : p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="model-list">
                  {filtered.length ? (
                    filtered.map((m) => (
                      <label
                        className={`row model model-row ${selected.includes(m.id) ? 'selected' : ''}`}
                        key={m.id}
                      >
                        <input
                          type="checkbox"
                          aria-label={`${m.name} · ${m.id}`}
                          checked={selected.includes(m.id)}
                          onChange={() => toggle(m.id)}
                        />
                        <span className="who model-name">
                          <strong className="name">{m.name}</strong>
                          <small className="sub">{m.id}</small>
                        </span>
                        <span className="model-endpoint">
                          {m.nativeEndpoints?.[0]?.replace('/v1/', '') || 'chat'}
                        </span>
                      </label>
                    ))
                  ) : (
                    <div className="empty-state">
                      <List size={26} />
                      <p>
                        {boot
                          ? t.noModels
                          : lang === 'zh'
                            ? '正在加载模型与参考库…'
                            : 'Loading models and reference data…'}
                      </p>
                    </div>
                  )}
                </div>
              </section>
              <section className="list panel config-panel">
                <div className="panel-title">
                  <div>
                    <h2>{t.settings}</h2>
                  </div>
                </div>
                <label>
                  {t.account}
                  <input
                    value={account}
                    list="account-options"
                    onChange={(e) => setAccount(e.target.value)}
                    placeholder={
                      lang === 'zh' ? '可选：账号 ID 或名称' : 'Optional account ID or name'
                    }
                  />
                  <datalist id="account-options">
                    {(boot?.accounts || [])
                      .filter(
                        (a) =>
                          !selectedModels.length ||
                          selectedModels.some((m) => m.provider === a.provider),
                      )
                      .map((a) => (
                        <option key={`${a.provider}/${a.id}`} value={a.id}>
                          {a.name} · {a.provider}
                        </option>
                      ))}
                  </datalist>
                </label>
                {detectMode === 'quality' && (
                  <div className="quality-picker">
                    {(boot?.qualityPrompts || []).map((p) => (
                      <label className="row model model-row" key={p.id}>
                        <input
                          type="checkbox"
                          aria-label={p.name}
                          checked={qualityQs.includes(p.id)}
                          onChange={() =>
                            setQualityQs((qs) =>
                              qs.includes(p.id) ? qs.filter((x) => x !== p.id) : [...qs, p.id],
                            )
                          }
                        />
                        <span className="who model-name">
                          <strong className="name">{p.name}</strong>
                          <small className="sub">{p.id}</small>
                        </span>
                        <span className="model-endpoint">{p.automatic ? t.auto : t.manual}</span>
                      </label>
                    ))}
                  </div>
                )}
                {detectMode === 'fingerprint' && (
                  <>
                    <div className="two-col">
                      <label>
                        {t.protocol}
                        <select
                          value={config.api}
                          onChange={(e) => setField('api', e.target.value)}
                        >
                          <option value="auto">Auto</option>
                          <option value="chat_completions">chat_completions</option>
                          <option value="responses">responses</option>
                          <option value="messages">messages</option>
                        </select>
                      </label>
                      <label>
                        {t.effort}
                        <select value={effort} onChange={(e) => setField('effort', e.target.value)}>
                          <option value="">Default</option>
                          {effortChoices.map((value) => (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="switch-row">
                      <div>
                        <strong>{lang === 'zh' ? '完整样本' : 'Complete samples'}</strong>
                        <small>
                          {lang === 'zh' ? '仅接受完整的 3 条采样' : 'Require all three samples'}
                        </small>
                      </div>
                      <button
                        className={`lib-switch switch ${config.strict ? 'on' : ''}`}
                        role="switch"
                        aria-label={t.strict}
                        aria-checked={config.strict}
                        onClick={() => setField('strict', !config.strict)}
                      >
                        <i />
                      </button>
                    </div>
                    <button
                      className="advanced-toggle"
                      aria-expanded={showAdvanced}
                      aria-controls="run-advanced"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                      {showAdvanced ? '−' : '+'}{' '}
                      {lang === 'zh' ? '高级并行与超时' : 'Concurrency & deadline'}
                    </button>
                    {showAdvanced && (
                      <div className="advanced" id="run-advanced">
                        <label>
                          {t.tier}
                          <select
                            value={config.serviceTier}
                            onChange={(e) => setField('serviceTier', e.target.value)}
                          >
                            <option value="default">Default</option>
                            <option value="flex">Flex</option>
                            <option value="fast">Fast</option>
                            <option value="ultrafast">Ultra-fast</option>
                          </select>
                        </label>
                        <div className="three-col">
                          <label>
                            {t.targetParallel}
                            <input
                              type="number"
                              min="1"
                              max="3"
                              aria-invalid={!integerInRange(config.targetParallel, 1, 3)}
                              value={config.targetParallel}
                              onChange={(e) => setField('targetParallel', e.target.value)}
                            />
                          </label>
                          <label>
                            {t.sampleParallel}
                            <input
                              type="number"
                              min="1"
                              max="3"
                              aria-invalid={!integerInRange(config.sampleParallel, 1, 3)}
                              value={config.sampleParallel}
                              onChange={(e) => setField('sampleParallel', e.target.value)}
                            />
                          </label>
                          <label>
                            {t.deadline}
                            <input
                              type="number"
                              min="10"
                              max="900"
                              aria-invalid={!integerInRange(config.deadlineSeconds, 10, 900)}
                              value={config.deadlineSeconds}
                              onChange={(e) => setField('deadlineSeconds', e.target.value)}
                            />
                          </label>
                        </div>
                        {!configValid && (
                          <p className="muted-line" role="alert">
                            {lang === 'zh'
                              ? '并行数须为 1–3 的整数，超时须为 10–900 的整数秒。'
                              : 'Parallelism must be an integer from 1–3; deadline must be 10–900 whole seconds.'}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
                <div className="run-footer">
                  <div>
                    <span>{t.estimated}</span>
                    <strong>{estimate}</strong>
                    <small>
                      {detectMode === 'quality'
                        ? `${qualityQs.length} × ${selected.length || 0}`
                        : `3 × ${selected.length || 0}`}
                    </small>
                  </div>
                  <button
                    className="text primary primary-button"
                    disabled={
                      !selected.length ||
                      !configValid ||
                      starting ||
                      (detectMode === 'fingerprint' && !boot?.bank) ||
                      (detectMode === 'quality' && !qualityQs.length) ||
                      history.some((j) => !terminal(j.state))
                    }
                    onClick={start}
                  >
                    <Play size={17} weight="fill" />
                    {t.start}
                  </button>
                </div>
              </section>
            </div>
            {job && (
              <JobView
                job={job}
                t={t}
                expanded={expanded}
                setExpanded={setExpanded}
                onCancel={cancel}
                onDownload={download}
                onReview={reviewProbe}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function JobView({
  job,
  t,
  expanded,
  setExpanded,
  onCancel,
  onDownload,
  onReview,
}: {
  job: Job;
  t: any;
  expanded: string | null;
  setExpanded: (x: string | null) => void;
  onCancel: () => void;
  onDownload: () => void;
  onReview?: (
    jobId: string,
    targetId: string,
    probeIndex: number,
    review: 'accepted' | 'rejected',
  ) => void;
}) {
  const [showExport, setShowExport] = useState(false);
  const [copied, setCopied] = useState(false);
  const exportArea = useRef<HTMLTextAreaElement>(null);
  const total = job.results.length || job.config.targets.length;
  const done = job.results.filter((r) => r.state === 'completed').length;
  const isQuality = job.kind === 'quality';
  const finishedSamples = isQuality
    ? job.results.flatMap((r) => r.probes || []).filter((p) => p.verdict !== 'running').length
    : job.results
        .flatMap((r) => r.samples)
        .filter((s) => !['queued', 'waiting', 'streaming'].includes(s.state)).length;
  const probeTotal = total * (job.config.questions?.length || 1);
  const json = JSON.stringify({ schema: 'magpie-fingerprint/v1', ...job }, null, 2);
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      exportArea.current?.focus();
      exportArea.current?.select();
      setCopied(document.execCommand('copy'));
    }
  };
  return (
    <section className="results">
      <div className="results-head">
        <div>
          <h2>{terminal(job.state) ? t.results : t.live}</h2>
        </div>
        <div className="result-actions">
          <span className={`status ${job.state}`}>
            {job.state === 'running' && <CircleNotch className="spin" size={14} />}{' '}
            {stateLabel(t, job.state)}
          </span>
          {['queued', 'running'].includes(job.state) ? (
            <button className="danger-button" onClick={onCancel}>
              <Stop size={16} />
              {t.cancel}
            </button>
          ) : (
            <button className="ghost-button" onClick={() => setShowExport(true)}>
              <DownloadSimple size={16} />
              {t.export}
            </button>
          )}
        </div>
      </div>
      <div className="progress-track">
        <i
          style={{
            width: `${
              (isQuality ? probeTotal : total * 3)
                ? Math.round((finishedSamples / (isQuality ? probeTotal : total * 3)) * 100)
                : 0
            }%`,
          }}
        />
      </div>
      <div className="result-meta">
        <span>
          {finishedSamples}/{isQuality ? probeTotal : total * 3}{' '}
          {t === zh
            ? isQuality
              ? '条探针已结束'
              : '条采样已结束'
            : isQuality
              ? 'probes finished'
              : 'samples finished'}{' '}
          · {done}/{total} {t === zh ? '个模型完成' : 'models completed'}
        </span>
        <span>
          {job.demo && <b className="demo-chip">{t.demo}</b>}
          {new Date(job.createdAt).toLocaleString()}
        </span>
      </div>
      <div className="run-context">
        {!isQuality && (
          <>
            <span title={job.bank.builtAt}>
              {t === zh ? '参考库' : 'Reference'}: {job.bank.builtAt.slice(0, 19)}
            </span>
            <span>SDK {job.bank.sdk}</span>
          </>
        )}
        <span>
          {job.config.effort || 'default'} · {job.config.serviceTier}
        </span>
      </div>
      {job.error && (
        <div className="notice error" role="alert">
          {job.error}
        </div>
      )}
      {!isQuality && (
        <details className="challenge-details">
          <summary>
            {t === zh ? '本批次共享的 3 个挑战' : 'Three challenges shared across this batch'}
          </summary>
          {job.challenges.map((c, i) => (
            <div key={c.id}>
              <b>
                {i + 1} · {c.expected_count} {t === zh ? '个数字' : 'numbers'}
              </b>
              <p>{c.prompt}</p>
            </div>
          ))}
        </details>
      )}
      {job.results.map((r: TargetResult) => (
        <ResultRow
          key={r.id}
          r={r}
          demo={job.demo}
          t={t}
          kind={job.kind === 'quality' ? 'quality' : 'fingerprint'}
          jobId={job.id}
          onReview={onReview}
          expanded={expanded === r.id}
          toggle={() => setExpanded(expanded === r.id ? null : r.id)}
        />
      ))}
      {showExport && (
        <div
          className="export-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={t.export}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowExport(false);
          }}
        >
          <div className="export-head">
            <strong>{t.export}</strong>
            <button
              className="icon icon-button"
              aria-label={t === zh ? '关闭导出' : 'Close export'}
              onClick={() => setShowExport(false)}
            >
              ×
            </button>
          </div>
          <textarea ref={exportArea} aria-label="JSON" autoFocus readOnly value={json} />
          <div>
            <button className="text primary primary-button" onClick={copy}>
              <Clipboard size={16} />{' '}
              {copied ? (t === zh ? '已复制' : 'Copied') : t === zh ? '复制 JSON' : 'Copy JSON'}
            </button>
            {window.self === window.top && (
              <button className="ghost-button" onClick={onDownload}>
                <DownloadSimple size={16} />
                {t === zh ? '下载文件' : 'Download file'}
              </button>
            )}
            <small>
              {t === zh
                ? '也可选中文本后手动复制保存。'
                : 'You can also select and copy the text manually.'}
            </small>
          </div>
        </div>
      )}
    </section>
  );
}
const QUALITY_NAMES: Record<string, { zh: string; en: string }> = {
  milk: { zh: '牛奶推理', en: 'Milk reasoning' },
  repeat: { zh: '逐字复述', en: 'Verbatim repeat' },
  japan: { zh: '日本首相', en: 'Japan PM' },
  person: { zh: '人物知识', en: 'Person knowledge' },
  html: { zh: 'HTML 动画', en: 'HTML animation' },
  svg: { zh: 'SVG 创作', en: 'SVG drawing' },
  map: { zh: '世界海陆地图', en: 'World land/sea map' },
};
function ResultRow({
  r,
  demo,
  t,
  kind,
  jobId,
  onReview,
  expanded,
  toggle,
}: {
  r: TargetResult;
  demo?: boolean;
  t: any;
  kind?: 'fingerprint' | 'quality';
  jobId?: string;
  onReview?: (
    jobId: string,
    targetId: string,
    probeIndex: number,
    review: 'accepted' | 'rejected',
  ) => void;
  expanded: boolean;
  toggle: () => void;
}) {
  const analysis = r.analysis;
  const candidates = analysis?.results || [];
  const decision = analysis?.decision;
  if (kind === 'quality')
    return (
      <div className={`result-card ${r.state}`}>
        <button
          className="result-summary"
          aria-expanded={expanded}
          aria-controls={`result-${r.id}`}
          onClick={toggle}
        >
          <span className="result-icon">
            {r.state === 'completed' ? (
              <CheckCircle size={20} />
            ) : r.state === 'failed' ? (
              <WarningCircle size={20} />
            ) : (
              <CircleNotch size={20} className={r.state === 'running' ? 'spin' : ''} />
            )}
          </span>
          <span className="result-model">
            <strong>{r.target.model}</strong>
            <small>{stateLabel(t, r.state)}</small>
          </span>
          <span className="result-label">
            {(r.probes || []).filter((p) => p.verdict === 'passed').length}/
            {(r.probes || []).length} {t.probePassed}
            <small>{(r.probes || []).some((p) => p.needsReview) ? t.needsReview : ''}</small>
          </span>
          <CaretDown size={17} className={expanded ? 'rotate' : ''} />
        </button>
        {expanded && (
          <div className="result-body" id={`result-${r.id}`}>
            {(r.probes || []).map((p, i) => {
              const reviewLabel =
                p.review === 'accepted' ? t.accepted : p.review === 'rejected' ? t.rejected : null;
              const badge =
                p.verdict === 'running'
                  ? stateLabel(t, 'running')
                  : p.verdict === 'passed'
                    ? t.probePassed
                    : p.verdict === 'failed'
                      ? p.needsReview
                        ? t.needsReview
                        : t.probeFailed
                      : p.verdict === 'manual'
                        ? reviewLabel || t.probeManual
                        : t.probeUnavailable;
              return (
                <div className="probe-card" key={i}>
                  <header>
                    <b>{QUALITY_NAMES[p.id]?.[t === zh ? 'zh' : 'en'] || p.id}</b>
                    <span className={`status ${p.needsReview ? 'failed' : p.verdict}`}>
                      {badge}
                    </span>
                  </header>
                  <div className="probe-metrics">
                    {p.ttftMs != null && (
                      <span>
                        {t.ttft} {p.ttftMs}ms
                      </span>
                    )}
                    {p.tokensPerS != null && (
                      <span>
                        {p.tokensPerS} {t.tokensPerS}
                      </span>
                    )}
                    {p.repeatHits != null && (
                      <span>
                        {t.repeatHits} {p.repeatHits}/15
                      </span>
                    )}
                    {p.attempt > 1 && (
                      <span>
                        {t === zh ? '重试' : 'retry'} #{p.attempt}
                      </span>
                    )}
                  </div>
                  {p.error && <small className="notice error">{p.error}</small>}
                  <details>
                    <summary>{t.answer}</summary>
                    <pre>{p.answer || p.error || '—'}</pre>
                  </details>
                  {p.verdict === 'manual' && onReview && jobId && (
                    <div className="probe-review">
                      <button
                        className="ghost-button"
                        onClick={() => onReview(jobId, r.id, i, 'accepted')}
                      >
                        {t.reviewAccept}
                      </button>
                      <button
                        className="danger-button"
                        onClick={() => onReview(jobId, r.id, i, 'rejected')}
                      >
                        {t.reviewReject}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  return (
    <div className={`result-card ${r.state}`}>
      <button
        className="result-summary"
        aria-expanded={expanded}
        aria-controls={`result-${r.id}`}
        onClick={toggle}
      >
        <span className="result-icon">
          {r.state === 'completed' ? (
            <CheckCircle size={20} />
          ) : r.state === 'failed' ? (
            <WarningCircle size={20} />
          ) : (
            <CircleNotch size={20} className={r.state === 'running' ? 'spin' : ''} />
          )}
        </span>
        <span className="result-model">
          <strong>{r.target.model}</strong>
          <small>
            {r.api} · {stateLabel(t, r.state)}
          </small>
        </span>
        <span className="result-label">
          {analysis?.prediction_name || (decision ? stateLabel(t, decision) : '—')}
          <small>{demo ? t.demo : decision ? stateLabel(t, decision) : ''}</small>
        </span>
        <CaretDown size={17} className={expanded ? 'rotate' : ''} />
      </button>
      {expanded && (
        <div className="result-body" id={`result-${r.id}`}>
          <div className="candidate-head">
            <h3>{t.candidates}</h3>
            <span>
              {analysis?.probability_status === 'reference_calibrated'
                ? t === zh
                  ? '参考库内概率'
                  : 'Within-bank probability'
                : t === zh
                  ? '排名分数（非概率）'
                  : 'Ranking score (not probability)'}
            </span>
          </div>
          {candidates.length ? (
            candidates.slice(0, 5).map((c, i) => (
              <div className="candidate" key={i}>
                <span>{i + 1}</span>
                <div>
                  <div className="candidate-label">
                    <strong>{c.display_name || c.model || 'Unknown'}</strong>
                    <em>
                      {c.probability == null
                        ? c.score.toFixed(3)
                        : `${(c.probability * 100).toFixed(1)}%`}
                    </em>
                  </div>
                  <div className="bar">
                    <i
                      style={{
                        width: `${c.probability == null ? Math.max(6, 100 - i * 18) : Math.max(1, Math.min(100, c.probability * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="muted-line">
              {r.error ||
                (decision === 'partial'
                  ? 'Partial result'
                  : decision === 'unscorable'
                    ? 'Unscorable'
                    : decision === 'not_model'
                      ? 'Not a model reply'
                      : t === zh
                        ? '暂未产生可评分候选。'
                        : 'No scored candidates yet.')}
            </div>
          )}
          {analysis && (
            <p className="evidence-note">
              {t === zh
                ? `有效样本 ${analysis.used_outputs}/3 · 家族 ${analysis.family_prediction_name || '—'}。概率仅在参考库候选之间分配，库外模型也可能得到相近候选。`
                : `${analysis.used_outputs}/3 usable samples · Family ${analysis.family_prediction_name || '—'}. Probabilities cover reference-bank candidates only; an unseen model can still rank close.`}
            </p>
          )}
          {r.error && <p className="notice error">{r.error}</p>}
          <div className="sample-grid">
            {r.samples.map((sample, i) => (
              <div className="sample-tile" key={i}>
                <header>
                  <b>
                    {t === zh ? '采样' : 'Sample'} {i + 1}
                  </b>
                  <span className={`status ${sample.state}`}>{stateLabel(t, sample.state)}</span>
                </header>
                <strong>
                  {sample.count}
                  <small> / {sample.expected_count}</small>
                </strong>
                <div className="sample-metrics">
                  {sample.first_byte_ms != null && (
                    <span>
                      {t.ttft} {sample.first_byte_ms}ms
                    </span>
                  )}
                  {sample.tokens_per_s != null && (
                    <span>
                      {sample.tokens_per_s} {t.tokensPerS}
                    </span>
                  )}
                </div>
                <code>
                  {r.provenance[i]?.model || (t === zh ? '路由待确认' : 'Route unverified')}
                </code>
                {r.provenance[i]?.mismatch && (
                  <em>{t === zh ? '实际路由已变化' : 'Route changed'}</em>
                )}
                {sample.error && <small>{sample.error}</small>}
              </div>
            ))}
          </div>
          <details>
            <summary>{t.details}</summary>
            <pre>{JSON.stringify({ samples: r.samples, provenance: r.provenance }, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
const avgNum = (xs: (number | null | undefined)[]) => {
  const v = (xs || []).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const metric = (value: number | null, digits = 0, unit = '') =>
  value == null ? '—' : `${value.toFixed(digits)}${unit}`;

function Overview({
  history,
  models,
  autorun,
  qualityPrompts,
  t,
  lang,
  busy,
  expanded,
  setExpanded,
  onRunModel,
  onError,
  onSaved,
}: {
  history: Job[];
  models: Model[];
  autorun?: Bootstrap['autorun'];
  qualityPrompts?: Bootstrap['qualityPrompts'];
  t: any;
  lang: 'zh' | 'en';
  busy: boolean;
  expanded: string | null;
  setExpanded: (x: string | null) => void;
  onRunModel: (model: string, questions?: string[]) => void;
  onError: (message: string) => void;
  onSaved: () => void;
}) {
  const knownIds = useMemo(() => new Set(models.map((m) => m.id)), [models]);
  const rows = useMemo(() => {
    const map = new Map<
      string,
      { fp: { job: Job; result: TargetResult }[]; q: { job: Job; result: TargetResult }[] }
    >();
    for (const j of history) {
      if (!terminal(j.state)) continue;
      const isQ = j.kind === 'quality';
      for (const r of j.results) {
        const lists = map.get(r.target.model) || { fp: [], q: [] };
        (isQ ? lists.q : lists.fp).push({ job: j, result: r });
        map.set(r.target.model, lists);
      }
    }
    return [...map.entries()]
      .map(([model, lists]) => ({
        model,
        current: lists.fp[0] ?? null,
        previous: lists.fp[1]?.result ?? null,
        quality: lists.q[0] ?? null,
      }))
      .filter((row) => row.current || row.quality)
      .sort((a, b) => a.model.localeCompare(b.model));
  }, [history]);
  // Draft stays null until the first edit so late-loading settings show through.
  const [draft, setDraft] = useState<{
    enabled: boolean;
    intervalMinutes: number;
    modelsText: string;
    qualityEnabled: boolean;
    qualityQs: string[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const view = draft ?? {
    enabled: autorun?.enabled ?? false,
    intervalMinutes: autorun?.intervalMinutes ?? 60,
    modelsText: autorun?.models.join(', ') ?? '',
    qualityEnabled: autorun?.quality?.enabled ?? false,
    qualityQs: autorun?.quality?.questions ?? ['milk'],
  };
  const modelIds = view.modelsText
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  const unknown = modelIds.filter((m) => !knownIds.has(m));
  const saveAutorun = async () => {
    if (saving) return;
    setSaving(true);
    onError('');
    try {
      await api('api/autorun', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: view.enabled,
          intervalMinutes: Number(view.intervalMinutes),
          models: modelIds,
          effort: '',
          quality: { enabled: view.qualityEnabled, questions: view.qualityQs },
        }),
      });
      setDraft(null);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
      onSaved();
    } catch (e) {
      onError(String(e));
    } finally {
      setSaving(false);
    }
  };
  const confidence = (r: TargetResult | undefined) =>
    r?.analysis?.results?.[0]?.probability ?? null;
  // Latest milk-probe outcome for the quality column.
  const qualityBadge = (q: { job: Job; result: TargetResult } | null) => {
    if (!q) return null;
    const probes = q.result.probes || [];
    const milk = probes.find((p) => p.id === 'milk');
    if (probes.some((p) => p.needsReview)) return { cls: 'failed', label: t.needsReview };
    if (milk?.verdict === 'passed') return { cls: 'completed', label: t.probePassed };
    if (milk?.verdict === 'failed') return { cls: 'failed', label: t.probeFailed };
    if (probes.some((p) => p.review === 'rejected')) return { cls: 'failed', label: t.rejected };
    if (probes.length) return { cls: '', label: t.probeManual };
    return null;
  };
  return (
    <div className="overview-page">
      <section className="panel autorun-panel">
        <div className="panel-title">
          <div>
            <h2>{t.autorun}</h2>
          </div>
          {savedFlash && <span className="status completed">{t.autorunSaved}</span>}
        </div>
        <div className="autorun-grid">
          <div className="switch-row">
            <div>
              <strong>{t.autorunEnable}</strong>
              <small>
                {autorun?.nextRunAt
                  ? `${t.autorunNext}: ${new Date(autorun.nextRunAt).toLocaleString()}`
                  : t.autorunNever}
                {autorun?.lastRunAt
                  ? ` · ${t.autorunLast}: ${new Date(autorun.lastRunAt).toLocaleString()}`
                  : ''}
              </small>
            </div>
            <button
              className={`lib-switch switch ${view.enabled ? 'on' : ''}`}
              role="switch"
              aria-label={t.autorunEnable}
              aria-checked={view.enabled}
              onClick={() => setDraft({ ...view, enabled: !view.enabled })}
            >
              <i />
            </button>
          </div>
          <label>
            {t.autorunInterval}
            <input
              type="number"
              min="0"
              max="10080"
              value={view.intervalMinutes}
              aria-invalid={
                !(Number(view.intervalMinutes) >= 0 && Number(view.intervalMinutes) <= 10080)
              }
              onChange={(e) => setDraft({ ...view, intervalMinutes: Number(e.target.value) })}
            />
          </label>
          <label>
            {t.autorunModels}
            <input
              value={view.modelsText}
              placeholder="provider/model-id, provider/model-id"
              onChange={(e) => setDraft({ ...view, modelsText: e.target.value })}
            />
            {unknown.length > 0 && (
              <small role="alert">
                {lang === 'zh' ? '目录中不存在：' : 'Not in catalog: '}
                {unknown.join(', ')}
              </small>
            )}
          </label>
          <div className="switch-row autorun-quality">
            <div>
              <strong>{t.autorunQuality}</strong>
              <small>
                {view.qualityQs.length
                  ? view.qualityQs.join(', ')
                  : lang === 'zh'
                    ? '未选择题目'
                    : 'No questions selected'}
              </small>
            </div>
            <button
              className={`lib-switch switch ${view.qualityEnabled ? 'on' : ''}`}
              role="switch"
              aria-label={t.autorunQuality}
              aria-checked={view.qualityEnabled}
              onClick={() => setDraft({ ...view, qualityEnabled: !view.qualityEnabled })}
            >
              <i />
            </button>
          </div>
          {view.qualityEnabled && (
            <div className="quality-picker" role="group" aria-label={t.questions}>
              {(qualityPrompts || []).map((p) => (
                <label className="row model model-row" key={p.id}>
                  <input
                    type="checkbox"
                    aria-label={p.name}
                    checked={view.qualityQs.includes(p.id)}
                    onChange={() =>
                      setDraft({
                        ...view,
                        qualityQs: view.qualityQs.includes(p.id)
                          ? view.qualityQs.filter((x) => x !== p.id)
                          : [...view.qualityQs, p.id],
                      })
                    }
                  />
                  <span className="who model-name">
                    <strong className="name">{p.name}</strong>
                    <small className="sub">{p.id}</small>
                  </span>
                  <span className="model-endpoint">{p.automatic ? t.auto : t.manual}</span>
                </label>
              ))}
            </div>
          )}
          <button
            className="text primary primary-button"
            disabled={
              saving ||
              !Number.isInteger(Number(view.intervalMinutes)) ||
              Number(view.intervalMinutes) < 0 ||
              Number(view.intervalMinutes) > 10080 ||
              unknown.length > 0
            }
            onClick={saveAutorun}
          >
            {t.autorunApply}
          </button>
        </div>
      </section>
      <div className="list history-list overview-list">
        {rows.length ? (
          rows.map(({ model, current, previous, quality }) => {
            const r = current?.result;
            const conf = confidence(r);
            const prevConf = confidence(previous);
            const trend =
              conf == null || prevConf == null
                ? null
                : conf - prevConf > 0.02
                  ? 'up'
                  : conf - prevConf < -0.02
                    ? 'down'
                    : 'flat';
            const ttft = r ? avgNum(r.samples.map((s) => s.first_byte_ms)) : null;
            const tokps = r ? avgNum(r.samples.map((s) => s.tokens_per_s)) : null;
            const qBadge = qualityBadge(quality);
            const qProbes = quality?.result.probes || [];
            const qTtft = avgNum(qProbes.map((p) => p.ttftMs));
            const qTokps = avgNum(qProbes.map((p) => p.tokensPerS));
            return (
              <div className="overview-row" key={model}>
                <div className="overview-summary">
                  <button
                    className="overview-toggle"
                    aria-expanded={expanded === model}
                    onClick={() => setExpanded(expanded === model ? null : model)}
                  >
                    <span className="result-model">
                      <strong>{model}</strong>
                      <small>
                        {r
                          ? new Date(current!.job.createdAt).toLocaleString()
                          : quality
                            ? `${t.quality} · ${new Date(quality.job.createdAt).toLocaleString()}`
                            : t.noData}
                      </small>
                    </span>
                    <span className="result-label">
                      {r ? r.analysis?.prediction_name || stateLabel(t, r.state) : '—'}
                      <small>
                        {r
                          ? r.state === 'completed' && r.error
                            ? r.error
                            : r.state === 'completed'
                              ? stateLabel(t, r.analysis?.decision || r.state)
                              : stateLabel(t, r.state)
                          : t.noData}
                      </small>
                    </span>
                    {qBadge && (
                      <span className={`overview-metric quality-badge ${qBadge.cls}`}>
                        {t.quality} · {qBadge.label}
                      </span>
                    )}
                    {!qBadge && quality && (
                      <span className="overview-metric">
                        {t.quality} · {t.probeManual}
                      </span>
                    )}
                    <span className="overview-metric" title={t.ttft}>
                      {t.ttft} {metric(r ? ttft : qTtft, 0, 'ms')}
                    </span>
                    <span className="overview-metric" title={t.tokensPerS}>
                      {t.tokensPerS} {metric(r ? tokps : qTokps, 0)}
                    </span>
                    <span
                      className={`overview-metric trend-${trend || 'none'}`}
                      title={
                        trend === 'up'
                          ? t.trendUp
                          : trend === 'down'
                            ? t.trendDown
                            : trend === 'flat'
                              ? t.trendFlat
                              : t.trend
                      }
                    >
                      {trend === 'up' ? '▲' : trend === 'down' ? '▼' : trend === 'flat' ? '≈' : '·'}{' '}
                      {metric(conf == null ? null : conf * 100, 1, '%')}
                    </span>
                    <CaretDown size={17} className={expanded === model ? 'rotate' : ''} />
                  </button>
                  <button
                    className="ghost-button overview-run"
                    disabled={busy}
                    title={t.runNow}
                    onClick={() => onRunModel(model)}
                  >
                    <Play size={14} weight="fill" />
                    {t.runNow}
                  </button>
                  <button
                    className="ghost-button overview-run"
                    disabled={busy}
                    title={t.qualityMode}
                    onClick={() => onRunModel(model, ['milk'])}
                  >
                    <Play size={14} weight="fill" />
                    {t.qualityTab}
                  </button>
                </div>
                {expanded === model && (
                  <>
                    {quality && (
                      <ResultRow
                        r={quality.result}
                        demo={quality.job.demo}
                        t={t}
                        kind="quality"
                        jobId={quality.job.id}
                        expanded
                        toggle={() => setExpanded(null)}
                      />
                    )}
                    {r && (
                      <ResultRow
                        r={r}
                        demo={current!.job.demo}
                        t={t}
                        expanded
                        toggle={() => setExpanded(null)}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })
        ) : (
          <div className="empty-history">
            <ClockCounterClockwise size={32} />
            <p>{t.noData}</p>
          </div>
        )}
      </div>
    </div>
  );
}
function History({
  history,
  t,
  onSelect,
  onDelete,
}: {
  history: Job[];
  t: any;
  onSelect: (j: Job) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="history-page">
      <div className="history-tools">
        <p>
          {t === zh
            ? `本地保存了 ${history.length} 次检测`
            : `${history.length} runs saved locally`}
        </p>
      </div>
      <div className="list history-list">
        {history.length ? (
          history.map((j) => (
            <div className="history-row" key={j.id}>
              <button onClick={() => onSelect(j)}>
                <span className={`history-state ${j.state}`} />
                <span>
                  <strong>
                    {j.config.targets[0]?.model || j.id.slice(0, 12)}
                    {j.config.targets.length > 1 ? ` +${j.config.targets.length - 1}` : ''}
                  </strong>
                  <small>
                    {new Date(j.createdAt).toLocaleString()} · {j.config.targets.length}{' '}
                    {t === zh ? '个模型' : 'models'} · {j.id.slice(0, 8)}
                  </small>
                </span>
              </button>
              <span className={`status ${j.state}`}>
                {j.demo ? t.demo : stateLabel(t, j.state)}
              </span>
              <button
                className="icon icon-button danger-icon"
                title={t === zh ? '删除' : 'Delete'}
                aria-label={`${t === zh ? '删除检测记录' : 'Delete run'} ${j.id.slice(0, 8)}`}
                onClick={() => onDelete(j.id)}
              >
                <Trash size={17} />
              </button>
            </div>
          ))
        ) : (
          <div className="empty-history">
            <ClockCounterClockwise size={32} />
            <p>{t === zh ? '还没有检测记录' : 'No detection history yet'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
