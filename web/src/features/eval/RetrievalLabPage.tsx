import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type {
  RetrievalCandidate,
  RetrievalDomain,
  RetrievalEvalCase,
  RetrievalLeakageReport,
  RetrievalPlaygroundResult,
  RetrievalStage,
  RetrievalStageSnapshot,
} from '../../../../shared/industry/eval/retrieval'
import { RETRIEVAL_STAGE_ORDER } from '../../../../shared/industry/eval/retrieval'
import { createEvaluationApiClient, type EvaluationApiClient } from '../../api/industry-client'
import './eval.css'

const defaultEvaluationClient = createEvaluationApiClient()
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

export interface RetrievalLabSnapshot {
  cases: readonly RetrievalEvalCase[]
  leakageReport: RetrievalLeakageReport
  result?: RetrievalPlaygroundResult
}

export function RetrievalLabPage({
  client = defaultEvaluationClient,
  initialSnapshot,
}: {
  client?: EvaluationApiClient
  initialSnapshot?: RetrievalLabSnapshot
}) {
  const [snapshot, setSnapshot] = useState<RetrievalLabSnapshot | undefined>(initialSnapshot)
  const [domain, setDomain] = useState<RetrievalDomain>(initialSnapshot?.result?.queryContext.domain ?? initialSnapshot?.cases[0]?.domain ?? 'ENGINEERING')
  const [selectedCaseId, setSelectedCaseId] = useState(initialSnapshot?.result?.caseId ?? initialSnapshot?.cases[0]?.caseId ?? '')
  const [query, setQuery] = useState(initialSnapshot?.result?.queryContext.query ?? initialSnapshot?.cases[0]?.queryContext.query ?? '')
  const [variantId, setVariantId] = useState(initialSnapshot?.result?.variantId ?? 'retrieval-stable-v1')
  const [selectedStage, setSelectedStage] = useState<RetrievalStage>('FINAL')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void Promise.all([client.listRetrievalCases(), client.getRetrievalLeakageReport()])
      .then(([cases, leakageReport]) => {
        if (cancelled) return
        const first = cases[0]
        setSnapshot({ cases, leakageReport })
        if (first !== undefined) {
          setSelectedCaseId(first.caseId)
          setDomain(first.domain)
          setQuery(first.queryContext.query)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(messageOf(reason))
      })
    return () => {
      cancelled = true
    }
  }, [client, initialSnapshot])

  async function runPlayground(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (query.trim() === '') return
    setRunning(true)
    setError(null)
    try {
      const result = await client.playgroundRetrieval({ query: query.trim(), domain, variantId })
      setSnapshot((current) => current === undefined ? current : { ...current, result })
      setSelectedStage('FINAL')
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setRunning(false)
    }
  }

  function clearResult(): void {
    setSnapshot((current) => current === undefined ? current : { ...current, result: undefined })
    setSelectedStage('FINAL')
    setError(null)
  }

  function changeDomain(nextDomain: RetrievalDomain): void {
    if (nextDomain === domain) return
    const first = snapshot?.cases.find((item) => item.domain === nextDomain)
    setDomain(nextDomain)
    setSelectedCaseId(first?.caseId ?? '')
    setQuery(first?.queryContext.query ?? '')
    clearResult()
  }

  function selectCase(caseId: string): void {
    const testCase = snapshot?.cases.find((item) => item.caseId === caseId)
    if (testCase === undefined) return
    setSelectedCaseId(testCase.caseId)
    setDomain(testCase.domain)
    setQuery(testCase.queryContext.query)
    clearResult()
  }

  if (error !== null && snapshot === undefined) {
    return <main className="eval-page"><h1>Retrieval Lab</h1><p className="eval-error" role="alert">{error}</p></main>
  }
  if (snapshot === undefined) return <main className="eval-page"><h1>Retrieval Lab</h1><p>Loading retrieval fixtures…</p></main>

  return (
    <RetrievalLabView
      snapshot={snapshot}
      domain={domain}
      selectedCaseId={selectedCaseId}
      query={query}
      variantId={variantId}
      selectedStage={selectedStage}
      running={running}
      error={error}
      onDomainChange={changeDomain}
      onCaseSelect={selectCase}
      onQueryChange={setQuery}
      onVariantChange={setVariantId}
      onStageSelect={setSelectedStage}
      onSubmit={(event) => void runPlayground(event)}
    />
  )
}

