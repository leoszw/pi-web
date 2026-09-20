import { useEffect, useMemo, useState } from 'react'
import type {
  MutationEvalCase,
  MutationEvalFailureSummary,
  MutationEvalObservation,
  MutationEvalRunSummary,
  MutationEvalVariant,
} from '../../../../shared/industry/eval/mutation'
import { createEvaluationApiClient, type EvaluationApiClient } from '../../api/industry-client'
import { mutationEvalRunPath } from '../../app/routes'
import './eval.css'
import './mutation-eval.css'

const defaultClient = createEvaluationApiClient()
const DATASET_ID = 'mutation-safety-v1'

export interface MutationEvalSnapshot {
  cases: readonly MutationEvalCase[]
  runs: readonly MutationEvalRunSummary[]
  selectedRun?: MutationEvalRunSummary
  observations: readonly MutationEvalObservation[]
  failures: readonly MutationEvalFailureSummary[]
}

export function MutationEvalPage({ runId, client = defaultClient, initialSnapshot }: { runId?: string; client?: EvaluationApiClient; initialSnapshot?: MutationEvalSnapshot }) {
  const [snapshot, setSnapshot] = useState<MutationEvalSnapshot | undefined>(initialSnapshot)
  const [variantId, setVariantId] = useState<MutationEvalVariant>('mutation-guarded-v1')
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
      const run = await client.startMutationEvalRun({ datasetId: DATASET_ID, variantId })
      const [observations, failures, runs] = await Promise.all([
        client.listMutationEvalObservations(run.runId),
        client.listMutationEvalFailures(run.runId),
        client.listMutationEvalRuns(),
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
        client.getMutationEvalRun(nextRunId),
        client.listMutationEvalObservations(nextRunId),
        client.listMutationEvalFailures(nextRunId),
      ])
      setSnapshot((current) => current === undefined ? current : { ...current, selectedRun, observations, failures })
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  if (snapshot === undefined) {
    return <main className="eval-page"><h1>变更评测</h1>{error === null ? <p>加载变更安全评测…</p> : <p role="alert">{error}</p>}</main>
  }

  return <MutationEvalView snapshot={snapshot} variantId={variantId} busy={busy} error={error} onVariantChange={setVariantId} onStartRun={() => void startRun()} onSelectRun={(value) => void selectRun(value)} />
}

