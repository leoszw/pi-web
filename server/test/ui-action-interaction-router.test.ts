import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import type { IndustryConversation, IndustryEventBatch } from '../../shared/industry/conversation'
import type { UiActionInteractionResult, UiActionPresentedEventPayload, UiActionTablePayload } from '../../shared/industry/ui-actions'
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
  sessionId: 'session-ui-action-router',
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
    jsonBodyLimitBytes: 8192,
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

async function createUiActionConversation(baseUrl: string): Promise<{
  conversation: IndustryConversation
  tableActionId: string
  mutationActionId: string
  table: UiActionTablePayload
}> {
  const created = await fetch(`${baseUrl}/api/industry/v1/conversations`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ title: 'UI action interaction test' }),
  })
  const conversation = (await created.json() as { data: IndustryConversation }).data
  const sent = await fetch(`${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(conversation.conversationId)}/messages`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ text: '演示全部 UIAction' }),
  })
  assert.equal(sent.status, 200)
  const eventsResponse = await fetch(`${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(conversation.conversationId)}/events`)
  const events = (await eventsResponse.json() as { data: IndustryEventBatch }).data.events
  const actions = events
    .filter((event) => event.type === 'ui.action.presented')
    .map((event) => (event.payload as UiActionPresentedEventPayload).action)
  const tableAction = actions.find((action) => action.type === 'table')
  const mutationAction = actions.find((action) => action.type === 'mutation_confirmation')
  assert.ok(tableAction)
  assert.ok(mutationAction)
  return {
    conversation,
    tableActionId: tableAction.actionId,
    mutationActionId: mutationAction.actionId,
    table: tableAction.payload as UiActionTablePayload,
  }
}

test('UIAction interaction route rejects scope injection and returns server-paginated table pages', async () => {
  await withServer(makeRouter(), async (baseUrl) => {
    await selectProject(baseUrl)
    const fixture = await createUiActionConversation(baseUrl)
    assert.ok(fixture.table.pagination.nextCursor)
    const path = `${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(fixture.conversation.conversationId)}/ui-actions/${encodeURIComponent(fixture.tableActionId)}/interactions`

    const injected = await fetch(path, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        projectId: 'attacker-project',
        interaction: { kind: 'table_query', pageSize: 2 },
      }),
    })
    assert.equal(injected.status, 400)

    const next = await fetch(path, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        interaction: {
          kind: 'table_query',
          pageSize: 2,
          cursor: fixture.table.pagination.nextCursor,
        },
      }),
    })
    assert.equal(next.status, 200)
    const result = (await next.json() as { data: UiActionInteractionResult }).data
    const page = result.action.payload as UiActionTablePayload
    assert.deepEqual(page.rows.map((row) => row.rowId), ['123456789012345680', '123456789012345681'])
    assert.equal(typeof page.rows[0]?.rowId, 'string')

    const resumed = await fetch(`${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(fixture.conversation.conversationId)}/events?afterSequenceNo=13`)
    const resumedBody = (await resumed.json() as { data: IndustryEventBatch }).data
    assert.deepEqual(resumedBody.events.map((event) => event.type), ['ui.action.interaction.accepted', 'ui.action.presented'])
  })
})

test('BFF and mock adapter enforce table allowlists and keep P3 mutation confirmation display-only', async () => {
  await withServer(makeRouter(), async (baseUrl) => {
    await selectProject(baseUrl)
    const fixture = await createUiActionConversation(baseUrl)
    const tablePath = `${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(fixture.conversation.conversationId)}/ui-actions/${encodeURIComponent(fixture.tableActionId)}/interactions`

    const badSort = await fetch(tablePath, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ interaction: { kind: 'table_query', pageSize: 2, sort: { key: 'name', direction: 'asc' } } }),
    })
    assert.equal(badSort.status, 400)
    assert.equal((await badSort.json() as { error: { code: string } }).error.code, 'UI_ACTION_SORT_NOT_ALLOWED')

    const badFilter = await fetch(tablePath, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ interaction: { kind: 'table_query', pageSize: 2, filters: [{ key: 'id', value: '123' }] } }),
    })
    assert.equal(badFilter.status, 400)
    assert.equal((await badFilter.json() as { error: { code: string } }).error.code, 'UI_ACTION_FILTER_NOT_ALLOWED')

    const mutationPath = `${baseUrl}/api/industry/v1/conversations/${encodeURIComponent(fixture.conversation.conversationId)}/ui-actions/${encodeURIComponent(fixture.mutationActionId)}/interactions`
    const mutation = await fetch(mutationPath, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ interaction: { kind: 'form_submit', values: {} } }),
    })
    assert.equal(mutation.status, 409)
    assert.equal((await mutation.json() as { error: { code: string } }).error.code, 'UI_ACTION_MUTATION_DISABLED_P3')
  })
})
