import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { RETRIEVAL_STAGE_ORDER } from '../../shared/industry/eval/retrieval'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextService } from '../src/industry/context'
import '../src/industry/eval/mock-evaluation-client-mutation'
import '../src/industry/eval/mock-evaluation-client-retrieval'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import { createIndustryRouter } from '../src/industry/router'
import '../src/industry/trace/mock-industry-agent-client-retrieval-debug'

function makeRouter(permissions: readonly string[]) {
  const principal: AuthPrincipal = {
    subject: 'subject-debug',
    userId: 'user-1',
    tenantId: 'tenant-1',
    companyIds: ['company-1'],
    roles: ['project-user'],
    permissions,
    sessionId: `debug-${permissions.join('-')}`,
  }
  const client = new MockIndustryAgentClient([
    { tenantId: 'tenant-1', projectId: 'project-1', companyId: 'company-1', name: 'Project One' },
    { tenantId: 'tenant-1', projectId: 'project-2', companyId: 'company-1', name: 'Project Two' },
  ])
  return createIndustryRouter({
    mode: 'control-plane',
    principalProvider: new MockPrincipalProvider(principal),
    client,
    evaluationClient: new MockEvaluationClient(),
    contextService: new IndustryContextService(client),
    allowedOrigins: new Set(['http://127.0.0.1']),
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

function headers() {
  return { 'content-type': 'application/json', origin: 'http://127.0.0.1' }
}

async function selectProject(baseUrl: string, projectId: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/industry/v1/context/project`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ projectId }),
  })
  assert.equal(response.status, 200)
}

test('retrieval debug requires trace.read.debug in addition to basic trace access', async () => {
  await withServer(makeRouter(['trace.read.basic']), async (baseUrl) => {
    await selectProject(baseUrl, 'project-1')
    const response = await fetch(`${baseUrl}/api/industry/v1/traces/trace-project-1-retrieval-001/retrieval-debug`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(response.status, 403)
    const body = await response.json() as { error: { code: string; message: string } }
    assert.equal(body.error.code, 'TRACE_ACCESS_DENIED')
    assert.match(body.error.message, /trace\.read\.debug/u)
  })
})

test('retrieval debug exposes the full deterministic stage chain within trusted project scope', async () => {
  await withServer(makeRouter(['trace.read.basic', 'trace.read.debug']), async (baseUrl) => {
    await selectProject(baseUrl, 'project-1')
    const response = await fetch(`${baseUrl}/api/industry/v1/traces/trace-project-1-retrieval-001/retrieval-debug`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(response.status, 200)
    const result = (await response.json() as {
      data: {
        source: string
        traceId: string
        queryContext: { projectId: string; chainageStart?: number; chainageEnd?: number; alignment?: string }
        stages: Array<{ stage: string; candidates: Array<{ projectId: string }> }>
        notes: string[]
      }
    }).data
    assert.equal(result.source, 'TRACE')
    assert.equal(result.traceId, 'trace-project-1-retrieval-001')
    assert.equal(result.queryContext.projectId, 'project-1')
    assert.equal(result.queryContext.chainageStart, 12300)
    assert.equal(result.queryContext.chainageEnd, 12800)
    assert.equal(result.queryContext.alignment, 'LEFT')
    assert.deepEqual(result.stages.map((stage) => stage.stage), [...RETRIEVAL_STAGE_ORDER])
    assert.ok(result.stages.every((stage) => stage.candidates.every((candidate) => candidate.projectId === 'project-1')))
    assert.ok(result.notes.some((note) => note.includes('not an evaluation run')))
  })
})

test('non-retrieval trace is rejected and another project trace remains hidden', async () => {
  await withServer(makeRouter(['trace.read.basic', 'trace.read.debug']), async (baseUrl) => {
    await selectProject(baseUrl, 'project-1')
    const unsupported = await fetch(`${baseUrl}/api/industry/v1/traces/trace-project-1-mutation-001/retrieval-debug`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(unsupported.status, 409)
    assert.equal((await unsupported.json() as { error: { code: string } }).error.code, 'TRACE_RETRIEVAL_DEBUG_UNAVAILABLE')

    await selectProject(baseUrl, 'project-2')
    const hidden = await fetch(`${baseUrl}/api/industry/v1/traces/trace-project-1-retrieval-001/retrieval-debug`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(hidden.status, 404)
    assert.equal((await hidden.json() as { error: { code: string } }).error.code, 'TRACE_NOT_FOUND')
  })
})
