import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { MockPrincipalProvider, type AuthPrincipal, type PrincipalProvider } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextService } from '../src/industry/context'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import '../src/industry/knowledge/mock-industry-agent-client-knowledge'
import { createIndustryRouter } from '../src/industry/router'
import { InMemoryRateLimiter } from '../src/security/rate-limit'

function principal(permissions: readonly string[], sessionId = 'session-hardening'): AuthPrincipal {
  return {
    subject: 'subject-hardening', userId: 'user-1', tenantId: 'tenant-1', companyIds: ['company-1'],
    roles: ['project-user'], permissions, sessionId,
  }
}

function buildRouter(principalProvider: PrincipalProvider, rateLimiter?: InMemoryRateLimiter) {
  const client = new MockIndustryAgentClient([
    { tenantId: 'tenant-1', projectId: 'project-1', companyId: 'company-1', name: 'Project One' },
  ])
  return createIndustryRouter({
    mode: 'control-plane',
    principalProvider,
    client,
    evaluationClient: new MockEvaluationClient(),
    contextService: new IndustryContextService(client),
    allowedOrigins: new Set(['http://127.0.0.1']),
    jsonBodyLimitBytes: 16_384,
    ...(rateLimiter === undefined ? {} : { rateLimiter }),
  })
}

function makeRouter(permissions: readonly string[], rateLimiter?: InMemoryRateLimiter) {
  return buildRouter(new MockPrincipalProvider(principal(permissions)), rateLimiter)
}

async function withServer(router: ReturnType<typeof createIndustryRouter>, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = http.createServer((request, response) => { void router(request, response).then((handled) => { if (!handled) { response.writeHead(404); response.end() } }) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.notEqual(address, null)
  try { await run(`http://127.0.0.1:${(address as { port: number }).port}`) }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
}

const jsonHeaders = () => ({ 'content-type': 'application/json', origin: 'http://127.0.0.1' })
async function selectProject(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/industry/v1/context/project`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ projectId: 'project-1' }) })
  assert.equal(response.status, 200)
}

test('control-plane rejects principal provider failures as authentication errors', async () => {
  const rejectingProvider: PrincipalProvider = { async getPrincipal() { throw new Error('no session') } }
  await withServer(buildRouter(rejectingProvider), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/industry/v1/context`)
    assert.equal(response.status, 401)
    const body = await response.json() as { error: { code: string; resolution?: { type: string } } }
    assert.equal(body.error.code, 'AUTHENTICATION_REQUIRED')
    assert.equal(body.error.resolution?.type, 'reauth')
  })
})

test('control-plane rejects cross-site state-changing browser requests', async () => {
  await withServer(makeRouter([]), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/industry/v1/context/project`, {
      method: 'POST',
      headers: { ...jsonHeaders(), 'sec-fetch-site': 'cross-site' },
      body: JSON.stringify({ projectId: 'project-1' }),
    })
    assert.equal(response.status, 403)
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, 'CSRF_CHECK_FAILED')
  })
})

test('control-plane applies bounded per-session request rate limits', async () => {
  const limiter = new InMemoryRateLimiter({ readLimit: 1, writeLimit: 10, windowMs: 60_000 })
  await withServer(makeRouter([], limiter), async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/industry/v1/context`)
    assert.equal(first.status, 200)
    const second = await fetch(`${baseUrl}/api/industry/v1/context`)
    assert.equal(second.status, 429)
    assert.equal(((await second.json()) as { error: { code: string } }).error.code, 'RATE_LIMITED')
  })
})

test('workspace requires explicit workspace/read capability in addition to project selection', async () => {
  await withServer(makeRouter([]), async (baseUrl) => {
    await selectProject(baseUrl)
    const denied = await fetch(`${baseUrl}/api/industry/v1/conversations`, { method: 'POST', headers: jsonHeaders(), body: '{}' })
    assert.equal(denied.status, 403)
    assert.equal(((await denied.json()) as { error: { code: string } }).error.code, 'WORKSPACE_ACCESS_DENIED')
  })
})

test('knowledge write permissions cannot blind-write without knowledge.read', async () => {
  await withServer(makeRouter(['knowledge.upload']), async (baseUrl) => {
    await selectProject(baseUrl)
    const response = await fetch(`${baseUrl}/api/industry/v1/knowledge/uploads`, {
      method: 'POST', headers: jsonHeaders(), body: JSON.stringify({
        fileName:'x.pdf',mimeType:'application/pdf',sizeBytes:100,industry:'ENGINEERING_CONSTRUCTION',companyId:'company-1',projectId:'project-1',department:'工程部',visibility:'PROJECT',aclUsers:[],aclRoles:[],securityTags:['GENERAL'],
      }),
    })
    assert.equal(response.status, 403)
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, 'KNOWLEDGE_ACCESS_DENIED')
  })
})

test('project selections expire when the configured session selection TTL elapses', async () => {
  const client = new MockIndustryAgentClient([{ tenantId:'tenant-1',projectId:'project-1',companyId:'company-1',name:'Project One' }])
  const service = new IndustryContextService(client, { selectionTtlMs: 0, maxSelections: 10 })
  const auth = principal([], 'session-expiring')
  await service.selectProject(auth, 'request-select', 'project-1')
  const resolved = await service.getContext(auth, 'request-read')
  assert.equal(resolved.trusted.projectId, null)
})
