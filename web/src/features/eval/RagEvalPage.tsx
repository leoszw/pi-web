import { useEffect, useMemo, useState } from 'react'
import type {
  RagEvalCase,
  RagEvalFailureSummary,
  RagEvalObservation,
  RagEvalRunSummary,
  RagEvalVariant,
} from '../../../../shared/industry/eval/rag'
import { createEvaluationApiClient, type EvaluationApiClient } from '../../api/industry-client'
import { ragEvalRunPath } from '../../app/routes'
import './eval.css'

const defaultClient = createEvaluationApiClient()
const DATASET_ID = 'rag-safety-v1'

export interface RagEvalSnapshot {
  cases: readonly RagEvalCase[]
  runs: readonly RagEvalRunSummary[]
  selectedRun?: RagEvalRunSummary
  observations: readonly RagEvalObservation[]
  failures: readonly RagEvalFailureSummary[]
  selectedCaseId?: string
}

export function RagEvalPage({ runId, client = defaultClient, initialSnapshot }: { runId?: string; client?: EvaluationApiClient; initialSnapshot?: RagEvalSnapshot }) {
  const [snapshot, setSnapshot] = useState<RagEvalSnapshot | undefined>(initialSnapshot)
  const [variantId, setVariantId] = useState<RagEvalVariant>('rag-guarded-v1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void loadSnapshot(client, runId).then((value) => { if (!cancelled) setSnapshot(value) }).catch((reason: unknown) => { if (!cancelled) setError(messageOf(reason)) })
    return () => { cancelled = true }
  }, [client, initialSnapshot, runId])

  async function startRun(): Promise<void> {
    setBusy(true); setError(null)
    try {
      const run = await client.startRagEvalRun({ datasetId: DATASET_ID, variantId })
      const [observations, failures, runs] = await Promise.all([client.listRagEvalObservations(run.runId), client.listRagEvalFailures(run.runId), client.listRagEvalRuns()])
      setSnapshot((current) => ({ cases: current?.cases ?? [], runs, selectedRun: run, observations, failures, selectedCaseId: failures[0]?.caseId ?? observations[0]?.caseId }))
    } catch (reason) { setError(messageOf(reason)) } finally { setBusy(false) }
  }

  async function selectRun(nextRunId: string): Promise<void> {
    setBusy(true); setError(null)
    try {
      const [selectedRun, observations, failures] = await Promise.all([client.getRagEvalRun(nextRunId), client.listRagEvalObservations(nextRunId), client.listRagEvalFailures(nextRunId)])
      setSnapshot((current) => current === undefined ? current : { ...current, selectedRun, observations, failures, selectedCaseId: failures[0]?.caseId ?? observations[0]?.caseId })
    } catch (reason) { setError(messageOf(reason)) } finally { setBusy(false) }
  }

  if (snapshot === undefined) return <main className="eval-page"><h1>RAG Eval</h1>{error === null ? <p>Loading RAG evaluation…</p> : <p role="alert">{error}</p>}</main>
  return <RagEvalView snapshot={snapshot} variantId={variantId} busy={busy} error={error} onVariantChange={setVariantId} onStartRun={() => void startRun()} onSelectRun={(id) => void selectRun(id)} onSelectCase={(caseId) => setSnapshot((value) => value === undefined ? value : { ...value, selectedCaseId: caseId })} />
}

