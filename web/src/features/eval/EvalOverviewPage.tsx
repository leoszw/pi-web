import { useEffect, useMemo, useState } from 'react'
import type { EvalVariantSummary } from '../../../../shared/industry/eval/common'
import type { EvalDatasetSummary } from '../../../../shared/industry/eval/datasets'
import type { EvalRunSummary } from '../../../../shared/industry/eval/runs'
import { createEvaluationApiClient, type EvaluationApiClient } from '../../api/industry-client'
import './eval.css'

const defaultEvaluationClient = createEvaluationApiClient()

export interface EvalOverviewSnapshot {
  datasets: readonly EvalDatasetSummary[]
  runs: readonly EvalRunSummary[]
  variants: readonly EvalVariantSummary[]
}

export function EvalOverviewPage({
  client = defaultEvaluationClient,
  initialSnapshot,
}: {
  client?: EvaluationApiClient
  initialSnapshot?: EvalOverviewSnapshot
}) {
  const [snapshot, setSnapshot] = useState<EvalOverviewSnapshot | undefined>(initialSnapshot)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void Promise.all([client.listDatasets(), client.listRuns(), client.listVariants()])
      .then(([datasets, runs, variants]) => {
        if (!cancelled) setSnapshot({ datasets, runs, variants })
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      cancelled = true
    }
  }, [client, initialSnapshot])

  if (error !== null) return <main className="eval-page"><h1>Evaluation</h1><p role="alert">{error}</p></main>
  if (snapshot === undefined) return <main className="eval-page"><h1>Evaluation</h1><p>Loading evaluation workspace…</p></main>
  return <EvalOverviewView snapshot={snapshot} />
}

export function EvalOverviewView({ snapshot }: { snapshot: EvalOverviewSnapshot }) {
  const completedRuns = useMemo(() => snapshot.runs.filter((run) => run.status === 'COMPLETED'), [snapshot.runs])
  return (
    <main className="eval-page" aria-labelledby="eval-overview-title">
      <div className="eval-eyebrow">Evaluation Workbench · P2</div>
      <div className="eval-heading-row">
        <div>
          <h1 id="eval-overview-title">Evaluation</h1>
          <p>Intent evaluation and deterministic Engineering / BOQ retrieval inspection are available. Production metrics remain owned by pi.</p>
        </div>
        <div className="eval-heading-actions">
          <a className="eval-primary-link" href="/industry/eval/intent">Open Intent Lab</a>
          <a className="eval-primary-link" href="/industry/eval/playground/retrieval">Open Retrieval Lab</a>
        </div>
      </div>

      <section className="eval-summary-grid" aria-label="Evaluation summary">
        <article><strong>{snapshot.datasets.length}</strong><span>Intent datasets</span></article>
        <article><strong>{completedRuns.length}</strong><span>Completed intent runs</span></article>
        <article><strong>{snapshot.variants.length}</strong><span>Intent variants</span></article>
        <article><strong>10</strong><span>Retrieval stages</span></article>
      </section>

      <section className="eval-panel">
        <h2>Datasets</h2>
        <table className="eval-table">
          <thead><tr><th>Name</th><th>Status</th><th>Cases</th><th>Version</th><th>Fingerprint</th></tr></thead>
          <tbody>
            {snapshot.datasets.map((dataset) => (
              <tr key={dataset.datasetId}>
                <td>{dataset.name}</td>
                <td>{dataset.status}</td>
                <td>{dataset.caseCount}</td>
                <td>{dataset.version}</td>
                <td><code>{dataset.fingerprint.slice(0, 12)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="eval-panel">
        <h2>Recent runs</h2>
        <table className="eval-table">
          <thead><tr><th>Run</th><th>Dataset</th><th>Variant</th><th>Status</th><th>Accuracy</th></tr></thead>
          <tbody>
            {snapshot.runs.map((run) => (
              <tr key={run.runId}>
                <td><code>{run.runId}</code></td>
                <td>{run.datasetId}</td>
                <td>{run.variantId}</td>
                <td>{run.status}</td>
                <td>{run.metrics === undefined ? '—' : `${(run.metrics.accuracy.value * 100).toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  )
}
