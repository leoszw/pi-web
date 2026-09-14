import { describe, expect, it } from 'vitest'
import { createKnowledgeApiClient } from '../src/api/knowledge-client'

function response(data: unknown): Response { return { ok: true, status: 200, json: async () => data } as Response }

describe('KnowledgeApiClient', () => {
  it('uses same-origin routes and does not add trusted scope fields', async () => {
    const calls: Array<{ input: string; init?: RequestInit }> = []
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init })
      const path = String(input)
      if (path.endsWith('/options')) return response({ apiVersion: 'knowledge-api-v1', data: { industries: [], companies: [], projects: [], departments: [], visibilities: [], users: [], roles: [], securityTags: [] } })
      if (path.endsWith('/uploads')) return response({ apiVersion: 'knowledge-api-v1', data: { documentId: 'doc-1' } })
      if (path.endsWith('/chunks')) return response({ apiVersion: 'knowledge-api-v1', data: [] })
      if (path.includes('/ingestions/')) return response({ apiVersion: 'knowledge-api-v1', data: { ingestionId: 'ing-1' } })
      return response({ apiVersion: 'knowledge-api-v1', data: [] })
    }) as typeof fetch
    const client = createKnowledgeApiClient(fetcher)
    await client.getUploadOptions()
    await client.uploadDocument({
      fileName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 10, industry: 'ENGINEERING_CONSTRUCTION',
      companyId: 'company-1', projectId: 'project-1', department: '工程部', visibility: 'PROJECT',
      aclUsers: [], aclRoles: [], securityTags: ['GENERAL'],
    })
    const upload = calls.find((call) => call.input.endsWith('/uploads'))
    expect(upload?.init?.credentials).toBe('same-origin')
    const body = JSON.parse(String(upload?.init?.body)) as Record<string, unknown>
    expect(body).not.toHaveProperty('tenantId')
    expect(body).not.toHaveProperty('userId')
    expect(body).not.toHaveProperty('approvalToken')
    expect(body.projectId).toBe('project-1')
  })

  it('encodes document and ingestion ids', async () => {
    const paths: string[] = []
    const fetcher = (async (input: RequestInfo | URL) => { paths.push(String(input)); return response({ apiVersion: 'knowledge-api-v1', data: [] }) }) as typeof fetch
    const client = createKnowledgeApiClient(fetcher)
    await client.listChunks('doc a/b')
    await client.reingestDocument('doc a/b')
    await client.getIngestion('ing a/b')
    expect(paths).toEqual([
      '/api/industry/v1/knowledge/documents/doc%20a%2Fb/chunks',
      '/api/industry/v1/knowledge/documents/doc%20a%2Fb/reingest',
      '/api/industry/v1/knowledge/ingestions/ing%20a%2Fb',
    ])
  })
})
