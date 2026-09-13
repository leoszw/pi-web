import { describe, expect, it, vi } from 'vitest'
import { createP8ApiClient } from '../src/api/p8-client'

describe('P8 API client', () => {
  it('sends image metadata without trusted scope fields', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({ apiVersion: 'industry-api-v1', data: { analysisId: 'a1' } }), { status: 201, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
    const client = createP8ApiClient(fetcher)
    await client.createMultimodalAnalysis({ fileName: 'pier.jpg', mimeType: 'image/jpeg', sizeBytes: 1234 })
    const [path, init] = vi.mocked(fetcher).mock.calls[0]!
    expect(path).toBe('/api/industry/v1/multimodal/analyses')
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body).toEqual({ fileName: 'pier.jpg', mimeType: 'image/jpeg', sizeBytes: 1234 })
    expect(body).not.toHaveProperty('projectId')
    expect(body).not.toHaveProperty('tenantId')
    expect(body).not.toHaveProperty('userId')
  })

  it('keeps Agent Loop scope out of the start payload', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ apiVersion: 'industry-api-v1', data: { runId: 'loop-1' } }), { status: 201, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
    const client = createP8ApiClient(fetcher)
    await client.startAgentLoopRun({ goal: 'query current project', budget: { maxSteps: 8, maxTools: 4, maxTokens: 4000, maxCostUsd: 1, timeoutMs: 30000 }, scenario: 'SCOPE_INJECTION' })
    const [, init] = vi.mocked(fetcher).mock.calls[0]!
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body).not.toHaveProperty('projectId')
    expect(body).not.toHaveProperty('tenantId')
    expect(body).not.toHaveProperty('approvalToken')
    expect(body.scenario).toBe('SCOPE_INJECTION')
  })

  it('uses distinct P8 eval paths for multimodal and Agent Loop', async () => {
    const paths: string[] = []
    const fetcher = vi.fn(async (input: RequestInfo | URL) => { paths.push(String(input)); return new Response(JSON.stringify({ apiVersion: 'eval-api-v1', data: [] }), { status: 200, headers: { 'content-type': 'application/json' } }) }) as unknown as typeof fetch
    const client = createP8ApiClient(fetcher)
    await client.listEvalCases('MULTIMODAL')
    await client.listEvalCases('AGENT_LOOP')
    expect(paths).toEqual(['/api/industry/v1/eval/p8/multimodal/cases', '/api/industry/v1/eval/p8/agent-loop/cases'])
  })
})