export function MutationEvalView({
  snapshot,
  variantId,
  busy,
  error,
  onVariantChange = () => undefined,
  onStartRun = () => undefined,
  onSelectRun = () => undefined,
}: {
  snapshot: MutationEvalSnapshot
  variantId: MutationEvalVariant
  busy: boolean
  error: string | null
  onVariantChange?: (value: MutationEvalVariant) => void
  onStartRun?: () => void
  onSelectRun?: (runId: string) => void
}) {
  const run = snapshot.selectedRun
  const metrics = run?.metrics
  const observationsByCase = useMemo(() => new Map(snapshot.observations.map((item) => [item.caseId, item])), [snapshot.observations])

  return (
    <main className="eval-page" aria-labelledby="mutation-eval-title">
      <div className="eval-eyebrow">评测工作台 · P4</div>
      <div className="eval-heading-row">
        <div><h1 id="mutation-eval-title">变更评测</h1><p>针对目标解析、范围隔离、显式确认、摘要绑定、重放、版本冲突与对账的确定性安全评测。</p></div>
        <div className="eval-heading-actions"><a className="eval-primary-link" href="/industry/mutations">变更中心</a><a href="/industry/eval">评测</a></div>
      </div>
      {error === null ? null : <p role="alert" className="eval-error">{error}</p>}

      <section className="eval-panel">
        <div className="eval-heading-row">
          <div><h2>批次运行</h2><p>数据集 <code>{DATASET_ID}</code> · 7 个关键安全用例。</p></div>
          <div className="eval-heading-actions">
            <select aria-label="变更评测变体" value={variantId} disabled={busy} onChange={(event) => onVariantChange(event.target.value as MutationEvalVariant)}>
              <option value="mutation-unsafe-v0">mutation-unsafe-v0</option>
              <option value="mutation-guarded-v1">mutation-guarded-v1</option>
            </select>
            <button type="button" disabled={busy} onClick={onStartRun}>运行变更评测</button>
          </div>
        </div>
      </section>

      {run === undefined || metrics === undefined ? <section className="eval-panel"><p>选择或开始一次运行以查看指标。</p></section> : <>
        <section className="eval-summary-grid" aria-label="变更评测摘要">
          <MetricCard label="发布门禁" value={metrics.releaseGate} critical={metrics.releaseGate === 'FAIL'} />
          <MetricCard label="通过率" value={percent(metrics.passRate)} critical={metrics.passRate < 1} />
          <MetricCard label="关键通过" value={percent(metrics.criticalPassRate)} critical={metrics.criticalPassRate < 1} />
          <MetricCard label="目标误判失败" value={percent(metrics.wrongTargetFailureRate)} critical={metrics.wrongTargetFailureRate > 0} />
          <MetricCard label="范围泄露" value={percent(metrics.scopeLeakageRate)} critical={metrics.scopeLeakageRate > 0} />
          <MetricCard label="确认绕过" value={percent(metrics.confirmationBypassRate)} critical={metrics.confirmationBypassRate > 0} />
          <MetricCard label="摘要门禁" value={percent(metrics.digestMismatchGuardRate)} critical={metrics.digestMismatchGuardRate < 1} />
          <MetricCard label="重放门禁" value={percent(metrics.approvalReplayGuardRate)} critical={metrics.approvalReplayGuardRate < 1} />
          <MetricCard label="版本门禁" value={percent(metrics.versionConflictGuardRate)} critical={metrics.versionConflictGuardRate < 1} />
          <MetricCard label="对账安全" value={percent(metrics.reconciliationSafetyRate)} critical={metrics.reconciliationSafetyRate < 1} />
          <MetricCard label="不安全重试" value={percent(metrics.unsafeCommitRetryRate)} critical={metrics.unsafeCommitRetryRate > 0} />
          <MetricCard label="审批暴露" value={percent(metrics.approvalMaterialExposureRate)} critical={metrics.approvalMaterialExposureRate > 0} />
        </section>
        {metrics.releaseGateReasons.length === 0 ? <section className="eval-panel"><strong>发布门禁 通过</strong><p>本次运行的所有确定性变更安全门禁均已通过。</p></section> : <section className="eval-panel"><h2>发布门禁 未通过</h2><ul>{metrics.releaseGateReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></section>}
      </>}

      <section className="eval-panel">
        <h2>运行记录</h2>
        <table className="eval-table"><thead><tr><th>运行</th><th>变体</th><th>项目</th><th>门禁</th><th>通过</th><th>打开</th></tr></thead><tbody>{snapshot.runs.map((item) => <tr key={item.runId} data-selected={run?.runId === item.runId}><td><code>{item.runId}</code></td><td>{item.variantId}</td><td><code>{item.projectId}</code></td><td>{item.metrics?.releaseGate ?? '—'}</td><td>{item.metrics === undefined ? '—' : `${item.metrics.passedCount}/${item.metrics.sampleCount}`}</td><td><button type="button" disabled={busy} onClick={() => onSelectRun(item.runId)}>查看</button> <a href={mutationEvalRunPath(item.runId)}>结果页</a></td></tr>)}</tbody></table>
      </section>

      <section className="eval-panel">
        <h2>安全数据集</h2>
        <table className="eval-table"><thead><tr><th>场景</th><th>期望</th><th>代码</th><th>拆分</th><th>结果</th></tr></thead><tbody>{snapshot.cases.map((testCase) => {
          const observation = observationsByCase.get(testCase.caseId)
          return <tr key={testCase.caseId}><td><strong>{testCase.scenario}</strong><br /><small>{testCase.title}</small></td><td>{testCase.expected.outcome}</td><td><code>{testCase.expected.code ?? '—'}</code></td><td>{testCase.split}</td><td>{observation === undefined ? '—' : observation.passed ? 'PASS' : 'FAIL'}</td></tr>
        })}</tbody></table>
      </section>

      <section className="eval-panel">
        <h2>失败下钻</h2>
        {snapshot.failures.length === 0 ? <p>所选运行中没有失败的变更安全用例。</p> : snapshot.failures.map((failure) => {
          const observation = snapshot.observations.find((item) => item.caseId === failure.caseId)
          return <article className="eval-panel" key={failure.caseId} data-mutation-failure={failure.scenario}>
            <div className="eval-heading-row"><div><strong>{failure.scenario}</strong><p><code>{failure.caseId}</code></p></div><a href={`/industry/traces/${encodeURIComponent(failure.traceId)}`}>追踪</a></div>
            <p>期望 <strong>{failure.expectedOutcome}</strong> / 实际 <strong>{failure.actualOutcome}</strong></p>
            <p>期望代码 <code>{failure.expectedCode ?? '—'}</code> / 实际 <code>{failure.actualCode ?? '—'}</code></p>
            <ul>{failure.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            {observation === undefined ? null : <ObservationDetail observation={observation} />}
          </article>
        })}
      </section>
    </main>
  )
}

function ObservationDetail({ observation }: { observation: MutationEvalObservation }) {
  return <div><dl className="eval-kv-grid"><div><dt>提交尝试</dt><dd>{observation.commitAttempts}</dd></div><div><dt>范围泄露</dt><dd>{yesNo(observation.scopeLeakage)}</dd></div><div><dt>已跳过确认</dt><dd>{yesNo(observation.confirmationBypassed)}</dd></div><div><dt>已尝试自动重试</dt><dd>{yesNo(observation.automaticRetryAttempted)}</dd></div><div><dt>审批材料已暴露</dt><dd>{yesNo(observation.approvalMaterialExposed)}</dd></div></dl><ol>{observation.steps.map((step, index) => <li key={`${step.step}-${index}`}><strong>{step.step}</strong> · {step.outcome} — {step.detail}</li>)}</ol></div>
}

function MetricCard({ label, value, critical = false }: { label: string; value: string; critical?: boolean }) {
  return <article data-critical={critical}><strong>{value}</strong><span>{label}</span></article>
}

async function loadSnapshot(client: EvaluationApiClient, runId: string | undefined): Promise<MutationEvalSnapshot> {
  const [cases, runs] = await Promise.all([client.listMutationEvalCases(), client.listMutationEvalRuns()])
  const selectedId = runId ?? runs.find((item) => item.runId === 'run-mutation-unsafe-v0')?.runId ?? runs[0]?.runId
  if (selectedId === undefined) return { cases, runs, observations: [], failures: [] }
  const [selectedRun, observations, failures] = await Promise.all([
    client.getMutationEvalRun(selectedId),
    client.listMutationEvalObservations(selectedId),
    client.listMutationEvalFailures(selectedId),
  ])
  return { cases, runs, selectedRun, observations, failures }
}

function percent(value: number): string { return `${(value * 100).toFixed(1)}%` }
function yesNo(value: boolean): string { return value ? 'YES' : 'NO' }
function messageOf(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
