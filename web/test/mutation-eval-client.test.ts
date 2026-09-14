import { describe, expect, it } from 'vitest'
import { createEvaluationApiClient } from '../src/api/industry-client'

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ apiVersion: 'eval-api-v1', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

describe('mutation evaluation API client', () => {
  it('starts guarded runs without browser-provided trusted scope fields', async () => {
    let capturedPath = ''
    let capturedInit: RequestInit | undefined
    const client = createEvaluationApiClient(async (input, init) => {
      capturedPath = String(input)
      capturedInit = init
      return ok({
        runId: 'run-1', runType: 'MUTATION', datasetId: 'mutation-safety-v1', datasetVersion: '1.0.0',
        status: 'COMPLETED', environment: 'LOCAL', variantId: 'mutation-guarded-v1', projectId: 'project-1',
        startedAt: '2026-09-13T00:00:00.000Z',
      })
    })

    await client.startMutationEvalRun({ datasetId: 'mutation-safety-v1', variantId: 'mutation-guarded-v1' })
    expect(capturedPath).toBe('/api/industry/v1/eval/mutation/runs')
    expect(capturedInit?.method).toBe('POST')
    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>
    expect(body).toEqual({ datasetId: 'mutation-safety-v1', variantId: 'mutation-guarded-v1' })
    expect(body).not.toHaveProperty('projectId')
    expect(body).not.toHaveProperty('tenantId')
    expect(body).not.toHaveProperty('userId')
  })

  it('uses encoded run ids for observations and failure drilldown', async () => {
    const paths: string[] = []
    const client = createEvaluationApiClient(async (input) => {
      paths.push(String(input))
      return ok([])
    })
    await client.listMutationEvalObservations('run mutation/1')
    await client.listMutationEvalFailures('run mutation/1')
    expect(paths).toEqual([
      '/api/industry/v1/eval/mutation/runs/run%20mutation%2F1/observations',
      '/api/industry/v1/eval/mutation/runs/run%20mutation%2F1/failures',
    ])
  })
})
