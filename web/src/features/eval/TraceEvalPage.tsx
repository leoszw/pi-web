import { useEffect, useMemo, useState } from 'react'
import type {
  TraceEvalCase,
  TraceEvalFailureSummary,
  TraceEvalObservation,
  TraceEvalRunSummary,
  TraceEvalVariant,
} from '../../../../shared/industry/eval/trace'
import { createEvaluationApiClient, type EvaluationApiClient } from '../../api/industry-client'
import { traceEvalRunPath, tracePath } from '../../app/routes'
import './eval.css'

const defaultClient = createEvaluationApiClient()
const DATASET_ID = 'trace-safety-v1'

export interface TraceEvalSnapshot {
  cases: readonly TraceEvalCase[]
  runs: readonly TraceEvalRunSummary[]
  selectedRun?: TraceEvalRunSummary
  observations: readonly TraceEvalObservation[]
  failures: readonly TraceEvalFailureSummary[]
}

export function TraceEvalPage({
  runId,
  client = defaultClient,
  initialSnapshot,
}: {
  runId?: string
  client?: EvaluationApiClient
  initialSnapshot?: TraceEvalSnapshot
}) {
  const [snapshot, setSnapshot] = useState<TraceEvalSnapshot | undefined>(initialSnapshot)
  const [variantId, setVariantId] = useState<TraceEvalVariant>('trace-guarded-v1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void loadSnapshot(client, runId)
      .then((value) => { if (!cancelled) setSnapshot(value) })
      .catch((reason: unknown) => { if (!cancelled) setError(messageOf(reason)) })
    return () => { cancelled = true }
  }, [client, initialSnapshot, runId])

  async function startRun(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const run = await client.startTraceEvalRun({ datasetId: DATASET_ID, variantId })
      const [observations, failures, runs] = await Promise.all([
        client.listTraceEvalObservations(run.runId),
        client.listTraceEvalFailures(run.runId),
        client.listTraceEvalRuns(),
      ])
      setSnapshot((current) => ({ cases: current?.cases ?? [], runs, selectedRun: run, observations, failures }))
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  async function selectRun(nextRunId: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const [selectedRun, observations, failures] = await Promise.all([
        client.getTraceEvalRun(nextRunId),
        client.listTraceEvalObservations(nextRunId),
        client.listTraceEvalFailures(nextRunId),
      ])
      setSnapshot((current) => current === undefined ? current : { ...current, selectedRun, observations, failures })
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  if (snapshot === undefined) return <main className="eval-page"><h1>追踪 / Token 评测</h1>{error === null ? <p>正在加载追踪评测…</p> : <p role="alert">{error}</p>}</main>
  return <TraceEvalView
    snapshot={snapshot}
    variantId={variantId}
    busy={busy}
    error={error}
    onVariantChange={setVariantId}
    onStartRun={() => void startRun()}
    onSelectRun={(value) => void selectRun(value)}
  />
}

export function TraceEvalView({
  snapshot,
  variantId,
  busy,
  error,
  onVariantChange = () => undefined,
  onStartRun = () => undefined,
  onSelectRun = () => undefined,
}: {
  snapshot: TraceEvalSnapshot
  variantId: TraceEvalVariant
  busy: boolean
  error: string | null
  onVariantChange?: (value: TraceEvalVariant) => void
  onStartRun?: () => void
  onSelectRun?: (runId: string) => void
}) {
  const run = snapshot.selectedRun
  const metrics = run?.metrics
  const byCase = useMemo(() => new Map(snapshot.observations.map((item) => [item.caseId, item])), [snapshot.observations])

  return <main className="eval-page" aria-labelledby="trace-eval-title">
    <div className="eval-eyebrow">评测工作台 · P5</div>
    <div className="eval-heading-row">
      <div><h1 id="trace-eval-title">追踪 / Token 评测</h1><p>对追踪完整性、序列、Token 记账、工具审计、脱敏和检索查询延迟的确定性校验。</p></div>
      <div className="eval-heading-actions"><a className="eval-primary-link" href="/industry/traces">追踪浏览器</a><a href="/industry/eval">评测</a></div>
    </div>
    {error === null ? null : <p role="alert" className="eval-error">{error}</p>}

    <section className="eval-panel">
      <div className="eval-heading-row"><div><h2>批次运行</h2><p>数据集 <code>{DATASET_ID}</code> · 6 个关键可观测性门禁。</p></div><div className="eval-heading-actions">
        <select aria-label="追踪评测变体" value={variantId} disabled={busy} onChange={(event) => onVariantChange(event.target.value as TraceEvalVariant)}><option value="trace-broken-v0">trace-broken-v0</option><option value="trace-guarded-v1">trace-guarded-v1</option></select>
        <button type="button" disabled={busy} onClick={onStartRun}>运行追踪评测</button>
      </div></div>
    </section>

    {run === undefined || metrics === undefined ? <section className="eval-panel"><p>选择或开始一次运行以查看追踪指标。</p></section> : <>
      <section className="eval-summary-grid" aria-label="追踪评测摘要">
        <Metric label="发布门禁" value={metrics.releaseGate} critical={metrics.releaseGate === 'FAIL'} />
        <Metric label="通过率" value={percent(metrics.passRate)} critical={metrics.passRate < 1} />
        <Metric label="追踪完整性" value={percent(metrics.traceCompletenessRate)} critical={metrics.traceCompletenessRate < 1} />
        <Metric label="序列单调性" value={percent(metrics.sequenceMonotonicRate)} critical={metrics.sequenceMonotonicRate < 1} />
        <Metric label="Token 记账" value={percent(metrics.tokenAccountingConsistencyRate)} critical={metrics.tokenAccountingConsistencyRate < 1} />
        <Metric label="工具审计" value={percent(metrics.toolAuditCompletenessRate)} critical={metrics.toolAuditCompletenessRate < 1} />
        <Metric label="脱敏泄露" value={percent(metrics.redactionLeakRate)} critical={metrics.redactionLeakRate > 0} />
        <Metric label="查询延迟 P95" value={`${metrics.queryLatencyP95Ms} ms`} critical={metrics.queryLatencyBudgetPassRate < 1} />
      </section>
      {metrics.releaseGateReasons.length === 0 ? <section className="eval-panel"><strong>发布门禁 通过</strong><p>所有确定性可观测性门禁已通过。</p></section> : <section className="eval-panel"><h2>发布门禁 未通过</h2><ul>{metrics.releaseGateReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></section>}
    </>}

    <section className="eval-panel"><h2>运行记录</h2><table className="eval-table"><thead><tr><th>运行</th><th>变体</th><th>项目</th><th>门禁</th><th>通过</th><th>打开</th></tr></thead><tbody>{snapshot.runs.map((item) => <tr key={item.runId} data-selected={run?.runId === item.runId}><td><code>{item.runId}</code></td><td>{item.variantId}</td><td><code>{item.projectId}</code></td><td>{item.metrics.releaseGate}</td><td>{item.metrics.passedCount}/{item.metrics.sampleCount}</td><td><button type="button" disabled={busy} onClick={() => onSelectRun(item.runId)}>查看</button> <a href={traceEvalRunPath(item.runId)}>结果页</a></td></tr>)}</tbody></table></section>

    <section className="eval-panel"><h2>可观测性数据集</h2><table className="eval-table"><thead><tr><th>场景</th><th>拆分</th><th>期望</th><th>结果</th></tr></thead><tbody>{snapshot.cases.map((testCase) => { const observation = byCase.get(testCase.caseId); return <tr key={testCase.caseId}><td><strong>{testCase.scenario}</strong><br /><small>{testCase.title}</small></td><td>{testCase.split}</td><td>PASS{testCase.expected.maxLatencyMs === undefined ? '' : ` ≤ ${testCase.expected.maxLatencyMs} ms`}</td><td>{observation === undefined ? '—' : observation.passed ? 'PASS' : 'FAIL'}</td></tr> })}</tbody></table></section>

    <section className="eval-panel"><h2>失败下钻</h2>{snapshot.failures.length === 0 ? <p>所选运行中无失败的追踪安全用例。</p> : snapshot.failures.map((failure) => {
      const observation = snapshot.observations.find((item) => item.caseId === failure.caseId)
      return <article className="eval-panel" key={failure.caseId} data-trace-failure={failure.scenario}>
        <div className="eval-heading-row"><div><strong>{failure.scenario}</strong><p><code>{failure.caseId}</code></p></div><a href={tracePath(failure.traceId)}>打开追踪</a></div>
        <ul>{failure.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        {observation === undefined ? null : <ol>{observation.steps.map((step) => <li key={step.step}><strong>{step.step}</strong> · {step.outcome} — {step.detail}</li>)}</ol>}
      </article>
    })}</section>
  </main>
}

function Metric({ label, value, critical = false }: { label: string; value: string; critical?: boolean }) {
  return <article data-critical={critical}><strong>{value}</strong><span>{label}</span></article>
}

async function loadSnapshot(client: EvaluationApiClient, runId: string | undefined): Promise<TraceEvalSnapshot> {
  const [cases, runs] = await Promise.all([client.listTraceEvalCases(), client.listTraceEvalRuns()])
  const selectedId = runId ?? runs.find((item) => item.runId === 'run-trace-broken-v0')?.runId ?? runs[0]?.runId
  if (selectedId === undefined) return { cases, runs, observations: [], failures: [] }
  const [selectedRun, observations, failures] = await Promise.all([
    client.getTraceEvalRun(selectedId), client.listTraceEvalObservations(selectedId), client.listTraceEvalFailures(selectedId),
  ])
  return { cases, runs, selectedRun, observations, failures }
}

function percent(value: number): string { return `${(value * 100).toFixed(1)}%` }
function messageOf(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
