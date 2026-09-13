import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TraceDetail, TraceSummary } from '../../shared/industry/trace'
import { TracePageView } from '../src/features/trace/TracePage'

const summary: TraceSummary = {
  traceId: 'trace-project-1-retrieval-001', requestId: 'request-1', projectId: 'project-1', kind: 'RETRIEVAL', name: 'Retrieval trace', status: 'OK', startedAt: '2026-09-13T00:00:00.000Z', completedAt: '2026-09-13T00:00:00.100Z', durationMs: 100, spanCount: 1,
}
const spans: TraceDetail['spans'] = [{ spanId: 'span-1', name: 'request', kind: 'AGENT', status: 'OK', startedAt: summary.startedAt, completedAt: summary.completedAt, durationMs: 100 }]

describe('Retrieval Debug capability link', () => {
  it('is hidden for basic trace access and shown only when debug data is granted', () => {
    const basic = renderToStaticMarkup(<TracePageView snapshot={{ traces: [summary], detail: { summary, spans } }} traceId={summary.traceId} tab="overview" />)
    expect(basic).not.toContain('Open Retrieval Debug')
    const debug = renderToStaticMarkup(<TracePageView snapshot={{ traces: [summary], detail: { summary, spans, debug: { request: {}, response: {}, toolCalls: [] } } }} traceId={summary.traceId} tab="overview" />)
    expect(debug).toContain('Open Retrieval Debug')
    expect(debug).toContain('/industry/debug/retrieval/trace-project-1-retrieval-001')
  })
})
