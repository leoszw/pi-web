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
        <label>Expected
          <select value={expected} onChange={(event: ChangeEvent<HTMLSelectElement>) => setExpected(event.currentTarget.value as IntentName | typeof ALL)}>
            <option value={ALL}>All</option>
            {INTENTS.map((intent) => <option key={intent} value={intent}>{intent}</option>)}
          </select>
        </label>
        <label>Actual
          <select value={actual} onChange={(event: ChangeEvent<HTMLSelectElement>) => setActual(event.currentTarget.value as IntentName | typeof ALL)}>
            <option value={ALL}>All</option>
            {INTENTS.map((intent) => <option key={intent} value={intent}>{intent}</option>)}
          </select>
        </label>
        <label>Tag
          <input value={tag} onChange={(event: ChangeEvent<HTMLInputElement>) => setTag(event.currentTarget.value)} placeholder="context" />
        </label>
      </div>

      {failures.length === 0 ? <p className="eval-muted">No failed cases match the current filters.</p> : (
        <div className="eval-scroll">
          <table className="eval-table">
            <thead><tr><th>Case</th><th>Query</th><th>Expected</th><th>Actual</th><th>Confidence</th><th>Tags</th><th>Trace</th></tr></thead>
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
