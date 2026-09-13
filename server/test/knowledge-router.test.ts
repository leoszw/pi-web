import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextService } from '../src/industry/context'
import '../src/industry/eval/mock-evaluation-client-mutation'
import '../src/industry/eval/mock-evaluation-client-retrieval'
import '../src/industry/eval/mock-evaluation-client-trace'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import '../src/industry/knowledge/mock-industry-agent-client-knowledge'
import { createIndustryRouter } from '../src/industry/router'
import '../src/industry/trace/mock-industry-agent-client-retrieval-debug'

function principal(permissions: readonly string[], roles: readonly string[] = ['project-user']): AuthPrincipal {
  return {
    subject: 'subject-knowledge',
    userId: 'user-1',
    tenantId: 'tenant-1',
    companyIds: ['company-1'],
    roles,
    permissions,
    sessionId: `session-knowledge-${roles.join('-') || 'none'}-${permissions.join('-') || 'none'}`,
  }
}

function makeRouter(permissions: readonly string[], roles: readonly string[] = ['project-user']) {
  const client = new MockIndustryAgentClient([
    { tenantId: 'tenant-1', projectId: 'project-1', companyId: 'company-1', name: 'Project One' },
    { tenantId: 'tenant-1', projectId: 'project-2', companyId: 'company-1', name: 'Project Two' },
  ])
  return createIndustryRouter({
    mode: 'control-plane',
    principalProvider: new MockPrincipalProvider(principal(permissions, roles)),
    client,
    evaluationClient: new MockEvaluationClient(),
    contextService: new IndustryContextService(client),
    allowedOrigins: new Set(['http://127.0.0.1']),
    jsonBodyLimitBytes: 32 * 1024,
  })
}

async function withServer(router: ReturnType<typeof createIndustryRouter>, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = http.createServer((request, response) => {
    void router(request, response).then((handled) => {
      if (!handled) {
        response.writeHead(404)
        response.end()
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.notEqual(address, null)
  try {
    await run(`http://127.0.0.1:${(address as { port: number }).port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

function jsonHeaders() {
  return { 'content-type': 'application/json', origin: 'http://127.0.0.1' }
}

async function selectProject(baseUrl: string, projectId = 'project-1'): Promise<void> {
  const response = await fetch(`${baseUrl}/api/industry/v1/context/project`, {
    method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ projectId }),
  })
  assert.equal(response.status, 200)
}

test('knowledge read requires permission and active project', async () => {
  await withServer(makeRouter([]), async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/industry/v1/knowledge/documents`)
    assert.equal(denied.status, 403)
  })
  await withServer(makeRouter(['knowledge.read']), async (baseUrl) => {
    const missingProject = await fetch(`${baseUrl}/api/industry/v1/knowledge/documents`)
    assert.equal(missingProject.status, 409)
    await selectProject(baseUrl)
    const response = await fetch(`${baseUrl}/api/industry/v1/knowledge/documents`)
    assert.equal(response.status, 200)
  })
})

test('upload options are issued from trusted project company user and roles', async () => {
  await withServer(makeRouter(['knowledge.read'], ['project-user', 'quality-reviewer']), async (baseUrl) => {
    await selectProject(baseUrl)
    const response = await fetch(`${baseUrl}/api/industry/v1/knowledge/options`)
    assert.equal(response.status, 200)
    const body = await response.json() as { data: { companies: Array<{ companyId: string }>; projects: Array<{ projectId: string }>; users: Array<{ userId: string }>; roles: string[] } }
    assert.deepEqual(body.data.companies.map((item) => item.companyId), ['company-1'])
    assert.deepEqual(body.data.projects.map((item) => item.projectId), ['project-1'])
    assert.deepEqual(body.data.users.map((item) => item.userId), ['user-1'])
    assert.deepEqual(body.data.roles.sort(), ['project-user', 'quality-reviewer'])
  })
})

test('upload rejects browser scope injection and unauthorized ACL values', async () => {
  await withServer(makeRouter(['knowledge.read', 'knowledge.upload']), async (baseUrl) => {
    await selectProject(baseUrl)
    const base = {
      fileName: '质量管理办法.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      industry: 'ENGINEERING_CONSTRUCTION',
      companyId: 'company-1',
      projectId: 'project-1',
      department: '质量部',
      visibility: 'RESTRICTED',
      aclUsers: ['user-1'],
      aclRoles: ['project-user'],
      securityTags: ['QUALITY'],
    }
    const injected = await fetch(`${baseUrl}/api/industry/v1/knowledge/uploads`, {
      method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ ...base, tenantId: 'attacker-tenant' }),
    })
    assert.equal(injected.status, 400)

    const wrongProject = await fetch(`${baseUrl}/api/industry/v1/knowledge/uploads`, {
      method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ ...base, projectId: 'project-2' }),
    })
    assert.equal(wrongProject.status, 403)
    const wrongProjectBody = await wrongProject.json() as { error: { code: string } }
    assert.equal(wrongProjectBody.error.code, 'KNOWLEDGE_SCOPE_NOT_ALLOWED')

    const wrongRole = await fetch(`${baseUrl}/api/industry/v1/knowledge/uploads`, {
      method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ ...base, aclRoles: ['admin'] }),
    })
    assert.equal(wrongRole.status, 403)
  })
})

