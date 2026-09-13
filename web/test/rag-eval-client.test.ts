import { describe, expect, it } from 'vitest'
import { createEvaluationApiClient } from '../src/api/industry-client'

function response(data: unknown): Response { return { ok: true, status: 200, json: async () => data } as Response }

describe('RAG eval client', () => {
  it('uses dedicated RAG eval paths and does not submit project scope', async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = []
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(input), init })
      return response({ apiVersion: 'eval-api-v1', data: [] })
    }) as typeof fetch
    const client = createEvaluationApiClient(fetcher)
    await client.listRagEvalCases()
    await client.listRagEvalRuns()
    await client.startRagEvalRun({ datasetId: 'rag-safety-v1', variantId: 'rag-guarded-v1' })
    await client.getRagEvalRun('run a/b')
    await client.listRagEvalObservations('run a/b')
    await client.listRagEvalFailures('run a/b')
    expect(calls.map((call) => call.path)).toEqual([
      '/api/industry/v1/eval/rag/cases',
      '/api/industry/v1/eval/rag/runs',
      '/api/industry/v1/eval/rag/runs',
      '/api/industry/v1/eval/rag/runs/run%20a%2Fb',
      '/api/industry/v1/eval/rag/runs/run%20a%2Fb/observations',
      '/api/industry/v1/eval/rag/runs/run%20a%2Fb/failures',
    ])
    const start = calls[2]
    const body = JSON.parse(String(start?.init?.body)) as Record<string, unknown>
    expect(body).toEqual({ datasetId: 'rag-safety-v1', variantId: 'rag-guarded-v1' })
    expect(body).not.toHaveProperty('projectId')
    expect(body).not.toHaveProperty('userId')
  })
})
