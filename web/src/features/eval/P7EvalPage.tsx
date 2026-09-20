import { useEffect, useMemo, useState } from 'react'
import type {
  P7EvalCase,
  P7EvalDomain,
  P7EvalDraft,
  P7EvalFailureSummary,
  P7EvalMetrics,
  P7EvalObservation,
  P7EvalRunSummary,
  P7EvalVariant,
} from '../../../../shared/industry/eval/p7'
import { createP7EvaluationApiClient, type P7EvaluationApiClient } from '../../api/p7-client'
import './eval.css'

const defaultClient = createP7EvaluationApiClient()

export interface P7EvalSnapshot {
  cases: readonly P7EvalCase[]
  runs: readonly P7EvalRunSummary[]
  selectedRun?: P7EvalRunSummary
  observations: readonly P7EvalObservation[]
  failures: readonly P7EvalFailureSummary[]
  drafts: readonly P7EvalDraft[]
}

export function P7EvalPage({ domain, client = defaultClient, initialSnapshot }: { domain: P7EvalDomain; client?: P7EvaluationApiClient; initialSnapshot?: P7EvalSnapshot }) {
  const [snapshot, setSnapshot] = useState<P7EvalSnapshot | undefined>(initialSnapshot)
  const [variantId, setVariantId] = useState<P7EvalVariant>('p7-guarded-v1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void loadSnapshot(client, domain).then((value) => { if (!cancelled) setSnapshot(value) }).catch((reason: unknown) => { if (!cancelled) setError(messageOf(reason)) })
    return () => { cancelled = true }
  }, [client, domain, initialSnapshot])

  async function startRun(): Promise<void> {
    setBusy(true); setError(null)
    try {
      const run = await client.startRun(domain, { datasetId: datasetId(domain), variantId })
      const [observations, failures, runs] = await Promise.all([client.listObservations(run.runId), client.listFailures(run.runId), client.listRuns(domain)])
      setSnapshot((current) => current === undefined ? current : { ...current, runs, selectedRun: run, observations, failures })
    } catch (reason) { setError(messageOf(reason)) } finally { setBusy(false) }
  }

  async function selectRun(runId: string): Promise<void> {
    setBusy(true); setError(null)
    try {
      const [selectedRun, observations, failures] = await Promise.all([client.getRun(runId), client.listObservations(runId), client.listFailures(runId)])
      setSnapshot((current) => current === undefined ? current : { ...current, selectedRun, observations, failures })
    } catch (reason) { setError(messageOf(reason)) } finally { setBusy(false) }
  }

  if (snapshot === undefined) return <main className="eval-page"><h1>{title(domain)}</h1><p>{error ?? '加载 P7 评测…'}</p></main>
  return <P7EvalView snapshot={snapshot} domain={domain} variantId={variantId} busy={busy} error={error} onVariantChange={setVariantId} onStartRun={() => void startRun()} onSelectRun={(runId) => void selectRun(runId)} />
}