export function RetrievalLabView({
  snapshot,
  domain,
  selectedCaseId,
  query,
  variantId,
  selectedStage,
  running,
  error,
  onDomainChange = () => undefined,
  onCaseSelect = () => undefined,
  onQueryChange = () => undefined,
  onVariantChange = () => undefined,
  onStageSelect = () => undefined,
  onSubmit = (event) => event.preventDefault(),
}: {
  snapshot: RetrievalLabSnapshot
  domain: RetrievalDomain
  selectedCaseId: string
  query: string
  variantId: string
  selectedStage: RetrievalStage
  running: boolean
  error: string | null
  onDomainChange?: (domain: RetrievalDomain) => void
  onCaseSelect?: (caseId: string) => void
  onQueryChange?: (query: string) => void
  onVariantChange?: (variantId: string) => void
  onStageSelect?: (stage: RetrievalStage) => void
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void
}) {
  const filteredCases = useMemo(() => snapshot.cases.filter((item) => item.domain === domain), [snapshot.cases, domain])
  const selectedCase = snapshot.cases.find((item) => item.caseId === selectedCaseId)
  const selectedSnapshot = snapshot.result?.stages.find((stage) => stage.stage === selectedStage)

  return (
    <main className="eval-page" aria-labelledby="retrieval-lab-title">
      <div className="eval-eyebrow">Evaluation Workbench · P2</div>
      <div className="eval-heading-row">
        <div>
          <h1 id="retrieval-lab-title">Retrieval Lab</h1>
          <p>Engineering / BOQ hybrid retrieval fixture workbench. Every retrieval layer remains inspectable; no real OpenSearch or model calls are used.</p>
        </div>
        <a className="eval-primary-link" href="/industry/eval/intent">Intent Lab</a>
      </div>

      {error === null ? null : <p className="eval-error" role="alert">{error}</p>}

      <section className="eval-panel">
        <div className="eval-form-row">
          <label>
            Domain
            <select value={domain} onChange={(event) => onDomainChange(event.target.value as RetrievalDomain)}>
              <option value="ENGINEERING">Engineering</option>
              <option value="BOQ">BOQ</option>
            </select>
          </label>
          <label>
            Fixture case
            <select value={selectedCaseId} onChange={(event) => onCaseSelect(event.target.value)}>
              {filteredCases.map((testCase) => <option value={testCase.caseId} key={testCase.caseId}>{testCase.caseId}</option>)}
            </select>
          </label>
          <label>
            Variant
            <select value={variantId} onChange={(event) => onVariantChange(event.target.value)}>
              <option value="retrieval-stable-v1">Stable v1</option>
              <option value="retrieval-candidate-v2">Candidate v2</option>
            </select>
          </label>
        </div>

        <form className="eval-retrieval-query" onSubmit={onSubmit}>
          <label>
            Query
            <textarea rows={3} value={query} onChange={(event) => onQueryChange(event.target.value)} />
          </label>
          <button type="submit" disabled={running || query.trim() === ''}>{running ? 'Running…' : 'Run Retrieval'}</button>
        </form>

        {selectedCase === undefined ? null : <CaseExpectation testCase={selectedCase} />}
      </section>

      {snapshot.result === undefined ? (
        <section className="eval-panel"><h2>Layer inspection</h2><p>Run a fixture query to inspect every retrieval stage.</p></section>
      ) : (
        <>
          <SemanticParsePanel result={snapshot.result} />
          <StageNavigator result={snapshot.result} selectedStage={selectedStage} onStageSelect={onStageSelect} />
          <StageDetail snapshot={selectedSnapshot} />
        </>
      )}

      <LeakagePanel report={snapshot.leakageReport} />
    </main>
  )
}

function CaseExpectation({ testCase }: { testCase: RetrievalEvalCase }) {
  return (
    <div className="eval-retrieval-expectation">
      <strong>Expected</strong>
      <span>Relevant: {testCase.expected.relevantEntityIds.join(', ')}</span>
      <span>Hard negatives: {testCase.expected.hardNegativeEntityIds.join(', ')}</span>
      <span>Split: {testCase.split}</span>
      <div className="eval-tags">{testCase.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    </div>
  )
}

function SemanticParsePanel({ result }: { result: RetrievalPlaygroundResult }) {
  const entries = Object.entries(result.queryContext).filter(([, value]) => value !== undefined)
  return (
    <section className="eval-panel">
      <div className="eval-panel-heading">
        <h2>Semantic Parse</h2>
        <code>{result.traceId}</code>
      </div>
      <dl className="eval-retrieval-context">
        {entries.map(([key, value]) => (
          <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(' / ') : String(value)}</dd></div>
        ))}
      </dl>
    </section>
  )
}