test('mock upload exposes ready document chunks full ingestion pipeline and reingest version', async () => {
  await withServer(makeRouter(['knowledge.read', 'knowledge.upload', 'knowledge.reingest']), async (baseUrl) => {
    await selectProject(baseUrl)
    const created = await fetch(`${baseUrl}/api/industry/v1/knowledge/uploads`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        fileName: '安全专项方案.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4096,
        industry: 'ENGINEERING_CONSTRUCTION',
        companyId: 'company-1',
        projectId: 'project-1',
        department: '安全部',
        visibility: 'PROJECT',
        aclUsers: [],
        aclRoles: [],
        securityTags: ['SAFETY'],
      }),
    })
    assert.equal(created.status, 201)
    const createdBody = await created.json() as { data: { documentId: string; ingestionId: string; sourceVersion: string; ingestionStatus: string; chunkCount: number } }
    assert.equal(createdBody.data.sourceVersion, 'source-v1')
    assert.equal(createdBody.data.ingestionStatus, 'READY')
    assert.equal(createdBody.data.chunkCount, 2)

    const chunks = await fetch(`${baseUrl}/api/industry/v1/knowledge/documents/${encodeURIComponent(createdBody.data.documentId)}/chunks`)
    assert.equal(chunks.status, 200)
    const chunksBody = await chunks.json() as { data: Array<{ projectId: string; sourceVersion: string; page: number; section: string }> }
    assert.equal(chunksBody.data.length, 2)
    assert.ok(chunksBody.data.every((item) => item.projectId === 'project-1' && item.sourceVersion === 'source-v1'))

    const ingestion = await fetch(`${baseUrl}/api/industry/v1/knowledge/ingestions/${encodeURIComponent(createdBody.data.ingestionId)}`)
    assert.equal(ingestion.status, 200)
    const ingestionBody = await ingestion.json() as { data: { status: string; steps: Array<{ status: string }> } }
    assert.equal(ingestionBody.data.status, 'READY')
    assert.deepEqual(ingestionBody.data.steps.map((item) => item.status), [
      'RECEIVED', 'VALIDATING', 'STORED', 'PARSING', 'EXTRACTING', 'CHUNKING', 'ENRICHING', 'EMBEDDING', 'INDEXING', 'QUALITY_VALIDATING', 'READY',
    ])

    const injectedReingest = await fetch(`${baseUrl}/api/industry/v1/knowledge/documents/${encodeURIComponent(createdBody.data.documentId)}/reingest`, {
      method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ projectId: 'project-2' }),
    })
    assert.equal(injectedReingest.status, 400)

    const reingest = await fetch(`${baseUrl}/api/industry/v1/knowledge/documents/${encodeURIComponent(createdBody.data.documentId)}/reingest`, {
      method: 'POST', headers: jsonHeaders(), body: '{}',
    })
    assert.equal(reingest.status, 200)
    const reingestBody = await reingest.json() as { data: { sourceVersion: string; ingestionId: string } }
    assert.equal(reingestBody.data.sourceVersion, 'source-v2')
    assert.notEqual(reingestBody.data.ingestionId, createdBody.data.ingestionId)
  })
})

test('restricted seed is hidden without matching role and cross-project ids are not enumerable', async () => {
  await withServer(makeRouter(['knowledge.read'], []), async (baseUrl) => {
    await selectProject(baseUrl)
    const list = await fetch(`${baseUrl}/api/industry/v1/knowledge/documents`)
    const body = await list.json() as { data: Array<{ documentId: string; fileName: string }> }
    assert.equal(body.data.some((item) => item.fileName.includes('合同')), false)

    const crossProject = await fetch(`${baseUrl}/api/industry/v1/knowledge/documents/knowledge-project-2-spec-001`)
    assert.equal(crossProject.status, 404)
    const crossBody = await crossProject.json() as { error: { code: string } }
    assert.equal(crossBody.error.code, 'KNOWLEDGE_DOCUMENT_NOT_FOUND')
  })
})
