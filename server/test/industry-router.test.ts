import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextService } from '../src/industry/context'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import { createIndustryRouter } from '../src/industry/router'

const principal: AuthPrincipal = {
  subject: 'subject-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  companyIds: ['company-1'],
  roles: ['project-user'],
  permissions: ['industry.read'],
  sessionId: 'session-router',
}

function makeRouter(mode: 'local' | 'control-plane' = 'control-plane') {
  const client = new MockIndustryAgentClient([
    { tenantId: 'tenant-1', projectId: 'project-1', companyId: 'company-1', name: 'Project One' },
    { tenantId: 'tenant-1', projectId: 'project-2', companyId: 'company-2', name: 'Project Two' },
  ])
  return createIndustryRouter({
    mode,
    principalProvider: new MockPrincipalProvider(principal),
    client,
    evaluationClient: new MockEvaluationClient(),
    contextService: new IndustryContextService(client),
    allowedOrigins: new Set(['http://127.0.0.1']),
    jsonBodyLimitBytes: 1024,
  })
}

async function withServer(
  router: ReturnType<typeof createIndustryRouter>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
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
  assert.equal(typeof address, 'object')
  try {
    await run(`http://127.0.0.1:${(address as { port: number }).port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

test('health and context use server-derived principal scope', async () => {
  await withServer(makeRouter(), async (baseUrl) => {
    const health = await fetch(`${baseUrl}/api/industry/v1/health`)
    assert.equal(health.status, 200)
    const healthBody = await health.json() as { adapter: string; requestId: string }
    assert.equal(healthBody.adapter, 'mock')
    assert.notEqual(healthBody.requestId, '')

    const context = await fetch(`${baseUrl}/api/industry/v1/context`)
    assert.equal(context.status, 200)
    const body = await context.json() as {
      context: { tenantId: string; userId: string; projectId: string | null }
      authorizedProjects: Array<{ projectId: string }>
    }
    assert.equal(body.context.tenantId, 'tenant-1')
    assert.equal(body.context.userId, 'user-1')
    assert.equal(body.context.projectId, null)
    assert.deepEqual(body.authorizedProjects.map((item) => item.projectId), ['project-1'])
  })
})

test('project selection accepts only projectId and blocks scope injection', async () => {
  await withServer(makeRouter(), async (baseUrl) => {
    const selected = await fetch(`${baseUrl}/api/industry/v1/context/project`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://127.0.0.1',
      },
      body: JSON.stringify({ projectId: 'project-1' }),
    })
    assert.equal(selected.status, 200)
    const selectedBody = await selected.json() as { context: { projectId: string | null; companyId: string | null } }
    assert.equal(selectedBody.context.projectId, 'project-1')
    assert.equal(selectedBody.context.companyId, 'company-1')

    const injected = await fetch(`${baseUrl}/api/industry/v1/context/project`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://127.0.0.1',
      },
      body: JSON.stringify({
        projectId: 'project-1',
        tenantId: 'attacker-tenant',
        userId: 'attacker-user',
        roles: ['admin'],
      }),
    })
    assert.equal(injected.status, 400)
    const error = await injected.json() as { error: { code: string } }
    assert.equal(error.error.code, 'INVALID_JSON')
  })
})

test('unauthorized projects and origins are rejected', async () => {
  await withServer(makeRouter(), async (baseUrl) => {
    const project = await fetch(`${baseUrl}/api/industry/v1/context/project`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://127.0.0.1',
      },
      body: JSON.stringify({ projectId: 'project-2' }),
    })
    assert.equal(project.status, 403)

    const origin = await fetch(`${baseUrl}/api/industry/v1/context/project`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
      },
      body: JSON.stringify({ projectId: 'project-1' }),
    })
    assert.equal(origin.status, 403)
    const body = await origin.json() as { error: { code: string } }
    assert.equal(body.error.code, 'ORIGIN_NOT_ALLOWED')
  })
})

test('local mode keeps the industry control plane disabled', async () => {
  await withServer(makeRouter('local'), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/industry/v1/health`)
    assert.equal(response.status, 404)
    const body = await response.json() as { error: { code: string } }
    assert.equal(body.error.code, 'INDUSTRY_CONTROL_PLANE_DISABLED')
  })
})