export function P7EvalView({ snapshot, domain, variantId, busy, error, onVariantChange = () => undefined, onStartRun = () => undefined, onSelectRun = () => undefined }: {
  snapshot: P7EvalSnapshot
  domain: P7EvalDomain
  variantId: P7EvalVariant
  busy: boolean
  error: string | null
  onVariantChange?: (value: P7EvalVariant) => void
  onStartRun?: () => void
  onSelectRun?: (runId: string) => void
}) {
  const run = snapshot.selectedRun
  const byCase = useMemo(() => new Map(snapshot.observations.map((item) => [item.caseId, item])), [snapshot.observations])
  return <main className="eval-page" aria-labelledby="p7-title">
    <div className="eval-eyebrow">评测工作台 · P7</div>
    <div className="eval-heading-row">
      <div><h1 id="p7-title">{title(domain)}</h1><p>{description(domain)}</p></div>
      <div className="eval-heading-actions">
        <a href="/industry/eval/normalization">归一化</a><a href="/industry/eval/entity">实体</a><a href="/industry/eval/tool">工具</a><a href="/industry/eval/memory">内存</a><a href="/industry/eval">评测</a>
      </div>
    </div>
    {error === null ? null : <p className="eval-error" role="alert">{error}</p>}

    <section className="eval-panel">
      <div className="eval-heading-row"><div><h2>批次运行</h2><p>数据集 <code>{datasetId(domain)}</code> · 确定性 P7 安全配置。</p></div><div className="eval-heading-actions">
        <select aria-label="P7 变体" value={variantId} disabled={busy} onChange={(event) => onVariantChange(event.target.value as P7EvalVariant)}><option value="p7-broken-v0">p7-broken-v0</option><option value="p7-guarded-v1">p7-guarded-v1</option></select>
        <button type="button" disabled={busy} onClick={onStartRun}>运行 {shortName(domain)} 评测</button>
      </div></div>
    </section>

    {run === undefined ? <section className="eval-panel"><p>选择或开始一次运行。</p></section> : <MetricPanel domain={domain} metrics={run.metrics} />}

    <section className="eval-panel"><h2>运行记录</h2><table className="eval-table"><thead><tr><th>运行</th><th>变体</th><th>项目</th><th>门禁</th><th>通过</th><th /></tr></thead><tbody>{snapshot.runs.map((item) => <tr key={item.runId} data-selected={run?.runId === item.runId}><td><code>{item.runId}</code></td><td>{item.variantId}</td><td><code>{item.projectId}</code></td><td>{item.metrics.releaseGate}</td><td>{item.metrics.passedCount}/{item.metrics.sampleCount}</td><td><button type="button" disabled={busy} onClick={() => onSelectRun(item.runId)}>查看</button></td></tr>)}</tbody></table></section>

    <section className="eval-panel"><h2>用例</h2><table className="eval-table"><thead><tr><th>用例</th><th>输入</th><th>期望</th><th>结果</th></tr></thead><tbody>{snapshot.cases.map((testCase) => { const observation = byCase.get(testCase.caseId); return <tr key={testCase.caseId}><td><strong>{testCase.title}</strong><br /><code>{testCase.caseId}</code></td><td>{caseInput(testCase)}</td><td>{caseExpected(testCase)}</td><td>{observation === undefined ? '—' : observation.passed ? 'PASS' : `FAIL · ${observation.failureStage ?? 'UNKNOWN'}`}</td></tr> })}</tbody></table></section>

    <section className="eval-panel"><h2>失败下钻</h2>{snapshot.failures.length === 0 ? <p>所选运行中无失败用例。</p> : snapshot.failures.map((failure) => {
      const observation = snapshot.observations.find((item) => item.caseId === failure.caseId)
      return <article className="eval-panel" key={failure.caseId} data-p7-failure={failure.failureStage ?? 'UNKNOWN'}><div className="eval-heading-row"><div><strong>{failure.title}</strong><p><code>{failure.caseId}</code> · {failure.failureStage ?? 'UNKNOWN'}</p></div><code>{failure.traceId}</code></div><ul>{failure.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>{observation === undefined ? null : <dl><div><dt>期望</dt><dd>{observation.expectedSummary}</dd></div><div><dt>实际</dt><dd>{observation.actualSummary}</dd></div></dl>}</article>
    })}</section>

    <section className="eval-panel"><h2>追踪创建的草稿</h2><p>由追踪创建的草稿未评审，不是 Golden 用例。</p>{snapshot.drafts.length === 0 ? <p>本项目无 P7 草稿。</p> : <table className="eval-table"><thead><tr><th>草稿</th><th>源追踪</th><th>目标</th><th>状态</th><th>已评审</th></tr></thead><tbody>{snapshot.drafts.map((draft) => <tr key={draft.draftId}><td><code>{draft.draftId}</code></td><td>{draft.sourceTraceName}<br /><code>{draft.sourceTraceId}</code></td><td>{draft.targetDomain}</td><td>{draft.status}</td><td>{String(draft.reviewed)}</td></tr>)}</tbody></table>}</section>
  </main>
}

function MetricPanel({ domain, metrics }: { domain: P7EvalDomain; metrics: P7EvalMetrics }) {
  const common = <><Metric label="发布门禁" value={metrics.releaseGate} bad={metrics.releaseGate === 'FAIL'} /><Metric label="通过率" value={percent(metrics.passRate)} bad={metrics.passRate < 1} /></>
  return <section className="eval-summary-grid" aria-label={`${domain} metrics`}>{common}{domain === 'NORMALIZATION' ? <Metric label="归一化准确率" value={percent(metrics.normalizationAccuracy ?? 0)} bad={(metrics.normalizationAccuracy ?? 0) < 1} /> : null}{domain === 'ENTITY' ? <><Metric label="实体解析" value={percent(metrics.entityResolutionAccuracy ?? 0)} bad={(metrics.entityResolutionAccuracy ?? 0) < 1} />{Object.entries(metrics.entityFailureStageCounts ?? {}).map(([stage, count]) => <Metric key={stage} label={stage} value={String(count)} bad={count > 0} />)}</> : null}{domain === 'TOOL' ? <><Metric label="选择" value={percent(metrics.toolSelectionAccuracy ?? 0)} bad={(metrics.toolSelectionAccuracy ?? 0) < 1} /><Metric label="参数精确" value={percent(metrics.toolArgumentExactRate ?? 0)} bad={(metrics.toolArgumentExactRate ?? 0) < 1} /><Metric label="缺失必填" value={percent(metrics.toolMissingRequiredRate ?? 0)} bad={(metrics.toolMissingRequiredRate ?? 0) > 0} /><Metric label="未知参数" value={percent(metrics.toolUnknownArgumentRate ?? 0)} bad={(metrics.toolUnknownArgumentRate ?? 0) > 0} /><Metric label="范围已拦截" value={percent(metrics.toolScopeInjectionBlockedRate ?? 0)} bad={(metrics.toolScopeInjectionBlockedRate ?? 0) < 1} /><Metric label="冗余工具" value={percent(metrics.toolUnnecessaryToolRate ?? 0)} bad={(metrics.toolUnnecessaryToolRate ?? 0) > 0} /><Metric label="序列" value={percent(metrics.toolSequenceAccuracy ?? 0)} bad={(metrics.toolSequenceAccuracy ?? 0) < 1} /></> : null}{domain === 'MEMORY' ? <><Metric label="解析" value={percent(metrics.memoryResolutionAccuracy ?? 0)} bad={(metrics.memoryResolutionAccuracy ?? 0) < 1} /><Metric label="项目隔离" value={percent(metrics.memoryProjectIsolationRate ?? 0)} bad={(metrics.memoryProjectIsolationRate ?? 0) < 1} /><Metric label="TTL 策略" value={percent(metrics.memoryTtlPolicyRate ?? 0)} bad={(metrics.memoryTtlPolicyRate ?? 0) < 1} /><Metric label="来源策略" value={percent(metrics.memorySourcePolicyRate ?? 0)} bad={(metrics.memorySourcePolicyRate ?? 0) < 1} /></> : null}</section>
}
function Metric({ label, value, bad }: { label: string; value: string; bad: boolean }) { return <article data-critical={bad}><strong>{value}</strong><span>{label}</span></article> }

async function loadSnapshot(client: P7EvaluationApiClient, domain: P7EvalDomain): Promise<P7EvalSnapshot> {
  const [cases, runs, drafts] = await Promise.all([client.listCases(domain), client.listRuns(domain), client.listDrafts()])
  const brokenId = `run-p7-${domain.toLowerCase()}-broken-v0`
  const selectedRun = runs.find((item) => item.runId === brokenId) ?? runs[0]
  if (selectedRun === undefined) return { cases, runs, observations: [], failures: [], drafts }
  const [observations, failures] = await Promise.all([client.listObservations(selectedRun.runId), client.listFailures(selectedRun.runId)])
  return { cases, runs, selectedRun, observations, failures, drafts }
}

function datasetId(domain: P7EvalDomain): string { if (domain === 'NORMALIZATION') return 'normalization-safety-v1'; if (domain === 'ENTITY') return 'entity-safety-v1'; if (domain === 'TOOL') return 'tool-safety-v1'; return 'memory-safety-v1' }
function title(domain: P7EvalDomain): string { if (domain === 'NORMALIZATION') return '归一化实验'; if (domain === 'ENTITY') return '实体实验'; if (domain === 'TOOL') return '工具评测'; return '内存评测' }
function shortName(domain: P7EvalDomain): string { return domain === 'NORMALIZATION' ? '归一化' : domain === 'ENTITY' ? '实体' : domain === 'TOOL' ? '工具' : '内存' }
function description(domain: P7EvalDomain): string { if (domain === 'NORMALIZATION') return '里程、范围、线形、侧幅、单位、BOQ 编码、日期、规格与缩写的归一化。'; if (domain === 'ENTITY') return '实体解析，含显式的 Mention → 候选生成 → 排序 → 范围 → 歧义 失败阶段。'; if (domain === 'TOOL') return '工具选择、精确参数、必填/未知参数、范围注入拦截、冗余调用与序列。'; return '上下文引用解析，以及项目隔离、TTL 与记忆来源策略。' }
function caseInput(testCase: P7EvalCase): string { if (testCase.domain === 'NORMALIZATION') return testCase.input; if (testCase.domain === 'ENTITY') return testCase.mention; if (testCase.domain === 'TOOL') return testCase.query; return `${testCase.utterance} · ${testCase.previousContext.join(' / ')}` }
function caseExpected(testCase: P7EvalCase): string { if (testCase.domain === 'NORMALIZATION') return testCase.expectedNormalized; if (testCase.domain === 'ENTITY') return `${testCase.expectedEntityId} · ${testCase.expectedScope}`; if (testCase.domain === 'TOOL') return testCase.expectedTools.length === 0 ? 'no tool' : testCase.expectedSequence.join(' → '); return `${testCase.expectedResolution} · ${testCase.sourcePolicy}` }
function percent(value: number): string { return `${(value * 100).toFixed(1)}%` }
function messageOf(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
