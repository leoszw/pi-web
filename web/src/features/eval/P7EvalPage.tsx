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

  if (snapshot === undefined) return <main className="eval-page"><h1>{title(domain)}</h1><p>{error ?? 'Loading P7 evaluation…'}</p></main>
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
    <div className="eval-eyebrow">Evaluation Workbench · P7</div>
    <div className="eval-heading-row">
      <div><h1 id="p7-title">{title(domain)}</h1><p>{description(domain)}</p></div>
      <div className="eval-heading-actions">
        <a href="/industry/eval/normalization">Normalization</a><a href="/industry/eval/entity">Entity</a><a href="/industry/eval/tool">Tool</a><a href="/industry/eval/memory">Memory</a><a href="/industry/eval">Evaluation</a>
      </div>
    </div>
    {error === null ? null : <p className="eval-error" role="alert">{error}</p>}

    <section className="eval-panel">
      <div className="eval-heading-row"><div><h2>Batch Run</h2><p>Dataset <code>{datasetId(domain)}</code> · deterministic P7 safety profile.</p></div><div className="eval-heading-actions">
        <select aria-label="P7 variant" value={variantId} disabled={busy} onChange={(event) => onVariantChange(event.target.value as P7EvalVariant)}><option value="p7-broken-v0">p7-broken-v0</option><option value="p7-guarded-v1">p7-guarded-v1</option></select>
        <button type="button" disabled={busy} onClick={onStartRun}>Run {shortName(domain)} Eval</button>
      </div></div>
    </section>

    {run === undefined ? <section className="eval-panel"><p>Select or start a run.</p></section> : <MetricPanel domain={domain} metrics={run.metrics} />}

    <section className="eval-panel"><h2>Runs</h2><table className="eval-table"><thead><tr><th>Run</th><th>Variant</th><th>Project</th><th>Gate</th><th>Pass</th><th /></tr></thead><tbody>{snapshot.runs.map((item) => <tr key={item.runId} data-selected={run?.runId === item.runId}><td><code>{item.runId}</code></td><td>{item.variantId}</td><td><code>{item.projectId}</code></td><td>{item.metrics.releaseGate}</td><td>{item.metrics.passedCount}/{item.metrics.sampleCount}</td><td><button type="button" disabled={busy} onClick={() => onSelectRun(item.runId)}>Inspect</button></td></tr>)}</tbody></table></section>

    <section className="eval-panel"><h2>Cases</h2><table className="eval-table"><thead><tr><th>Case</th><th>Input</th><th>Expected</th><th>Result</th></tr></thead><tbody>{snapshot.cases.map((testCase) => { const observation = byCase.get(testCase.caseId); return <tr key={testCase.caseId}><td><strong>{testCase.title}</strong><br /><code>{testCase.caseId}</code></td><td>{caseInput(testCase)}</td><td>{caseExpected(testCase)}</td><td>{observation === undefined ? '—' : observation.passed ? 'PASS' : `FAIL · ${observation.failureStage ?? 'UNKNOWN'}`}</td></tr> })}</tbody></table></section>

    <section className="eval-panel"><h2>Failure Drilldown</h2>{snapshot.failures.length === 0 ? <p>No failed cases in the selected run.</p> : snapshot.failures.map((failure) => {
      const observation = snapshot.observations.find((item) => item.caseId === failure.caseId)
      return <article className="eval-panel" key={failure.caseId} data-p7-failure={failure.failureStage ?? 'UNKNOWN'}><div className="eval-heading-row"><div><strong>{failure.title}</strong><p><code>{failure.caseId}</code> · {failure.failureStage ?? 'UNKNOWN'}</p></div><code>{failure.traceId}</code></div><ul>{failure.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>{observation === undefined ? null : <dl><div><dt>Expected</dt><dd>{observation.expectedSummary}</dd></div><div><dt>Actual</dt><dd>{observation.actualSummary}</dd></div></dl>}</article>
    })}</section>

    <section className="eval-panel"><h2>Trace-created Drafts</h2><p>Drafts created from Trace remain unreviewed and are not Golden cases.</p>{snapshot.drafts.length === 0 ? <p>No P7 drafts for this project.</p> : <table className="eval-table"><thead><tr><th>Draft</th><th>Source Trace</th><th>Target</th><th>Status</th><th>Reviewed</th></tr></thead><tbody>{snapshot.drafts.map((draft) => <tr key={draft.draftId}><td><code>{draft.draftId}</code></td><td>{draft.sourceTraceName}<br /><code>{draft.sourceTraceId}</code></td><td>{draft.targetDomain}</td><td>{draft.status}</td><td>{String(draft.reviewed)}</td></tr>)}</tbody></table>}</section>
  </main>
}