function StageNavigator({
  result,
  selectedStage,
  onStageSelect,
}: {
  result: RetrievalPlaygroundResult
  selectedStage: RetrievalStage
  onStageSelect: (stage: RetrievalStage) => void
}) {
  return (
    <section className="eval-panel">
      <h2>Retrieval pipeline</h2>
      <div className="eval-stage-grid" aria-label="Retrieval stages">
        {RETRIEVAL_STAGE_ORDER.map((stage, index) => {
          const stageSnapshot = result.stages.find((item) => item.stage === stage)
          return (
            <button
              type="button"
              key={stage}
              data-selected={stage === selectedStage}
              onClick={() => onStageSelect(stage)}
            >
              <span>{index + 1}</span>
              <strong>{STAGE_LABELS[stage]}</strong>
              <small>{stageSnapshot?.candidates.length ?? 0} candidates</small>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function StageDetail({ snapshot }: { snapshot: RetrievalStageSnapshot | undefined }) {
  if (snapshot === undefined) return <section className="eval-panel"><p>Stage data unavailable.</p></section>
  return (
    <section className="eval-panel" aria-labelledby="retrieval-stage-title">
      <div className="eval-panel-heading">
        <h2 id="retrieval-stage-title">{STAGE_LABELS[snapshot.stage]}</h2>
        <span className="eval-muted">{snapshot.candidates.length} candidates</span>
      </div>
      {snapshot.notes?.map((note) => <p className="eval-muted" key={note}>{note}</p>)}
      {snapshot.removedEntityIds === undefined || snapshot.removedEntityIds.length === 0 ? null : (
        <p className="eval-retrieval-removed"><strong>Removed by hard filters:</strong> {snapshot.removedEntityIds.join(', ')}</p>
      )}
      {snapshot.candidates.length === 0 ? <p>No ranked candidates at this stage.</p> : <CandidateTable candidates={snapshot.candidates} />}
    </section>
  )
}

function CandidateTable({ candidates }: { candidates: readonly RetrievalCandidate[] }) {
  return (
    <div className="eval-scroll">
      <table className="eval-table eval-retrieval-table">
        <thead>
          <tr>
            <th>Rank</th><th>Entity</th><th>Name</th><th>Flags</th><th>Source arms</th>
            <th>Exact</th><th>BM25</th><th>Dense</th><th>Entity</th><th>RRF</th><th>Rerank</th><th>Business</th><th>Final</th><th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((candidate) => (
            <tr key={candidate.entityId} data-hard-negative={candidate.hardNegative === true}>
              <td>{candidate.rank}</td>
              <td><code>{candidate.entityId}</code></td>
              <td>{candidate.name}</td>
              <td><CandidateFlags candidate={candidate} /></td>
              <td>{candidate.sourceArm.join(' + ')}</td>
              <Score value={candidate.exactScore} />
              <Score value={candidate.bm25Score} />
              <Score value={candidate.denseScore} />
              <Score value={candidate.entityAwareScore} />
              <Score value={candidate.rrfScore} />
              <Score value={candidate.rerankScore} />
              <Score value={candidate.businessScore} />
              <Score value={candidate.finalScore} />
              <td>{candidate.reason.join('；')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CandidateFlags({ candidate }: { candidate: RetrievalCandidate }) {
  if (!candidate.hardNegative && !candidate.criticalSpecConflict) return <span className="eval-muted">—</span>
  return (
    <div className="eval-candidate-flags">
      {candidate.hardNegative ? <span data-kind="warning">Hard Negative</span> : null}
      {candidate.criticalSpecConflict ? <span data-kind="danger">Critical Spec Conflict</span> : null}
    </div>
  )
}

function Score({ value }: { value: number | undefined }) {
  return <td>{value === undefined ? '—' : value.toFixed(4)}</td>
}

function LeakagePanel({ report }: { report: RetrievalLeakageReport }) {
  return (
    <section className="eval-panel">
      <div className="eval-panel-heading">
        <h2>Dataset leakage check</h2>
        <span className={report.releaseHoldoutContaminated ? 'eval-status-danger' : 'eval-status-ok'}>
          {report.releaseHoldoutContaminated ? 'RELEASE_HOLDOUT contaminated' : 'No holdout contamination'}
        </span>
      </div>
      <table className="eval-table">
        <thead><tr><th>Kind</th><th>Cases</th><th>Splits</th><th>Severity</th><th>Reason</th></tr></thead>
        <tbody>
          {report.findings.map((finding) => (
            <tr key={finding.findingId}>
              <td>{finding.kind}</td>
              <td>{finding.caseIds.join(', ')}</td>
              <td>{finding.splits.join(' / ')}</td>
              <td>{finding.severity}</td>
              <td>{finding.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
