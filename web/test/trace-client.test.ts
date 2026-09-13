import { describe, expect, it } from 'vitest'
import { createIndustryTraceApiClient } from '../src/api/trace-client'

function response(data: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => data,
  } as Response
}

describe('IndustryTraceApiClient', () => {
  it('uses encoded trace paths and same-origin credentials', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init })
      const path = String(input)
      if (path === '/api/industry/v1/traces') return response({ apiVersion: 'industry-api-v1', data: { traces: [] } })
      if (path.endsWith('/retrieval-debug')) return response({ apiVersion: 'industry-api-v1', data: { traceId: 'trace a/b', source: 'TRACE', queryContext: {}, stages: [], notes: [] } })
      if (path.endsWith('/timeline')) return response({ apiVersion: 'industry-api-v1', data: { traceId: 'trace a/b', events: [] } })
      if (path.endsWith('/tree')) return response({ apiVersion: 'industry-api-v1', data: { traceId: 'trace a/b', roots: [] } })
      if (path.endsWith('/stats')) return response({ apiVersion: 'industry-api-v1', data: { traceId: 'trace a/b', durationMs: 0, queryLatencyMs: 0, llmCallCount: 0, toolCallCount: 0, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, spanCount: 0, errorCount: 0 } })
      return response({ apiVersion: 'industry-api-v1', data: { summary: {}, spans: [] } })
    }) as typeof fetch
    const client = createIndustryTraceApiClient(fetcher)

    await client.listTraces()
    await client.getTrace('trace a/b')
    await client.getTimeline('trace a/b')
    await client.getTree('trace a/b')
    await client.getStats('trace a/b')
    await client.getRetrievalDebug('trace a/b')

    expect(calls.map((call) => String(call.input))).toEqual([
      '/api/industry/v1/traces',
      '/api/industry/v1/traces/trace%20a%2Fb',
      '/api/industry/v1/traces/trace%20a%2Fb/timeline',
      '/api/industry/v1/traces/trace%20a%2Fb/tree',
      '/api/industry/v1/traces/trace%20a%2Fb/stats',
      '/api/industry/v1/traces/trace%20a%2Fb/retrieval-debug',
    ])
    expect(calls.every((call) => call.init?.credentials === 'same-origin')).toBe(true)
  })

  it('preserves structured API errors', async () => {
    const fetcher = (async () => response({ error: { requestId: 'request-1', code: 'TRACE_ACCESS_DENIED', message: 'denied', retryable: false } }, false, 403)) as typeof fetch
    const client = createIndustryTraceApiClient(fetcher)
    await expect(client.listTraces()).rejects.toMatchObject({ code: 'TRACE_ACCESS_DENIED', requestId: 'request-1', retryable: false })
  })
})
