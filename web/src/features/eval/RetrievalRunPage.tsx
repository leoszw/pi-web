import { useEffect, useMemo, useState } from 'react'
import type { RetrievalEvalObservation, RetrievalRunSummary } from '../../../../shared/industry/eval/retrieval'
import { createEvaluationApiClient, type EvaluationApiClient } from '../../api/industry-client'
import './eval.css'

const defaultEvaluationClient = createEvaluationApiClient()

export interface RetrievalRunSnapshot {
  run: RetrievalRunSummary
  observations: readonly RetrievalEvalObservation[]
}

export function RetrievalRunPage({
  runId,
  client = defaultEvaluationClient,
  initialSnapshot,
}: {
  runId: string
  client?: EvaluationApiClient
  initialSnapshot?: RetrievalRunSnapshot
}) {
  const [snapshot, setSnapshot] = useState<RetrievalRunSnapshot | undefined>(initialSnapshot)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(() => firstFailureId(initialSnapshot?.observations ?? []))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void Promise.all([client.getRetrievalRun(runId), client.listRetrievalObservations(runId)])
      .then(([run, observations]) => {
        if (cancelled) return
        setSnapshot({ run, observations })
        setSelectedCaseId(firstFailureId(observations))
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      cancelled = true
    }
  }, [client, initialSnapshot, runId])

  if (error !== null) return <main className="eval-page"><h1>Retrieval Run</h1><p className="eval-error" role="alert">{error}</p></main>
  if (snapshot === undefined) return <main className="eval-page"><h1>Retrieval Run</h1><p>Loading retrieval run…</p></main>

  return <RetrievalRunView snapshot={snapshot} selectedCaseId={selectedCaseId} onSelectCase={setSelectedCaseId} />
}

