import { describe, expect, it } from 'vitest'
import { createP7EvaluationApiClient } from '../src/api/p7-client'

function response(data: unknown, ok = true, status = 200): Response { return { ok, status, json: async () => data } as Response }

describe('P7EvaluationApiClient', () => {
  it('uses domain-scoped eval routes with same-origin credentials', async () => {
    const calls: Array<{ path: string; init?: RequestInit }> = []
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ path: String(input), init })
      return response({ apiVersion: 'eval-api-v1', data: [] })
    }) as typeof fetch
    const client = createP7EvaluationApiClient(fetcher)
    await client.listCases('NORMALIZATION')
    await client.listRuns('ENTITY')
    await client.listObservations('run a/b')
    await client.listFailures('run a/b')
    await client.listDrafts()
    expect(calls.map((item) => item.path)).toEqual([
      '/api/industry/v1/eval/p7/normalization/cases',
      '/api/industry/v1/eval/p7/entity/runs',
      '/api/industry/v1/eval/p7/runs/run%20a%2Fb/observations',
      '/api/industry/v1/eval/p7/runs/run%20a%2Fb/failures',
      '/api/industry/v1/eval/p7/drafts',
    ])
    expect(calls.every((item) => item.init?.credentials === 'same-origin')).toBe(true)
  })

  it('creates Trace Draft with traceId and targetDomain only', async () => {
    let body: unknown
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      body = JSON.parse(String(init?.body)) as unknown
      return response({ apiVersion: 'eval-api-v1', data: { draftId: 'draft-1', projectId: 'project-1', sourceTraceId: 'trace-1', sourceTraceName: 'query', targetDomain: 'TOOL', status: 'DRAFT', reviewed: false, query: 'query', createdAt: '2026-09-13T07:00:00.000Z' } })
    }) as typeof fetch
    const client = createP7EvaluationApiClient(fetcher)
    const draft = await client.createDraftFromTrace({ traceId: 'trace-1', targetDomain: 'TOOL' })
    expect(body).toEqual({ traceId: 'trace-1', targetDomain: 'TOOL' })
    expect(JSON.stringify(body)).not.toContain('projectId')
    expect(JSON.stringify(body)).not.toContain('tenantId')
    expect(JSON.stringify(body)).not.toContain('userId')
    expect(draft.status).toBe('DRAFT')
    expect(draft.reviewed).toBe(false)
  })
})
