import assert from 'node:assert/strict'
import test from 'node:test'
import type { TrustedRequestContext } from '../src/industry/context'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import type { UiActionEnvelope, UiActionPresentedEventPayload, UiActionTablePayload, UiActionType } from '../../shared/industry/ui-actions'

const context: TrustedRequestContext = {
  requestId: 'request-ui-action',
  userId: 'user-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  projectId: 'project-1',
  roles: ['project-user'],
  permissions: [],
  sessionId: 'session-ui-action',
}

const expectedTypes: readonly UiActionType[] = [
  'entity_picker', 'form', 'editable_form', 'table', 'multi_select',
  'date_picker', 'diff', 'mutation_confirmation', 'report_preview', 'error_resolution',
]

function client(): MockIndustryAgentClient {
  return new MockIndustryAgentClient([
    { tenantId: 'tenant-1', companyId: 'company-1', projectId: 'project-1', name: 'Project One' },
  ])
}

async function actionFixture(type: UiActionType): Promise<{
  client: MockIndustryAgentClient
  conversationId: string
  action: UiActionEnvelope
}> {
  const mock = client()
  const conversation = await mock.createConversation(context, {}, 'request-create')
  await mock.sendConversationMessage(context, conversation.conversationId, { text: '演示全部 UIAction' }, 'request-send')
  const batch = await mock.getConversationEvents(context, conversation.conversationId, 0)
  const action = batch.events
    .filter((event) => event.type === 'ui.action.presented')
    .map((event) => (event.payload as UiActionPresentedEventPayload).action)
    .find((item) => item.type === type)
  assert.ok(action)
  return { client: mock, conversationId: conversation.conversationId, action }
}

test('mock conversation can emit every P3 UIAction with monotonic event sequence', async () => {
  const mock = client()
  const conversation = await mock.createConversation(context, { title: 'UIAction demo' }, 'request-create')
  const updated = await mock.sendConversationMessage(context, conversation.conversationId, { text: '演示全部 UIAction' }, 'request-send')
  assert.equal(updated.lastSequenceNo, 13)

  const batch = await mock.getConversationEvents(context, conversation.conversationId, 0)
  assert.deepEqual(batch.events.map((event) => event.sequenceNo), Array.from({ length: 13 }, (_, index) => index + 1))
  const actions = batch.events
    .filter((event) => event.type === 'ui.action.presented')
    .map((event) => (event.payload as UiActionPresentedEventPayload).action)
  assert.deepEqual(actions.map((action) => action.type), expectedTypes)
  assert.equal(JSON.stringify(actions).toLowerCase().includes('approval token'), false)
  assert.equal(JSON.stringify(actions).toLowerCase().includes('approval_token'), false)
})

test('DataTable fixture preserves 18-digit identifiers and starts with a server-paginated snapshot', async () => {
  const fixture = await actionFixture('table')
  const payload = fixture.action.payload as UiActionTablePayload
  assert.equal(payload.rows.length, 2)
  assert.equal(payload.rows[0]?.rowId, '123456789012345678')
  assert.equal(payload.rows[0]?.cells.id, '123456789012345678')
  assert.equal(typeof payload.rows[0]?.cells.id, 'string')
  assert.deepEqual(payload.sortAllowlist, ['id', 'code', 'quantity'])
  assert.deepEqual(payload.filterAllowlist, ['code', 'name'])
  assert.deepEqual(payload.query, { filters: [] })
  assert.equal(payload.pagination.totalRows, 5)
  assert.match(payload.pagination.stableCursor, /^mock-table-v1:[a-f0-9]{12}:0$/u)
  assert.match(payload.pagination.nextCursor ?? '', /^mock-table-v1:[a-f0-9]{12}:2$/u)
  assert.equal(payload.exportSnapshotRef, 'snapshot://boq/mock-001')
})

