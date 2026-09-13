import { describe, expect, it } from 'vitest'
import type { MutationOperation } from '../../shared/industry/mutation'
import { createIndustryMutationApiClient, IndustryMutationApiError } from '../src/api/mutation-client'

const operation: MutationOperation = {
  operationId: 'mutation-project-1-safe-001',
  projectId: 'project-1',
  operationType: 'UPDATE',
  title: '更新工程负责人',
  summary: '将负责人更新为张三。',
  digest: `sha256:${'a'.repeat(64)}`,
  status: 'PENDING_CONFIRMATION',
  targetVersion: 'entity-v17',
  preview: { entityId: '123456789012345678', field: 'owner', before: '李四', after: '张三' },
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:00.000Z',
  safeToRetryCommit: false,
}

describe('IndustryMutationApiClient', () => {
  it('sends only digest/explicitConfirmation in the body and Idempotency-Key in the header', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    const client = createIndustryMutationApiClient(async (input, init) => {
      capturedUrl = String(input)
      capturedInit = init
      return new Response(JSON.stringify({ apiVersion: 'industry-api-v1', data: { ...operation, status: 'COMMITTED' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    await client.confirmMutation(operation.operationId, { digest: operation.digest, explicitConfirmation: true }, 'idem-attempt-1')

    expect(capturedUrl).toBe(`/api/industry/v1/mutations/${operation.operationId}/confirm`)
    const headers = new Headers(capturedInit?.headers)
    expect(headers.get('Idempotency-Key')).toBe('idem-attempt-1')
    const body = JSON.parse(String(capturedInit?.body)) as Record<string, unknown>
    expect(body).toEqual({ digest: operation.digest, explicitConfirmation: true })
    expect('projectId' in body).toBe(false)
    expect('approvalToken' in body).toBe(false)
  })

  it('preserves non-retryable reconciliation resolution from finalization failures', async () => {
    const client = createIndustryMutationApiClient(async () => new Response(JSON.stringify({
      error: {
        requestId: 'request-finalization',
        code: 'MUTATION_COMMIT_FINALIZATION_FAILED',
        message: 'business write may have succeeded',
        retryable: false,
        resolution: { type: 'open_reconciliation' },
      },
    }), { status: 500, headers: { 'content-type': 'application/json' } }))

    await expect(client.confirmMutation(operation.operationId, { digest: operation.digest, explicitConfirmation: true }, 'idem-finalization'))
      .rejects.toMatchObject({
        name: 'IndustryMutationApiError',
        code: 'MUTATION_COMMIT_FINALIZATION_FAILED',
        retryable: false,
        resolution: { type: 'open_reconciliation' },
      } satisfies Partial<IndustryMutationApiError>)
  })
})
