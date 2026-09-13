import assert from 'node:assert/strict'
import test from 'node:test'
import type { TrustedRequestContext } from '../src/industry/context'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import type { UiActionPresentedEventPayload, UiActionTablePayload, UiActionType } from '../../shared/industry/ui-actions'

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

test('mock conversation can emit every P3 UIAction with monotonic event sequence', async () => {
  const client = new MockIndustryAgentClient([
    { tenantId: 'tenant-1', companyId: 'company-1', projectId: 'project-1', name: 'Project One' },
  ])
  const conversation = await client.createConversation(context, { title: 'UIAction demo' }, 'request-create')
  const updated = await client.sendConversationMessage(context, conversation.conversationId, { text: '演示全部 UIAction' }, 'request-send')
  assert.equal(updated.lastSequenceNo, 13)

  const batch = await client.getConversationEvents(context, conversation.conversationId, 0)
  assert.deepEqual(batch.events.map((event) => event.sequenceNo), Array.from({ length: 13 }, (_, index) => index + 1))
  const actions = batch.events
    .filter((event) => event.type === 'ui.action.presented')
    .map((event) => (event.payload as UiActionPresentedEventPayload).action)
  assert.deepEqual(actions.map((action) => action.type), expectedTypes)
})

test('DataTable fixture preserves 18-digit identifiers as strings and exposes server table controls', async () => {
  const client = new MockIndustryAgentClient([
    { tenantId: 'tenant-1', companyId: 'company-1', projectId: 'project-1', name: 'Project One' },
  ])
  const conversation = await client.createConversation(context, {}, 'request-create')
  await client.sendConversationMessage(context, conversation.conversationId, { text: 'show UIAction registry' }, 'request-send')
  const batch = await client.getConversationEvents(context, conversation.conversationId, 0)
  const tableAction = batch.events
    .filter((event) => event.type === 'ui.action.presented')
    .map((event) => (event.payload as UiActionPresentedEventPayload).action)
    .find((action) => action.type === 'table')
  assert.ok(tableAction)
  const payload = tableAction.payload as UiActionTablePayload
  assert.equal(payload.rows[0]?.rowId, '123456789012345678')
  assert.equal(payload.rows[0]?.cells.id, '123456789012345678')
  assert.equal(typeof payload.rows[0]?.cells.id, 'string')
  assert.deepEqual(payload.sortAllowlist, ['id', 'code', 'quantity'])
  assert.deepEqual(payload.filterAllowlist, ['code', 'name'])
  assert.equal(payload.pagination.stableCursor, 'cursor:p1:v1')
  assert.equal(payload.exportSnapshotRef, 'snapshot://boq/mock-001')
})