test('DataTable interaction performs stable-cursor server pagination and emits recoverable events', async () => {
  const fixture = await actionFixture('table')
  const first = fixture.action.payload as UiActionTablePayload
  assert.ok(first.pagination.nextCursor)

  const result = await fixture.client.interactWithUiAction(context, fixture.conversationId, fixture.action.actionId, {
    interaction: {
      kind: 'table_query',
      pageSize: 2,
      cursor: first.pagination.nextCursor,
    },
  }, 'request-table-next')
  const second = result.action.payload as UiActionTablePayload
  assert.deepEqual(second.rows.map((row) => row.rowId), ['123456789012345680', '123456789012345681'])
  assert.deepEqual(second.query, { filters: [] })
  assert.ok(second.pagination.previousCursor)
  assert.ok(second.pagination.nextCursor)

  const conversation = await fixture.client.getConversation(context, fixture.conversationId)
  assert.equal(conversation.lastSequenceNo, 15)
  const resumed = await fixture.client.getConversationEvents(context, fixture.conversationId, 13)
  assert.deepEqual(resumed.events.map((event) => event.type), ['ui.action.interaction.accepted', 'ui.action.presented'])
  assert.deepEqual(resumed.events.map((event) => event.sequenceNo), [14, 15])
})

test('DataTable applies server sort/filter allowlists and persists query shape for reconnect', async () => {
  const fixture = await actionFixture('table')
  const first = fixture.action.payload as UiActionTablePayload
  assert.ok(first.pagination.nextCursor)

  const filtered = await fixture.client.interactWithUiAction(context, fixture.conversationId, fixture.action.actionId, {
    interaction: {
      kind: 'table_query',
      pageSize: 2,
      sort: { key: 'quantity', direction: 'desc' },
      filters: [{ key: 'name', value: 'C30' }],
    },
  }, 'request-filter')
  const filteredPayload = filtered.action.payload as UiActionTablePayload
  assert.equal(filteredPayload.pagination.totalRows, 2)
  assert.deepEqual(filteredPayload.rows.map((row) => row.cells.quantity), [128.5, 76.25])
  assert.deepEqual(filteredPayload.query, {
    sort: { key: 'quantity', direction: 'desc' },
    filters: [{ key: 'name', value: 'C30' }],
  })

  await assert.rejects(
    fixture.client.interactWithUiAction(context, fixture.conversationId, fixture.action.actionId, {
      interaction: { kind: 'table_query', pageSize: 2, sort: { key: 'name', direction: 'asc' } },
    }, 'request-bad-sort'),
    hasCode('UI_ACTION_SORT_NOT_ALLOWED'),
  )
  await assert.rejects(
    fixture.client.interactWithUiAction(context, fixture.conversationId, fixture.action.actionId, {
      interaction: { kind: 'table_query', pageSize: 2, filters: [{ key: 'id', value: '123' }] },
    }, 'request-bad-filter'),
    hasCode('UI_ACTION_FILTER_NOT_ALLOWED'),
  )
  await assert.rejects(
    fixture.client.interactWithUiAction(context, fixture.conversationId, fixture.action.actionId, {
      interaction: {
        kind: 'table_query',
        pageSize: 2,
        cursor: first.pagination.nextCursor,
        sort: { key: 'code', direction: 'asc' },
      },
    }, 'request-stale-cursor'),
    hasCode('UI_ACTION_CURSOR_MISMATCH'),
  )
})

test('DataTable row selection keeps 18-digit IDs as strings across the interaction channel', async () => {
  const fixture = await actionFixture('table')
  const result = await fixture.client.interactWithUiAction(context, fixture.conversationId, fixture.action.actionId, {
    interaction: {
      kind: 'table_selection',
      selectedRowIds: ['123456789012345678', '123456789012345680'],
    },
  }, 'request-selection')
  const payload = result.action.payload as UiActionTablePayload
  assert.deepEqual(payload.selectedRowIds, ['123456789012345678', '123456789012345680'])
  assert.ok(payload.selectedRowIds.every((id) => typeof id === 'string'))

  await assert.rejects(
    fixture.client.interactWithUiAction(context, fixture.conversationId, fixture.action.actionId, {
      interaction: { kind: 'table_selection', selectedRowIds: ['999999999999999999'] },
    }, 'request-selection-invalid'),
    hasCode('UI_ACTION_ROW_NOT_FOUND'),
  )
})

test('P3 interaction channel cannot confirm mutation actions', async () => {
  const fixture = await actionFixture('mutation_confirmation')
  await assert.rejects(
    fixture.client.interactWithUiAction(context, fixture.conversationId, fixture.action.actionId, {
      interaction: { kind: 'form_submit', values: {} },
    }, 'request-mutation'),
    hasCode('UI_ACTION_MUTATION_DISABLED_P3'),
  )
})

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof Error && 'code' in error && error.code === code
}
