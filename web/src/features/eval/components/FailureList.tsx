import { useMemo, useState, type ChangeEvent } from 'react'
import type { IntentEvalObservation } from '../../../../../shared/industry/eval/runs'
import type { IntentName } from '../../../../../shared/industry/eval/datasets'

const ALL = 'ALL' as const

export function FailureList({ observations }: { observations: readonly IntentEvalObservation[] }) {
  const [expected, setExpected] = useState<IntentName | typeof ALL>(ALL)
  const [actual, setActual] = useState<IntentName | typeof ALL>(ALL)
  const [tag, setTag] = useState('')

  const failures = useMemo(() => observations.filter((item) => {
    if (item.passed) return false
    if (expected !== ALL && item.expectedIntent !== expected) return false
    if (actual !== ALL && item.actualIntent !== actual) return false
    if (tag.trim() !== '' && !item.tags.includes(tag.trim())) return false
    return true
  }), [actual, expected, observations, tag])

  return (
    <div>
      <div className="eval-form-row">
        <label>期望
          <select value={expected} onChange={(event: ChangeEvent<HTMLSelectElement>) => setExpected(event.currentTarget.value as IntentName | typeof ALL)}>
            <option value={ALL}>全部</option>
            {INTENTS.map((intent) => <option key={intent} value={intent}>{intent}</option>)}
          </select>
        </label>
        <label>实际
          <select value={actual} onChange={(event: ChangeEvent<HTMLSelectElement>) => setActual(event.currentTarget.value as IntentName | typeof ALL)}>
            <option value={ALL}>全部</option>
            {INTENTS.map((intent) => <option key={intent} value={intent}>{intent}</option>)}
          </select>
        </label>
        <label>标签
          <input value={tag} onChange={(event: ChangeEvent<HTMLInputElement>) => setTag(event.currentTarget.value)} placeholder="上下文" />
        </label>
      </div>

      {failures.length === 0 ? <p className="eval-muted">当前筛选没有匹配的失败用例。</p> : (
        <div className="eval-scroll">
          <table className="eval-table">
            <thead><tr><th>用例</th><th>查询</th><th>期望</th><th>实际</th><th>置信度</th><th>标签</th><th>追踪</th></tr></thead>
            <tbody>
              {failures.map((failure) => (
                <tr key={failure.observationId}>
                  <td>{failure.caseId}</td>
                  <td>{failure.query}</td>
                  <td>{failure.expectedIntent}</td>
                  <td>{failure.actualIntent}</td>
                  <td>{(failure.confidence * 100).toFixed(1)}%</td>
                  <td>{failure.tags.join(', ')}</td>
                  <td><code>{failure.traceId}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const INTENTS: readonly IntentName[] = [
  'QUERY_BOQ',
  'QUERY_ENGINEERING_POSITION',
  'QUERY_QUANTITY',
  'RAG_QA',
  'MUTATION',
  'UNKNOWN',
]