export function RetrievalRunView({
  snapshot,
  selectedCaseId,
  onSelectCase = () => undefined,
}: {
  snapshot: RetrievalRunSnapshot
  selectedCaseId: string | null
  onSelectCase?: (caseId: string) => void
}) {
  const failures = useMemo(() => snapshot.observations.filter(isFailure), [snapshot.observations])
  const selected = snapshot.observations.find((item) => item.caseId === selectedCaseId) ?? failures[0] ?? snapshot.observations[0]
  const metrics = snapshot.run.metrics

  return (
    <main className="eval-page" aria-labelledby="retrieval-run-title">
      <div className="eval-eyebrow">Evaluation Workbench · P2 · Retrieval Run</div>
      <div className="eval-heading-row">
        <div>
          <h1 id="retrieval-run-title">Retrieval Failure Analysis</h1>
          <p><code>{snapshot.run.runId}</code> · {snapshot.run.variantId} · project <code>{snapshot.run.projectId}</code></p>
        </div>
        <a className="eval-primary-link" href="/industry/eval/playground/retrieval">Back to Retrieval Lab</a>
      </div>

      <section className="eval-summary-grid" aria-label="Retrieval run summary">
        <article><strong>{snapshot.observations.length}</strong><span>Cases</span></article>
        <article><strong>{failures.length}</strong><span>Failure cases</span></article>
        <article><strong>{percent(metrics?.hitAt1)}</strong><span>Hit@1</span></article>
        <article><strong>{number(metrics?.mrr)}</strong><span>MRR</span></article>
        <article><strong>{number(metrics?.ndcgAt10)}</strong><span>nDCG@10</span></article>
      </section>

      <section className="eval-panel">
        <div className="eval-panel-heading">
          <div>
            <h2>Case results</h2>
            <p>Failures include ranking misses and deterministic safety violations.</p>
          </div>
          <span className={failures.length === 0 ? 'eval-status-ok' : 'eval-status-danger'}>
            {failures.length === 0 ? 'No failures' : `${failures.length} failures`}
          </span>
        </div>
        <div className="eval-scroll">
          <table className="eval-table">
            <thead><tr><th>Case</th><th>Domain</th><th>Hit@1</th><th>Hit@10</th><th>Relevant rank</th><th>Top candidate</th><th>Safety</th><th>Trace</th><th /></tr></thead>
            <tbody>
              {snapshot.observations.map((observation) => {
                const top = observation.finalCandidates[0]
                return (
                  <tr key={observation.caseId} data-selected={observation.caseId === selected?.caseId} data-failure={isFailure(observation)}>
                    <td><code>{observation.caseId}</code></td>
                    <td>{observation.domain}</td>
                    <td>{observation.hitAt1 ? 'PASS' : 'FAIL'}</td>
                    <td>{observation.hitAt10 ? 'PASS' : 'FAIL'}</td>
                    <td>{observation.relevantRanks.join(', ') || '—'}</td>
                    <td>{top === undefined ? '—' : `${top.entityId} · ${top.name}`}</td>
                    <td><SafetyFlags observation={observation} /></td>
                    <td><code>{observation.traceId}</code></td>
                    <td><button className="eval-link-button" type="button" onClick={() => onSelectCase(observation.caseId)}>Inspect</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selected === undefined ? null : <ObservationDrilldown observation={selected} />}
    </main>
  )
}

function ObservationDrilldown({ observation }: { observation: RetrievalEvalObservation }) {
  return (
    <section className="eval-panel" id={`case-${observation.caseId}`} aria-labelledby="retrieval-failure-detail-title">
      <div className="eval-panel-heading">
        <div>
          <h2 id="retrieval-failure-detail-title">Case Drilldown · {observation.caseId}</h2>
          <p>{observation.query}</p>
        </div>
        <span className={isFailure(observation) ? 'eval-status-danger' : 'eval-status-ok'}>
          {isFailure(observation) ? 'FAILURE' : 'PASS'}
        </span>
      </div>

      <div className="eval-retrieval-expectation">
        <strong>Relevant entities</strong>
        <span>{observation.relevantEntityIds.join(', ')}</span>
        <strong>Relevant ranks</strong>
        <span>{observation.relevantRanks.join(', ') || 'not retrieved'}</span>
        <strong>Trace</strong>
        <code>{observation.traceId}</code>
      </div>

      <div className="eval-scroll">
        <table className="eval-table eval-retrieval-table">
          <thead><tr><th>Rank</th><th>Entity</th><th>Name</th><th>Final score</th><th>Hard negative</th><th>Critical spec</th><th>Source arms</th><th>Reason</th></tr></thead>
          <tbody>
            {observation.finalCandidates.map((candidate) => (
              <tr key={candidate.entityId} data-hard-negative={candidate.hardNegative === true}>
                <td>{candidate.rank}</td>
                <td><code>{candidate.entityId}</code></td>
                <td>{candidate.name}</td>
                <td>{candidate.finalScore?.toFixed(4) ?? '—'}</td>
                <td>{candidate.hardNegative ? 'YES' : '—'}</td>
                <td>{candidate.criticalSpecConflict ? 'YES' : '—'}</td>
                <td>{candidate.sourceArm.join(' + ')}</td>
                <td>{candidate.reason.join('；')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SafetyFlags({ observation }: { observation: RetrievalEvalObservation }) {
  const flags = [
    observation.crossProjectLeakage ? 'Cross-project' : null,
    observation.crossAlignmentConflict ? 'Cross-alignment' : null,
    observation.criticalSpecConflict ? 'Critical spec' : null,
    observation.wrongEntityHighConfidence ? 'Wrong entity HC' : null,
  ].filter((value): value is string => value !== null)
  return flags.length === 0 ? <span className="eval-status-ok">OK</span> : <span className="eval-status-danger">{flags.join(' · ')}</span>
}

function isFailure(observation: RetrievalEvalObservation): boolean {
  return !observation.hitAt1
    || !observation.hitAt10
    || observation.zeroResult
    || observation.crossProjectLeakage
    || observation.crossAlignmentConflict
    || observation.criticalSpecConflict
    || observation.wrongEntityHighConfidence
}

function firstFailureId(observations: readonly RetrievalEvalObservation[]): string | null {
  return observations.find(isFailure)?.caseId ?? observations[0]?.caseId ?? null
}

function percent(value: number | undefined): string {
  return value === undefined ? '—' : `${(value * 100).toFixed(1)}%`
}

function number(value: number | undefined): string {
  return value === undefined ? '—' : value.toFixed(4)
}