export function RagEvalView({
  snapshot, variantId, busy, error, onVariantChange = () => undefined, onStartRun = () => undefined,
  onSelectRun = () => undefined, onSelectCase = () => undefined,
}: {
  snapshot: RagEvalSnapshot
  variantId: RagEvalVariant
  busy: boolean
  error: string | null
  onVariantChange?: (value: RagEvalVariant) => void
  onStartRun?: () => void
  onSelectRun?: (runId: string) => void
  onSelectCase?: (caseId: string) => void
}) {
  const run = snapshot.selectedRun
  const metrics = run?.metrics
  const observationsByCase = useMemo(() => new Map(snapshot.observations.map((item) => [item.caseId, item])), [snapshot.observations])
  const selectedObservation = snapshot.observations.find((item) => item.caseId === snapshot.selectedCaseId) ?? snapshot.observations[0]

  return <main className="eval-page" aria-labelledby="rag-eval-title">
    <div className="eval-eyebrow">Evaluation Workbench · P6</div>
    <div className="eval-heading-row"><div><h1 id="rag-eval-title">RAG Retrieval + Answer Eval</h1><p>Deterministic retrieval, ACL, groundedness, citation, unsupported-claim, and insufficient-evidence evaluation.</p></div><div className="eval-heading-actions"><a className="eval-primary-link" href="/industry/knowledge">Knowledge</a><a href="/industry/eval">Evaluation</a></div></div>
    {error === null ? null : <p role="alert" className="eval-error">{error}</p>}

    <section className="eval-panel"><div className="eval-heading-row"><div><h2>Batch Run</h2><p>Dataset <code>{DATASET_ID}</code> · retrieval and answer safety gates.</p></div><div className="eval-heading-actions"><select aria-label="RAG eval variant" value={variantId} disabled={busy} onChange={(event) => onVariantChange(event.target.value as RagEvalVariant)}><option value="rag-broken-v0">rag-broken-v0</option><option value="rag-guarded-v1">rag-guarded-v1</option></select><button type="button" disabled={busy} onClick={onStartRun}>Run RAG Eval</button></div></div></section>

    {metrics === undefined ? <section className="eval-panel"><p>Select or start a run to inspect RAG metrics.</p></section> : <>
      <section className="eval-summary-grid" aria-label="RAG evaluation summary">
        <Metric label="Release gate" value={metrics.releaseGate} critical={metrics.releaseGate === 'FAIL'} />
        <Metric label="Recall@1" value={percent(metrics.recallAt1)} critical={metrics.recallAt1 < 1} />
        <Metric label="Recall@3" value={percent(metrics.recallAt3)} critical={metrics.recallAt3 < 1} />
        <Metric label="Recall@5" value={percent(metrics.recallAt5)} critical={metrics.recallAt5 < 1} />
        <Metric label="MRR" value={metrics.mrr.toFixed(3)} critical={metrics.mrr < 1} />
        <Metric label="nDCG@5" value={metrics.ndcgAt5.toFixed(3)} critical={metrics.ndcgAt5 < 1} />
        <Metric label="Document hit" value={percent(metrics.documentHitRate)} critical={metrics.documentHitRate < 1} />
        <Metric label="Chunk hit" value={percent(metrics.chunkHitRate)} critical={metrics.chunkHitRate < 1} />
        <Metric label="Duplicate rate" value={percent(metrics.duplicateRate)} critical={metrics.duplicateRate > 0} />
        <Metric label="ACL leakage" value={percent(metrics.aclLeakageRate)} critical={metrics.aclLeakageRate > 0} />
        <Metric label="Groundedness" value={percent(metrics.groundedness)} critical={metrics.groundedness < 1} />
        <Metric label="Citation correctness" value={percent(metrics.citationCorrectness)} critical={metrics.citationCorrectness < 1} />
        <Metric label="Citation completeness" value={percent(metrics.citationCompleteness)} critical={metrics.citationCompleteness < 1} />
        <Metric label="Answer relevance" value={percent(metrics.answerRelevance)} critical={metrics.answerRelevance < 1} />
        <Metric label="Unsupported claims" value={percent(metrics.unsupportedClaimRate)} critical={metrics.unsupportedClaimRate > 0} />
        <Metric label="Insufficient evidence" value={percent(metrics.insufficientEvidenceCorrectness)} critical={metrics.insufficientEvidenceCorrectness < 1} />
      </section>
      {metrics.releaseGateReasons.length === 0 ? <section className="eval-panel"><strong>Release Gate PASS</strong><p>All deterministic RAG retrieval, ACL, answer, and citation gates passed.</p></section> : <section className="eval-panel"><h2>Release Gate FAIL</h2><ul>{metrics.releaseGateReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></section>}
    </>}

    <section className="eval-panel"><h2>Runs</h2><table className="eval-table"><thead><tr><th>Run</th><th>Variant</th><th>Project</th><th>Gate</th><th>Pass</th><th>Open</th></tr></thead><tbody>{snapshot.runs.map((item) => <tr key={item.runId} data-selected={run?.runId === item.runId}><td><code>{item.runId}</code></td><td>{item.variantId}</td><td>{item.projectId}</td><td>{item.metrics.releaseGate}</td><td>{item.metrics.passedCount}/{item.metrics.sampleCount}</td><td><button type="button" disabled={busy} onClick={() => onSelectRun(item.runId)}>Inspect</button> <a href={ragEvalRunPath(item.runId)}>Result page</a></td></tr>)}</tbody></table></section>

    <section className="eval-panel"><h2>RAG Dataset</h2><table className="eval-table"><thead><tr><th>Question</th><th>Expected evidence</th><th>Split</th><th>Result</th><th /></tr></thead><tbody>{snapshot.cases.map((testCase) => { const observation = observationsByCase.get(testCase.caseId); return <tr key={testCase.caseId}><td>{testCase.question}<br /><code>{testCase.caseId}</code></td><td>{testCase.expectedInsufficientEvidence ? 'INSUFFICIENT_EVIDENCE' : testCase.expectedEvidence.map((item) => `${item.section} p.${item.page}`).join(', ')}</td><td>{testCase.split}</td><td>{observation === undefined ? '—' : observation.passed ? 'PASS' : 'FAIL'}</td><td><button type="button" onClick={() => onSelectCase(testCase.caseId)}>Citation Inspector</button></td></tr> })}</tbody></table></section>

    <section className="eval-panel"><h2>Failure Drilldown</h2>{snapshot.failures.length === 0 ? <p>No failed RAG cases in the selected run.</p> : snapshot.failures.map((failure) => <article className="eval-panel" key={failure.caseId} data-rag-failure={failure.caseId}><div className="eval-heading-row"><div><strong>{failure.question}</strong><p><code>{failure.caseId}</code></p></div><button type="button" onClick={() => onSelectCase(failure.caseId)}>Inspect Citation</button></div><ul>{failure.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p>ACL leakage: <strong>{failure.aclLeakage ? 'YES' : 'NO'}</strong> · Unsupported claims: <strong>{percent(failure.unsupportedClaimRate)}</strong></p></article>)}</section>

    {selectedObservation === undefined ? null : <CitationInspector observation={selectedObservation} />}
  </main>
}

function CitationInspector({ observation }: { observation: RagEvalObservation }) {
  return <section className="eval-panel" data-citation-inspector={observation.caseId}>
    <h2>Citation Inspector</h2>
    <h3>Question</h3><p>{observation.question}</p>
    <h3>Expected Evidence</h3>{observation.expectedEvidence.length === 0 ? <p>No evidence expected; correct behavior is insufficient-evidence handling.</p> : <ul>{observation.expectedEvidence.map((item) => <li key={item.chunkId}><code>{item.documentId}</code> · {item.section} · p.{item.page} · {item.sourceVersion} · <code>{item.chunkId}</code></li>)}</ul>}
    <h3>Retrieved Chunks</h3><table className="eval-table"><thead><tr><th>Rank</th><th>Chunk</th><th>Parent Context</th><th>Page / Section</th><th>Source Version</th><th>ACL</th></tr></thead><tbody>{observation.retrievedChunks.map((chunk) => <tr key={`${chunk.rank}-${chunk.chunkId}`}><td>{chunk.rank}<br />{chunk.score.toFixed(3)}</td><td>{chunk.text}<br /><code>{chunk.chunkId}</code>{chunk.duplicateOfChunkId === undefined ? null : <><br /><small>duplicate of {chunk.duplicateOfChunkId}</small></>}</td><td>{chunk.parentContext}</td><td>p.{chunk.page}<br />{chunk.section}</td><td>{chunk.sourceVersion}</td><td>{chunk.aclAllowed ? 'ALLOWED' : 'LEAK'}</td></tr>)}</tbody></table>
    <h3>Answer</h3><p>{observation.answer}</p>
    <h3>Claim → Citation</h3>{observation.claims.length === 0 ? <p>No claims emitted.</p> : <table className="eval-table"><thead><tr><th>Claim</th><th>Citations</th><th>Supported</th></tr></thead><tbody>{observation.claims.map((claim) => <tr key={claim.claimId}><td>{claim.text}</td><td>{claim.citationChunkIds.length === 0 ? '—' : claim.citationChunkIds.map((id) => <code key={id}>{id} </code>)}</td><td>{claim.supported ? 'YES' : 'NO'}</td></tr>)}</tbody></table>}
    <p><small>Trace: <code>{observation.traceId}</code></small></p>
  </section>
}

function Metric({ label, value, critical = false }: { label: string; value: string; critical?: boolean }) { return <article data-critical={critical}><strong>{value}</strong><span>{label}</span></article> }

async function loadSnapshot(client: EvaluationApiClient, runId: string | undefined): Promise<RagEvalSnapshot> {
  const [cases, runs] = await Promise.all([client.listRagEvalCases(), client.listRagEvalRuns()])
  const selectedId = runId ?? runs.find((item) => item.runId === 'run-rag-broken-v0')?.runId ?? runs[0]?.runId
  if (selectedId === undefined) return { cases, runs, observations: [], failures: [] }
  const [selectedRun, observations, failures] = await Promise.all([client.getRagEvalRun(selectedId), client.listRagEvalObservations(selectedId), client.listRagEvalFailures(selectedId)])
  return { cases, runs, selectedRun, observations, failures, selectedCaseId: failures[0]?.caseId ?? observations[0]?.caseId }
}

function percent(value: number): string { return `${(value * 100).toFixed(1)}%` }
function messageOf(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
