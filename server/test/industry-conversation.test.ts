import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import type { IndustryConversation, IndustryEventBatch } from '../../shared/industry/conversation'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import type { TrustedRequestContext } from '../src/industry/context'
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
  sessionId: 'session-conversation-router',
}

function makeRouter() {
  const client = new MockIndustryAgentClient([
    { tenantId: 'tenant-1', projectId: 'project-1', companyId: 'company-1', name: 'Project One' },
  ])
  return createIndustryRouter({
    mode: 'control-plane',
    principalProvider: new MockPrincipalProvider(principal),
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

async function selectProject(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/industry/v1/context/project`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ projectId: 'project-1' }),
  })
  assert.equal(response.status, 200)
}

test('conversation creation requires server-selected project and rejects scope injection', async () => {
  await withServer(makeRouter(), async (baseUrl) => {
    const missingProject = await fetch(`${baseUrl}/api/industry/v1/conversations`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ title: 'Demo' }),
    })
    assert.equal(missingProject.status, 409)
    assert.equal((await missingProject.json() as { error: { code: string } }).error.code, 'INDUSTRY_PROJECT_REQUIRED')

    await selectProject(baseUrl)
    const injected = await fetch(`${baseUrl}/api/industry/v1/conversations`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ title: 'Demo', projectId: 'attacker-project' }),
    })
    assert.equal(injected.status, 400)

    const created = await fetch(`${baseUrl}/api/industry/v1/conversations`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ title: 'Demo conversation' }),
    })
    assert.equal(created.status, 201)
    const body = await created.json() as { data: IndustryConversation }
    assert.equal(body.data.projectId, 'project-1')
    assert.equal(body.data.title, 'Demo conversation')
    assert.equal(body.data.lastSequenceNo, 1)
  })
})

test('message events are monotonic and reconnect returns only events after cursor', async () => {
  await withServer(makeRouter(), async (baseUrl) => {
    await selectProject(baseUrl)
    const created = await fetch(`${baseUrl}/api/industry/v1/conversations`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    })
    const conversation = (await created.json() as { data: IndustryConversation }).data

    const injected = await fetch(`${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(conversation.conversationId)}/messages`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ text: '查询工程量', projectId: 'attacker-project' }),
    })
    assert.equal(injected.status, 400)

    const sent = await fetch(`${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(conversation.conversationId)}/messages`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ text: '查询工程量' }),
    })
    assert.equal(sent.status, 200)
    const sentBody = await sent.json() as { data: IndustryConversation }
    assert.equal(sentBody.data.messages.length, 2)
    assert.equal(sentBody.data.lastSequenceNo, 3)

    const allEvents = await fetch(`${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(conversation.conversationId)}/events`)
    const all = (await allEvents.json() as { data: IndustryEventBatch }).data
    assert.deepEqual(all.events.map((event) => event.sequenceNo), [1, 2, 3])
    assert.equal(new Set(all.events.map((event) => event.eventId)).size, 3)
    assert.ok(all.events.every((event) => event.schemaVersion === 'industry-event-v1'))

    const resumed = await fetch(`${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(conversation.conversationId)}/events?afterSequenceNo=1`)
    const resumedBody = (await resumed.json() as { data: IndustryEventBatch }).data
    assert.equal(resumedBody.afterSequenceNo, 1)
    assert.equal(resumedBody.latestSequenceNo, 3)
    assert.deepEqual(resumedBody.events.map((event) => event.sequenceNo), [2, 3])

    const invalidCursor = await fetch(`${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(conversation.conversationId)}/events?afterSequenceNo=-1`)
    assert.equal(invalidCursor.status, 400)
  })
})

test('abort is idempotent and blocks later messages', async () => {
  await withServer(makeRouter(), async (baseUrl) => {
    await selectProject(baseUrl)
    const created = await fetch(`${baseUrl}/api/industry/v1/conversations`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({}),
    })
    const conversation = (await created.json() as { data: IndustryConversation }).data

    const firstAbort = await fetch(`${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(conversation.conversationId)}/abort`, {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1' },
    })
    assert.equal(firstAbort.status, 200)
    const first = (await firstAbort.json() as { data: IndustryConversation }).data
    assert.equal(first.status, 'ABORTED')
    assert.equal(first.lastSequenceNo, 2)

    const secondAbort = await fetch(`${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(conversation.conversationId)}/abort`, {
      method: 'POST',
      headers: { origin: 'http://127.0.0.1' },
    })
    const second = (await secondAbort.json() as { data: IndustryConversation }).data
    assert.equal(second.lastSequenceNo, 2)

    const sent = await fetch(`${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(conversation.conversationId)}/messages`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ text: 'should fail' }),
    })
    assert.equal(sent.status, 409)
    assert.equal((await sent.json() as { error: { code: string } }).error.code, 'CONVERSATION_ABORTED')
  })
})

test('mock conversation lookup hides records from another project', async () => {
  const client = new MockIndustryAgentClient([])
  const projectOne: TrustedRequestContext = {
    requestId: 'request-1', userId: 'user-1', tenantId: 'tenant-1', companyId: 'company-1', projectId: 'project-1',
    roles: [], permissions: [], sessionId: 'session-1',
  }
  const projectTwo: TrustedRequestContext = { ...projectOne, projectId: 'project-2' }
  const created = await client.createConversation(projectOne, {}, 'request-create')
  await assert.rejects(
    client.getConversation(projectTwo, created.conversationId),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'CONVERSATION_NOT_FOUND',
  )
})
