import { describe, expect, it } from 'vitest'
import { createEvaluationApiClient } from '../src/api/industry-client'

function response(data: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => data } as Response
}

describe('Trace Eval API client', () => {
  it('uses isolated trace-eval endpoints with encoded run ids', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init })
      const path = String(input)
      if (path.endsWith('/cases')) return response({ apiVersion: 'eval-api-v1', data: [] })
      if (path === '/api/industry/v1/eval/trace/runs' && init?.method === 'GET') return response({ apiVersion: 'eval-api-v1', data: [] })
      if (path === '/api/industry/v1/eval/trace/runs' && init?.method === 'POST') return response({ apiVersion: 'eval-api-v1', data: { runId: 'run trace/1' } })
      if (path.endsWith('/observations') || path.endsWith('/failures')) return response({ apiVersion: 'eval-api-v1', data: [] })
      return response({ apiVersion: 'eval-api-v1', data: { runId: 'run trace/1' } })
    }) as typeof fetch
    const client = createEvaluationApiClient(fetcher)

    await client.listTraceEvalCases()
    await client.listTraceEvalRuns()
    await client.startTraceEvalRun({ datasetId: 'trace-safety-v1', variantId: 'trace-guarded-v1' })
    await client.getTraceEvalRun('run trace/1')
    await client.listTraceEvalObservations('run trace/1')
    await client.listTraceEvalFailures('run trace/1')

    expect(calls.map((call) => String(call.input))).toEqual([
      '/api/industry/v1/eval/trace/cases',
      '/api/industry/v1/eval/trace/runs',
      '/api/industry/v1/eval/trace/runs',
      '/api/industry/v1/eval/trace/runs/run%20trace%2F1',
      '/api/industry/v1/eval/trace/runs/run%20trace%2F1/observations',
      '/api/industry/v1/eval/trace/runs/run%20trace%2F1/failures',
    ])
    expect(calls.every((call) => call.init?.credentials === 'same-origin')).toBe(true)
    const startCall = calls[2]
    expect(startCall?.init?.method).toBe('POST')
    expect(JSON.parse(String(startCall?.init?.body))).toEqual({ datasetId: 'trace-safety-v1', variantId: 'trace-guarded-v1' })
  })
})
