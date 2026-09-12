import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import type { EvalVariantSummary } from '../../../../shared/industry/eval/common'
import type { EvalDatasetSummary, IntentEvalCase, IntentName, IntentTurn } from '../../../../shared/industry/eval/datasets'
import type { EvalRunSummary, IntentEvalObservation, IntentPlaygroundResult, IntentRunComparison } from '../../../../shared/industry/eval/runs'
import { createEvaluationApiClient, type EvaluationApiClient } from '../../api/industry-client'
import { ConfusionMatrix } from './components/ConfusionMatrix'
import { FailureList } from './components/FailureList'
import { MetricTable } from './components/MetricTable'
import './eval.css'

const defaultEvaluationClient = createEvaluationApiClient()

export interface IntentLabSnapshot {
  datasets: readonly EvalDatasetSummary[]
  variants: readonly EvalVariantSummary[]
  runs: readonly EvalRunSummary[]
}

export function IntentLabPage({
  client = defaultEvaluationClient,
  initialSnapshot,
  initialCases = [],
}: {
  client?: EvaluationApiClient
  initialSnapshot?: IntentLabSnapshot
  initialCases?: readonly IntentEvalCase[]
}) {
  const [snapshot, setSnapshot] = useState<IntentLabSnapshot | undefined>(initialSnapshot)
  const [datasetId, setDatasetId] = useState('intent-regression-v1')
  const [variantId, setVariantId] = useState('intent-candidate-v2')
  const [cases, setCases] = useState<readonly IntentEvalCase[]>(initialCases)
  const [query, setQuery] = useState('K12+300到K12+800左幅有哪些清单项')
  const [previousIntent, setPreviousIntent] = useState('')
  const [playground, setPlayground] = useState<IntentPlaygroundResult | null>(null)
  const [activeRun, setActiveRun] = useState<EvalRunSummary | null>(null)
  const [observations, setObservations] = useState<readonly IntentEvalObservation[]>([])
  const [comparison, setComparison] = useState<IntentRunComparison | null>(null)
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(initialCases[0]?.caseId ?? null)
  const [expectedIntent, setExpectedIntent] = useState<IntentName | ''>('')
  const [savedDraftCaseId, setSavedDraftCaseId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void Promise.all([client.listDatasets(), client.listVariants(), client.listRuns()])
      .then(([datasets, variants, runs]) => {
        if (!cancelled) setSnapshot({ datasets, variants, runs })
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(messageOf(reason))
      })
    return () => {
      cancelled = true
    }
  }, [client, initialSnapshot])

  useEffect(() => {
    let cancelled = false
    void client.listCases(datasetId)
      .then((items) => {
        if (!cancelled) {
          setCases(items)
          setSelectedCaseId((current) => current !== null && items.some((item) => item.caseId === current) ? current : (items[0]?.caseId ?? null))
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(messageOf(reason))
      })
    return () => {
      cancelled = true
    }
  }, [client, datasetId])

  const selectedCase = useMemo(() => cases.find((item) => item.caseId === selectedCaseId) ?? null, [cases, selectedCaseId])

  const previousTurns = useMemo<readonly IntentTurn[]>(() => {
    if (previousIntent === '') return []
    if (!isIntentName(previousIntent)) return []
    return [{ role: 'assistant', text: 'previous resolved turn', resolvedIntent: previousIntent }]
  }, [previousIntent])

  const runPlayground = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setPlayground(await client.playgroundIntent({ query, previousTurns, variantId }))
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  const startRun = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const run = await client.startIntentRun({ datasetId, variantId })
      const items = await client.listObservations(run.runId)
      setActiveRun(run)
      setObservations(items)
      const runs = await client.listRuns()
      if (snapshot !== undefined) setSnapshot({ ...snapshot, runs })
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  const compareSeedRuns = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setComparison(await client.compareRuns('run-intent-baseline-v1', 'run-intent-candidate-v2'))
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }


  const saveAsDraftCase = async (): Promise<void> => {
    if (expectedIntent === '') {
      setError('Choose an expected intent before saving a Draft case.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const created = await client.createDraftCase('intent-draft-v1', {
        query,
        previousTurns,
        expected: {
          primaryIntent: expectedIntent,
          acceptableIntents: [expectedIntent],
          mustNot: expectedIntent === 'MUTATION' ? [] : ['MUTATION'],
        },
        tags: ['playground'],
        difficulty: 'HARD',
        critical: expectedIntent === 'MUTATION',
        notes: 'Saved from Intent Lab playground for human review.',
      })
      setSavedDraftCaseId(created.caseId)
      const datasets = await client.listDatasets()
      if (snapshot !== undefined) setSnapshot({ ...snapshot, datasets })
      if (datasetId === 'intent-draft-v1') {
        const updatedCases = await client.listCases(datasetId)
        setCases(updatedCases)
        setSelectedCaseId(created.caseId)
      }
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  if (error !== null && snapshot === undefined) return <main className="eval-page"><h1>Intent Lab</h1><p role="alert">{error}</p></main>
  if (snapshot === undefined) return <main className="eval-page"><h1>Intent Lab</h1><p>Loading Intent Lab…</p></main>

  return (
    <main className="eval-page" aria-labelledby="intent-lab-title">
      <div className="eval-eyebrow">Intent Evaluation · P1</div>
      <div className="eval-heading-row">
        <div>
          <h1 id="intent-lab-title">Intent Lab</h1>
          <p>Playground, batch evaluation, confusion matrix, failure drilldown, and baseline/candidate comparison.</p>
        </div>
        <a href="/industry/eval">Evaluation overview</a>
      </div>
      {error === null ? null : <p className="eval-error" role="alert">{error}</p>}

      <section className="eval-panel">
        <h2>Run configuration</h2>
        <div className="eval-form-row">
          <label>Dataset
            <select value={datasetId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setDatasetId(event.currentTarget.value)}>
              {snapshot.datasets.filter((dataset) => dataset.domain === 'INTENT').map((dataset) => (
                <option key={dataset.datasetId} value={dataset.datasetId}>{dataset.name} · {dataset.status}</option>
              ))}
            </select>
          </label>
          <label>Variant
            <select value={variantId} onChange={(event: ChangeEvent<HTMLSelectElement>) => setVariantId(event.currentTarget.value)}>
              {snapshot.variants.map((variant) => <option key={variant.variantId} value={variant.variantId}>{variant.label}</option>)}
            </select>
          </label>
          <button type="button" disabled={busy} onClick={() => void startRun()}>Run dataset</button>
          <button type="button" disabled={busy} onClick={() => void compareSeedRuns()}>Compare seeded runs</button>
        </div>
        <p className="eval-muted">Loaded {cases.length} cases. DRAFT datasets are visible for development but are not baseline-ready.</p>
      </section>

      <section className="eval-panel">
        <h2>Dataset cases</h2>
        <div className="eval-case-browser">
          <div className="eval-scroll">
            <table className="eval-table">
              <thead><tr><th>Case</th><th>Query</th><th>Expected</th><th>Difficulty</th><th>Reviewed</th></tr></thead>
              <tbody>
                {cases.map((testCase) => (
                  <tr key={testCase.caseId} data-selected={selectedCaseId === testCase.caseId}>
                    <td><button type="button" className="eval-link-button" onClick={() => setSelectedCaseId(testCase.caseId)}>{testCase.caseId}</button></td>
                    <td>{testCase.query}</td>
                    <td>{testCase.expected.primaryIntent}</td>
                    <td>{testCase.difficulty}</td>
                    <td>{testCase.reviewed ? 'Yes' : 'Draft'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedCase === null ? <p className="eval-muted">No case selected.</p> : (
            <aside className="eval-case-detail">
              <h3>{selectedCase.caseId}</h3>
              <p>{selectedCase.query}</p>
              <dl>
                <div><dt>Expected</dt><dd>{selectedCase.expected.primaryIntent}</dd></div>
                <div><dt>Label version</dt><dd>{selectedCase.labelVersion}</dd></div>
                <div><dt>Reviewed</dt><dd>{selectedCase.reviewed ? 'Yes' : 'No'}</dd></div>
                <div><dt>Critical</dt><dd>{selectedCase.critical ? 'Yes' : 'No'}</dd></div>
              </dl>
              <div className="eval-tags">{selectedCase.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              <p className="eval-muted">Label history entries: {selectedCase.labelHistory.length}</p>
            </aside>
          )}
        </div>
      </section>

      <section className="eval-panel">
        <h2>Intent Playground</h2>
        <form onSubmit={(event: FormEvent<HTMLFormElement>) => { void runPlayground(event) }}>
          <label>Query
            <textarea value={query} onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setQuery(event.currentTarget.value)} rows={3} />
          </label>
          <label>Previous resolved intent (optional)
            <select value={previousIntent} onChange={(event: ChangeEvent<HTMLSelectElement>) => setPreviousIntent(event.currentTarget.value)}>
              <option value="">None</option>
              {INTENT_NAMES.map((intent) => <option key={intent} value={intent}>{intent}</option>)}
            </select>
          </label>
          <button type="submit" disabled={busy || query.trim() === ''}>Evaluate query</button>
        </form>
        {playground === null ? null : (
          <>
            <PlaygroundResult result={playground} />
            <div className="eval-draft-save">
              <label>Expected intent for Draft case
                <select value={expectedIntent} onChange={(event: ChangeEvent<HTMLSelectElement>) => setExpectedIntent(event.currentTarget.value as IntentName | '')}>
                  <option value="">Choose explicitly…</option>
                  {INTENT_NAMES.map((intent) => <option key={intent} value={intent}>{intent}</option>)}
                </select>
              </label>
              <button type="button" disabled={busy || expectedIntent === ''} onClick={() => void saveAsDraftCase()}>Save as Draft Case</button>
              {savedDraftCaseId === null ? null : <span>Saved <code>{savedDraftCaseId}</code> · reviewed=false</span>}
            </div>
          </>
        )}
      </section>

      {activeRun?.metrics === undefined ? null : (
        <>
          <section className="eval-panel">
            <h2>Latest batch run</h2>
            <p><code>{activeRun.runId}</code> · {activeRun.variantId} · {activeRun.status}</p>
            <MetricTable metrics={activeRun.metrics} />
          </section>
          <section className="eval-panel">
            <h2>Confusion matrix</h2>
            <ConfusionMatrix matrix={activeRun.metrics.confusionMatrix} />
          </section>
          <section className="eval-panel">
            <h2>Failure Explorer</h2>
            <FailureList observations={observations} />
          </section>
        </>
      )}

      {comparison === null ? null : (
        <section className="eval-panel">
          <h2>Baseline vs Candidate</h2>
          <table className="eval-table">
            <thead><tr><th>Metric</th><th>Baseline</th><th>Candidate</th><th>Delta</th></tr></thead>
            <tbody>
              {comparison.metricDeltas.map((item) => (
                <tr key={item.metric}>
                  <td>{item.metric}</td>
                  <td>{formatPercent(item.baseline)}</td>
                  <td>{formatPercent(item.candidate)}</td>
                  <td>{formatSignedPercent(item.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Improved cases: {comparison.improvedCaseIds.length}; regressed cases: {comparison.regressedCaseIds.length}; unchanged: {comparison.unchangedCaseCount}.</p>
        </section>
      )}
    </main>
  )
}

export function PlaygroundResult({ result }: { result: IntentPlaygroundResult }) {
  return (
    <div className="eval-playground-result">
      <div><span>Primary intent</span><strong>{result.primaryIntent}</strong></div>
      <div><span>Confidence</span><strong>{formatPercent(result.confidence)}</strong></div>
      <div><span>Variant</span><strong>{result.variantId}</strong></div>
      <div><span>Project</span><strong>{result.semanticFrame.projectId ?? 'none'}</strong></div>
      <div className="eval-playground-result__wide"><span>Candidates</span><strong>{result.candidates.map((item) => `${item.intent} ${formatPercent(item.confidence)}`).join(' · ')}</strong></div>
      <div className="eval-playground-result__wide"><span>Trace</span><code>{result.traceId}</code></div>
    </div>
  )
}

const INTENT_NAMES = [
  'QUERY_BOQ',
  'QUERY_ENGINEERING_POSITION',
  'QUERY_QUANTITY',
  'RAG_QA',
  'MUTATION',
  'UNKNOWN',
] as const

function isIntentName(value: string): value is (typeof INTENT_NAMES)[number] {
  return (INTENT_NAMES as readonly string[]).includes(value)
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatSignedPercent(value: number): string {
  const percentage = value * 100
  return `${percentage >= 0 ? '+' : ''}${percentage.toFixed(1)} pp`
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
