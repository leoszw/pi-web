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
    return <main className="eval-page"><h1>Mutation Eval</h1>{error === null ? <p>Loading mutation safety evaluation…</p> : <p role="alert">{error}</p>}</main>
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
      <div className="eval-eyebrow">Evaluation Workbench · P4</div>
      <div className="eval-heading-row">
        <div><h1 id="mutation-eval-title">Mutation Eval</h1><p>Deterministic safety evaluation for target resolution, scope isolation, explicit confirmation, digest binding, replay, version conflicts, and reconciliation.</p></div>
        <div className="eval-heading-actions"><a className="eval-primary-link" href="/industry/mutations">Mutation Center</a><a href="/industry/eval">Evaluation</a></div>
      </div>
      {error === null ? null : <p role="alert" className="eval-error">{error}</p>}

      <section className="eval-panel">
        <div className="eval-heading-row">
          <div><h2>Batch Run</h2><p>Dataset <code>{DATASET_ID}</code> · 7 critical safety cases.</p></div>
          <div className="eval-heading-actions">
            <select aria-label="Mutation eval variant" value={variantId} disabled={busy} onChange={(event) => onVariantChange(event.target.value as MutationEvalVariant)}>
              <option value="mutation-unsafe-v0">mutation-unsafe-v0</option>
              <option value="mutation-guarded-v1">mutation-guarded-v1</option>
            </select>
            <button type="button" disabled={busy} onClick={onStartRun}>Run mutation eval</button>
          </div>
        </div>
      </section>

      {run === undefined || metrics === undefined ? <section className="eval-panel"><p>Select or start a run to inspect metrics.</p></section> : <>
        <section className="eval-summary-grid" aria-label="Mutation evaluation summary">
          <MetricCard label="Release gate" value={metrics.releaseGate} critical={metrics.releaseGate === 'FAIL'} />
          <MetricCard label="Pass rate" value={percent(metrics.passRate)} critical={metrics.passRate < 1} />
          <MetricCard label="Critical pass" value={percent(metrics.criticalPassRate)} critical={metrics.criticalPassRate < 1} />
          <MetricCard label="Wrong target failure" value={percent(metrics.wrongTargetFailureRate)} critical={metrics.wrongTargetFailureRate > 0} />
          <MetricCard label="Scope leakage" value={percent(metrics.scopeLeakageRate)} critical={metrics.scopeLeakageRate > 0} />
          <MetricCard label="Confirmation bypass" value={percent(metrics.confirmationBypassRate)} critical={metrics.confirmationBypassRate > 0} />
          <MetricCard label="Digest guard" value={percent(metrics.digestMismatchGuardRate)} critical={metrics.digestMismatchGuardRate < 1} />
          <MetricCard label="Replay guard" value={percent(metrics.approvalReplayGuardRate)} critical={metrics.approvalReplayGuardRate < 1} />
          <MetricCard label="Version guard" value={percent(metrics.versionConflictGuardRate)} critical={metrics.versionConflictGuardRate < 1} />
          <MetricCard label="Reconciliation safety" value={percent(metrics.reconciliationSafetyRate)} critical={metrics.reconciliationSafetyRate < 1} />
          <MetricCard label="Unsafe retry" value={percent(metrics.unsafeCommitRetryRate)} critical={metrics.unsafeCommitRetryRate > 0} />
          <MetricCard label="Approval exposure" value={percent(metrics.approvalMaterialExposureRate)} critical={metrics.approvalMaterialExposureRate > 0} />
        </section>
        {metrics.releaseGateReasons.length === 0 ? <section className="eval-panel"><strong>Release Gate PASS</strong><p>All deterministic mutation safety gates passed for this run.</p></section> : <section className="eval-panel"><h2>Release Gate FAIL</h2><ul>{metrics.releaseGateReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></section>}
      </>}

      <section className="eval-panel">
        <h2>Runs</h2>
        <table className="eval-table"><thead><tr><th>Run</th><th>Variant</th><th>Project</th><th>Gate</th><th>Pass</th><th>Open</th></tr></thead><tbody>{snapshot.runs.map((item) => <tr key={item.runId} data-selected={run?.runId === item.runId}><td><code>{item.runId}</code></td><td>{item.variantId}</td><td><code>{item.projectId}</code></td><td>{item.metrics?.releaseGate ?? '—'}</td><td>{item.metrics === undefined ? '—' : `${item.metrics.passedCount}/${item.metrics.sampleCount}`}</td><td><button type="button" disabled={busy} onClick={() => onSelectRun(item.runId)}>Inspect</button> <a href={mutationEvalRunPath(item.runId)}>Result page</a></td></tr>)}</tbody></table>
      </section>

      <section className="eval-panel">
        <h2>Safety Dataset</h2>
        <table className="eval-table"><thead><tr><th>Scenario</th><th>Expected</th><th>Code</th><th>Split</th><th>Result</th></tr></thead><tbody>{snapshot.cases.map((testCase) => {
          const observation = observationsByCase.get(testCase.caseId)
          return <tr key={testCase.caseId}><td><strong>{testCase.scenario}</strong><br /><small>{testCase.title}</small></td><td>{testCase.expected.outcome}</td><td><code>{testCase.expected.code ?? '—'}</code></td><td>{testCase.split}</td><td>{observation === undefined ? '—' : observation.passed ? 'PASS' : 'FAIL'}</td></tr>
        })}</tbody></table>
      </section>

      <section className="eval-panel">
        <h2>Failure Drilldown</h2>
        {snapshot.failures.length === 0 ? <p>No failed mutation safety cases in the selected run.</p> : snapshot.failures.map((failure) => {
          const observation = snapshot.observations.find((item) => item.caseId === failure.caseId)
          return <article className="eval-panel" key={failure.caseId} data-mutation-failure={failure.scenario}>
            <div className="eval-heading-row"><div><strong>{failure.scenario}</strong><p><code>{failure.caseId}</code></p></div><a href={`/industry/traces/${encodeURIComponent(failure.traceId)}`}>trace</a></div>
            <p>Expected <strong>{failure.expectedOutcome}</strong> / actual <strong>{failure.actualOutcome}</strong></p>
            <p>Expected code <code>{failure.expectedCode ?? '—'}</code> / actual <code>{failure.actualCode ?? '—'}</code></p>
            <ul>{failure.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            {observation === undefined ? null : <ObservationDetail observation={observation} />}
          </article>
        })}
      </section>
    </main>
  )
}

function ObservationDetail({ observation }: { observation: MutationEvalObservation }) {
  return <div><dl className="eval-kv-grid"><div><dt>Commit attempts</dt><dd>{observation.commitAttempts}</dd></div><div><dt>Scope leakage</dt><dd>{yesNo(observation.scopeLeakage)}</dd></div><div><dt>Confirmation bypassed</dt><dd>{yesNo(observation.confirmationBypassed)}</dd></div><div><dt>Automatic retry attempted</dt><dd>{yesNo(observation.automaticRetryAttempted)}</dd></div><div><dt>Approval material exposed</dt><dd>{yesNo(observation.approvalMaterialExposed)}</dd></div></dl><ol>{observation.steps.map((step, index) => <li key={`${step.step}-${index}`}><strong>{step.step}</strong> · {step.outcome} — {step.detail}</li>)}</ol></div>
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
