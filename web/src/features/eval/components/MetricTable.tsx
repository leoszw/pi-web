import type { IntentMetricsSummary } from '../../../../../shared/industry/eval/metrics'

export function MetricTable({ metrics }: { metrics: IntentMetricsSummary }) {
  const rows = [
    ['准确率', metrics.accuracy],
    ['宏平均 F1', metrics.macroF1],
    ['微平均 F1', metrics.microF1],
    ['Top-K 召回率', metrics.topKRecall],
    ['错误变更意图率', metrics.wrongMutationIntentRate],
    ['难例准确率', metrics.hardCaseAccuracy],
    ['上下文相关准确率', metrics.contextDependentAccuracy],
  ] as const

  return (
    <div className="eval-scroll">
      <table className="eval-table">
        <thead><tr><th>指标</th><th>值</th><th>样本数</th></tr></thead>
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

      <h3>按意图的精确率 / 召回率 / F1</h3>
      <table className="eval-table">
        <thead><tr><th>意图</th><th>精确率</th><th>召回率</th><th>F1</th><th>样本数</th></tr></thead>
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
