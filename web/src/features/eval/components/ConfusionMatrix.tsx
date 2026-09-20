import type { ConfusionMatrix as ConfusionMatrixData } from '../../../../../shared/industry/eval/metrics'

export function ConfusionMatrix({ matrix }: { matrix: ConfusionMatrixData }) {
  return (
    <div className="eval-scroll" aria-label="意图混淆矩阵">
      <table className="eval-table eval-confusion-matrix">
        <thead>
          <tr>
            <th>期望 \\ 实际</th>
            {matrix.labels.map((label) => <th key={label}>{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.labels.map((label, rowIndex) => (
            <tr key={label}>
              <th>{label}</th>
              {matrix.rows[rowIndex]?.map((count, columnIndex) => (
                <td key={`${label}:${matrix.labels[columnIndex] ?? columnIndex}`}>{count}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
