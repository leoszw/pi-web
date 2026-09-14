import type { IntentMetricsSummary } from '../../../../../shared/industry/eval/metrics'

export function MetricTable({ metrics }: { metrics: IntentMetricsSummary }) {
  const rows = [
    ['Accuracy', metrics.accuracy],
    ['Macro F1', metrics.macroF1],
    ['Micro F1', metrics.microF1],
    ['Top-K Recall', metrics.topKRecall],
    ['Wrong Mutation Intent Rate', metrics.wrongMutationIntentRate],
    ['Hard-case Accuracy', metrics.hardCaseAccuracy],
    ['Context-dependent Accuracy', metrics.contextDependentAccuracy],
  ] as const

  return (
    <div className="eval-scroll">
      <table className="eval-table">
        <thead><tr><th>Metric</th><th>Value</th><th>Samples</th></tr></thead>
        <tbody>
          {rows.map(([label, metric]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>{formatPercent(metric.value)}</td>
              <td>{metric.sampleCount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Per-intent precision / recall / F1</h3>
      <table className="eval-table">
        <thead><tr><th>Intent</th><th>Precision</th><th>Recall</th><th>F1</th><th>Samples</th></tr></thead>
        <tbody>
          {metrics.perIntent.map((metric) => (
            <tr key={metric.intent}>
              <td>{metric.intent}</td>
              <td>{formatPercent(metric.precision)}</td>
              <td>{formatPercent(metric.recall)}</td>
              <td>{formatPercent(metric.f1)}</td>
              <td>{metric.sampleCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}
