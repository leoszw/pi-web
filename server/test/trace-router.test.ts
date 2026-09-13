import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextService } from '../src/industry/context'
import '../src/industry/eval/mock-evaluation-client-retrieval'
import '../src/industry/eval/mock-evaluation-client-mutation'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import { createIndustryRouter } from '../src/industry/router'
import { redactText, redactTraceValue } from '../src/industry/trace/mock-trace-store'

function principal(permissions: readonly string[]): AuthPrincipal {
  return {
    subject: 'subject-trace',
    userId: 'user-1',
    tenantId: 'tenant-1',
    companyIds: ['company-1'],
    roles: ['project-user'],
    permissions,
    sessionId: `session-${permissions.join('-') || 'none'}`,
  }
}

function makeRouter(permissions: readonly string[]) {
  const client = new MockIndustryAgentClient([
    { tenantId: 'tenant-1', projectId: 'project-1', companyId: 'company-1', name: 'Project One' },
    { tenantId: 'tenant-1', projectId: 'project-2', companyId: 'company-1', name: 'Project Two' },
  ])
  return createIndustryRouter({
    mode: 'control-plane',
    principalProvider: new MockPrincipalProvider(principal(permissions)),
    client,
    evaluationClient: new MockEvaluationClient(),
    contextService: new IndustryContextService(client),
    allowedOrigins: new Set(['http://127.0.0.1']),
    jsonBodyLimitBytes: 4096,
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
  try {
    await run(`http://127.0.0.1:${(address as { port: number }).port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

function headers() {
  return { 'content-type': 'application/json', origin: 'http://127.0.0.1' }
}

async function selectProject(baseUrl: string, projectId = 'project-1'): Promise<void> {
  const response = await fetch(`${baseUrl}/api/industry/v1/context/project`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ projectId }),
  })
  assert.equal(response.status, 200)
}

async function traceId(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/industry/v1/traces`, { headers: { origin: 'http://127.0.0.1' } })
  assert.equal(response.status, 200)
  const body = await response.json() as { data: { traces: Array<{ traceId: string; kind: string; projectId: string }> } }
  const retrieval = body.data.traces.find((item) => item.kind === 'RETRIEVAL')
  assert.ok(retrieval)
  assert.equal(retrieval.projectId, 'project-1')
  return retrieval.traceId
}

test('trace API requires trace.read.basic and an active project', async () => {
  await withServer(makeRouter([]), async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/industry/v1/traces`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(denied.status, 403)
    assert.equal((await denied.json() as { error: { code: string } }).error.code, 'TRACE_ACCESS_DENIED')
  })

  await withServer(makeRouter(['trace.read.basic']), async (baseUrl) => {
    const missingProject = await fetch(`${baseUrl}/api/industry/v1/traces`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(missingProject.status, 409)
    assert.equal((await missingProject.json() as { error: { code: string } }).error.code, 'INDUSTRY_PROJECT_REQUIRED')
  })
})

test('basic trace detail excludes debug prompt audit and span payloads', async () => {
  await withServer(makeRouter(['trace.read.basic']), async (baseUrl) => {
    await selectProject(baseUrl)
    const id = await traceId(baseUrl)
    const response = await fetch(`${baseUrl}/api/industry/v1/traces/${encodeURIComponent(id)}`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(response.status, 200)
    const detail = (await response.json() as { data: Record<string, unknown> }).data
    assert.equal('debug' in detail, false)
    assert.equal('prompts' in detail, false)
    assert.equal('audit' in detail, false)
    const spans = detail.spans as Array<Record<string, unknown>>
    assert.ok(spans.length > 0)
    assert.ok(spans.every((span) => !('attributes' in span) && !('input' in span) && !('output' in span)))
  })
})

test('debug prompt and audit permissions are independent and all sensitive material is redacted', async () => {
  await withServer(makeRouter(['trace.read.basic', 'trace.read.debug', 'trace.read.prompt', 'audit.read']), async (baseUrl) => {
    await selectProject(baseUrl)
    const id = await traceId(baseUrl)
    const response = await fetch(`${baseUrl}/api/industry/v1/traces/${encodeURIComponent(id)}`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(response.status, 200)
    const payload = await response.json() as { data: Record<string, unknown> }
    assert.ok(payload.data.debug)
    assert.ok(payload.data.prompts)
    assert.ok(payload.data.audit)
    const serialized = JSON.stringify(payload.data)
    for (const forbidden of [
      'trace-root-secret',
      'trace-cookie-secret',
      'sk-live-super-secret',
      'mysql://trace:secret',
      'approval-private-123456',
      'request-secret',
      'private-cookie',
      'postgresql://u:p@trace-db/trace',
      'sk-tool-secret-123',
      'approval-tool-secret-123',
      'prompt-secret',
      'sk-prompt-secret-123',
      'approval-audit-secret-123',
      'audit-cookie-secret',
    ]) assert.equal(serialized.includes(forbidden), false, forbidden)
    assert.ok(serialized.includes('[REDACTED'))
  })

  await withServer(makeRouter(['trace.read.basic', 'trace.read.prompt']), async (baseUrl) => {
    await selectProject(baseUrl)
    const id = await traceId(baseUrl)
    const detail = (await (await fetch(`${baseUrl}/api/industry/v1/traces/${encodeURIComponent(id)}`, { headers: { origin: 'http://127.0.0.1' } })).json() as { data: Record<string, unknown> }).data
    assert.ok(detail.prompts)
    assert.equal('debug' in detail, false)
    assert.equal('audit' in detail, false)
  })
})

test('timeline is monotonic, tree preserves hierarchy, and stats account tokens consistently', async () => {
  await withServer(makeRouter(['trace.read.basic', 'trace.read.debug', 'audit.read']), async (baseUrl) => {
    await selectProject(baseUrl)
    const id = await traceId(baseUrl)

    const timelineResponse = await fetch(`${baseUrl}/api/industry/v1/traces/${encodeURIComponent(id)}/timeline`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(timelineResponse.status, 200)
    const timeline = (await timelineResponse.json() as { data: { events: Array<{ sequenceNo: number; type: string }> } }).data.events
    assert.deepEqual(timeline.map((event) => event.sequenceNo), timeline.map((_, index) => index + 1))
    assert.ok(timeline.some((event) => event.type === 'AUDIT'))

    const treeResponse = await fetch(`${baseUrl}/api/industry/v1/traces/${encodeURIComponent(id)}/tree`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(treeResponse.status, 200)
    const tree = (await treeResponse.json() as { data: { roots: Array<{ children: unknown[] }> } }).data
    assert.equal(tree.roots.length, 1)
    assert.equal(tree.roots[0]?.children.length, 3)

    const statsResponse = await fetch(`${baseUrl}/api/industry/v1/traces/${encodeURIComponent(id)}/stats`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(statsResponse.status, 200)
    const stats = (await statsResponse.json() as { data: { llmCallCount: number; toolCallCount: number; tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number } } }).data
    assert.equal(stats.llmCallCount, 1)
    assert.equal(stats.toolCallCount, 1)
    assert.equal(stats.tokenUsage.totalTokens, stats.tokenUsage.inputTokens + stats.tokenUsage.outputTokens)
  })
})

test('trace lookup is isolated by trusted project scope', async () => {
  await withServer(makeRouter(['trace.read.basic']), async (baseUrl) => {
    await selectProject(baseUrl, 'project-1')
    const projectOneTrace = await traceId(baseUrl)
    await selectProject(baseUrl, 'project-2')
    const hidden = await fetch(`${baseUrl}/api/industry/v1/traces/${encodeURIComponent(projectOneTrace)}`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(hidden.status, 404)
    assert.equal((await hidden.json() as { error: { code: string } }).error.code, 'TRACE_NOT_FOUND')
  })
})

test('redaction helpers mask sensitive keys and secret-looking text recursively', () => {
  const redacted = redactTraceValue({
    authorization: 'Bearer abc.def',
    nested: { apiKey: 'sk-unit-test-secret', databaseUrl: 'mysql://u:p@db/x' },
    text: 'approvalToken=approval-unit-secret-123 and postgresql://u:p@db/y',
  })
  const serialized = JSON.stringify(redacted)
  assert.equal(serialized.includes('abc.def'), false)
  assert.equal(serialized.includes('sk-unit-test-secret'), false)
  assert.equal(serialized.includes('mysql://'), false)
  assert.equal(serialized.includes('approval-unit-secret-123'), false)
  assert.equal(serialized.includes('postgresql://'), false)
  assert.equal(redactText('Authorization: Bearer token-123').includes('token-123'), false)
})