function MetricPanel({ domain, metrics }: { domain: P7EvalDomain; metrics: P7EvalMetrics }) {
  const common = <><Metric label="Release gate" value={metrics.releaseGate} bad={metrics.releaseGate === 'FAIL'} /><Metric label="Pass rate" value={percent(metrics.passRate)} bad={metrics.passRate < 1} /></>
  return <section className="eval-summary-grid" aria-label={`${domain} metrics`}>{common}{domain === 'NORMALIZATION' ? <Metric label="Normalization accuracy" value={percent(metrics.normalizationAccuracy ?? 0)} bad={(metrics.normalizationAccuracy ?? 0) < 1} /> : null}{domain === 'ENTITY' ? <><Metric label="Entity resolution" value={percent(metrics.entityResolutionAccuracy ?? 0)} bad={(metrics.entityResolutionAccuracy ?? 0) < 1} />{Object.entries(metrics.entityFailureStageCounts ?? {}).map(([stage, count]) => <Metric key={stage} label={stage} value={String(count)} bad={count > 0} />)}</> : null}{domain === 'TOOL' ? <><Metric label="Selection" value={percent(metrics.toolSelectionAccuracy ?? 0)} bad={(metrics.toolSelectionAccuracy ?? 0) < 1} /><Metric label="Arguments exact" value={percent(metrics.toolArgumentExactRate ?? 0)} bad={(metrics.toolArgumentExactRate ?? 0) < 1} /><Metric label="Missing required" value={percent(metrics.toolMissingRequiredRate ?? 0)} bad={(metrics.toolMissingRequiredRate ?? 0) > 0} /><Metric label="Unknown argument" value={percent(metrics.toolUnknownArgumentRate ?? 0)} bad={(metrics.toolUnknownArgumentRate ?? 0) > 0} /><Metric label="Scope blocked" value={percent(metrics.toolScopeInjectionBlockedRate ?? 0)} bad={(metrics.toolScopeInjectionBlockedRate ?? 0) < 1} /><Metric label="Unnecessary tool" value={percent(metrics.toolUnnecessaryToolRate ?? 0)} bad={(metrics.toolUnnecessaryToolRate ?? 0) > 0} /><Metric label="Sequence" value={percent(metrics.toolSequenceAccuracy ?? 0)} bad={(metrics.toolSequenceAccuracy ?? 0) < 1} /></> : null}{domain === 'MEMORY' ? <><Metric label="Resolution" value={percent(metrics.memoryResolutionAccuracy ?? 0)} bad={(metrics.memoryResolutionAccuracy ?? 0) < 1} /><Metric label="Project isolation" value={percent(metrics.memoryProjectIsolationRate ?? 0)} bad={(metrics.memoryProjectIsolationRate ?? 0) < 1} /><Metric label="TTL policy" value={percent(metrics.memoryTtlPolicyRate ?? 0)} bad={(metrics.memoryTtlPolicyRate ?? 0) < 1} /><Metric label="Source policy" value={percent(metrics.memorySourcePolicyRate ?? 0)} bad={(metrics.memorySourcePolicyRate ?? 0) < 1} /></> : null}</section>
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
function title(domain: P7EvalDomain): string { if (domain === 'NORMALIZATION') return 'Normalization Lab'; if (domain === 'ENTITY') return 'Entity Lab'; if (domain === 'TOOL') return 'Tool Eval'; return 'Memory Eval' }
function shortName(domain: P7EvalDomain): string { return domain === 'NORMALIZATION' ? 'Normalization' : domain === 'ENTITY' ? 'Entity' : domain === 'TOOL' ? 'Tool' : 'Memory' }
function description(domain: P7EvalDomain): string { if (domain === 'NORMALIZATION') return 'Chainage, range, alignment, side, unit, BOQ code, date, specification, and abbreviation normalization.'; if (domain === 'ENTITY') return 'Entity resolution with explicit Mention → Candidate Generation → Ranking → Scope → Ambiguity failure stages.'; if (domain === 'TOOL') return 'Tool selection, exact arguments, required/unknown arguments, scope-injection blocking, unnecessary calls, and sequence.'; return 'Context reference resolution plus project isolation, TTL, and memory source policy.' }
function caseInput(testCase: P7EvalCase): string { if (testCase.domain === 'NORMALIZATION') return testCase.input; if (testCase.domain === 'ENTITY') return testCase.mention; if (testCase.domain === 'TOOL') return testCase.query; return `${testCase.utterance} · ${testCase.previousContext.join(' / ')}` }
function caseExpected(testCase: P7EvalCase): string { if (testCase.domain === 'NORMALIZATION') return testCase.expectedNormalized; if (testCase.domain === 'ENTITY') return `${testCase.expectedEntityId} · ${testCase.expectedScope}`; if (testCase.domain === 'TOOL') return testCase.expectedTools.length === 0 ? 'no tool' : testCase.expectedSequence.join(' → '); return `${testCase.expectedResolution} · ${testCase.sourcePolicy}` }
function percent(value: number): string { return `${(value * 100).toFixed(1)}%` }
function messageOf(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
