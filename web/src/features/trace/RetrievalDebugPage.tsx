import { useEffect, useMemo, useState } from 'react'
import { RETRIEVAL_STAGE_ORDER, type RetrievalStage } from '../../../../shared/industry/eval/retrieval'
import type { RetrievalDebugResult } from '../../../../shared/industry/retrieval-debug'
import { createIndustryTraceApiClient, type IndustryTraceApiClient } from '../../api/trace-client'
import './retrieval-debug.css'

const defaultClient = createIndustryTraceApiClient()

const STAGE_LABELS: Record<RetrievalStage, string> = {
  SEMANTIC_PARSE: 'Semantic Parse',
  HARD_FILTERS: 'Hard Filters',
  EXACT: 'Exact',
  BM25: 'BM25',
  DENSE: 'Dense',
  ENTITY_AWARE: 'Entity-aware',
  RRF: 'RRF',
  RERANKER: 'Reranker',
  BUSINESS_FEATURE: 'Business Feature',
  FINAL: 'Final',
}

export function RetrievalDebugPage({
  traceId,
  client = defaultClient,
  initialResult,
}: {
  traceId: string
  client?: IndustryTraceApiClient
  initialResult?: RetrievalDebugResult
}) {
  const [result, setResult] = useState<RetrievalDebugResult | undefined>(initialResult)
  const [selectedStage, setSelectedStage] = useState<RetrievalStage>('FINAL')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialResult !== undefined) return undefined
    let cancelled = false
    void client.getRetrievalDebug(traceId)
      .then((value) => { if (!cancelled) setResult(value) })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { cancelled = true }
  }, [client, initialResult, traceId])

  if (error !== null) return <main className="retrieval-debug"><h1>Retrieval Debug</h1><p role="alert">{error}</p></main>
  if (result === undefined) return <main className="retrieval-debug"><h1>Retrieval Debug</h1><p>Loading trace retrieval chain…</p></main>
  return <RetrievalDebugView result={result} selectedStage={selectedStage} onStageChange={setSelectedStage} />
}

export function RetrievalDebugView({
  result,
  selectedStage,
  onStageChange = () => undefined,
}: {
  result: RetrievalDebugResult
  selectedStage: RetrievalStage
  onStageChange?: (stage: RetrievalStage) => void
}) {
  const stage = useMemo(() => result.stages.find((item) => item.stage === selectedStage), [result.stages, selectedStage])
  return <main className="retrieval-debug" aria-labelledby="retrieval-debug-title">
    <header className="retrieval-debug__heading">
      <div><span>Industry Agent · P5</span><h1 id="retrieval-debug-title">Retrieval Debug</h1><p>Single-trace troubleshooting. This is not Dataset Eval — it is a per-trace diagnostic snapshot, not an evaluation, comparison, or release workflow.</p></div>
      <nav><a href={`/industry/traces/${encodeURIComponent(result.traceId)}`}>Back to trace</a><a href="/industry/eval/playground/retrieval">Open Retrieval Eval</a></nav>
    </header>

    <section className="retrieval-debug__panel">
      <h2>Trace context</h2>
      <dl className="retrieval-debug__context">
        {Object.entries(result.queryContext).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(' → ') : String(value)}</dd></div>)}
      </dl>
      <p><strong>Trace:</strong> <code>{result.traceId}</code></p>
      <ul>{result.notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </section>

    <section className="retrieval-debug__panel">
      <h2>Retrieval pipeline</h2>
      <div className="retrieval-debug__stages">{RETRIEVAL_STAGE_ORDER.map((item, index) => {
        const snapshot = result.stages.find((entry) => entry.stage === item)
        return <button type="button" key={item} data-selected={item === selectedStage} onClick={() => onStageChange(item)}><span>{index + 1}</span><strong>{STAGE_LABELS[item]}</strong><small>{snapshot?.candidates.length ?? 0} candidates</small></button>
      })}</div>
    </section>

    <section className="retrieval-debug__panel">
      <div className="retrieval-debug__section-heading"><h2>{STAGE_LABELS[selectedStage]}</h2><span>{stage?.candidates.length ?? 0} candidates</span></div>
      {stage?.notes?.map((note) => <p key={note}>{note}</p>)}
      {stage?.removedEntityIds === undefined || stage.removedEntityIds.length === 0 ? null : <p className="retrieval-debug__removed"><strong>Removed:</strong> {stage.removedEntityIds.join(', ')}</p>}
      <div className="retrieval-debug__scroll"><table className="retrieval-debug__table"><thead><tr><th>Rank</th><th>Entity</th><th>Name / Flags</th><th>Source arms</th><th>Exact</th><th>BM25</th><th>Dense</th><th>Entity</th><th>RRF</th><th>Rerank</th><th>Business</th><th>Final</th><th>Reason</th></tr></thead><tbody>{(stage?.candidates ?? []).map((candidate) => <tr key={candidate.entityId} data-hard-negative={candidate.hardNegative === true}><td>{candidate.rank}</td><td><code>{candidate.entityId}</code></td><td><strong>{candidate.name}</strong>{candidate.hardNegative ? <span className="retrieval-debug__flag">Hard Negative</span> : null}{candidate.criticalSpecConflict ? <span className="retrieval-debug__flag" data-danger="true">Critical Spec Conflict</span> : null}</td><td>{candidate.sourceArm.join(', ')}</td><Score value={candidate.exactScore} /><Score value={candidate.bm25Score} /><Score value={candidate.denseScore} /><Score value={candidate.entityAwareScore} /><Score value={candidate.rrfScore} /><Score value={candidate.rerankScore} /><Score value={candidate.businessScore} /><Score value={candidate.finalScore} /><td>{candidate.reason.join(' · ')}</td></tr>)}</tbody></table></div>
    </section>
  </main>
}

function Score({ value }: { value?: number }) {
  return <td>{value === undefined ? '—' : value.toFixed(3)}</td>
}
