import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { IndustryEventEnvelope } from '../../shared/industry/conversation'
import type { UiActionEnvelope } from '../../shared/industry/ui-actions'
import { actionsFromEvents, IndustryWorkspaceView, type IndustryWorkspaceSnapshot } from '../src/features/industry-workspace/IndustryWorkspacePage'
import { IndustryEventBuffer } from '../src/features/industry-workspace/event-buffer'

const traceId = 'trace-workspace-1'
const base = (type: UiActionEnvelope['type'], payload: UiActionEnvelope['payload'], index: number): UiActionEnvelope => ({
  schemaVersion: 'ui-action-v1', actionId: `action-${index}`, type, traceId, payload,
})

const actions: readonly UiActionEnvelope[] = [
  base('entity_picker', { title: 'Entity', entityType: 'engineering', options: [{ id: 'e1', label: 'Position 1' }], selectedEntityIds: ['e1'], multi: false }, 1),
  base('form', { title: 'Form', fields: [{ key: 'q', label: 'Query', value: 'K12' }], submitLabel: 'Search' }, 2),
  base('editable_form', { title: 'Editable', fields: [{ key: 'owner', label: 'Owner', value: '张三' }], submitLabel: 'Save', version: 'v1' }, 3),
  base('table', { title: 'Table', columns: [{ key: 'id', label: 'ID', sortable: true, filterable: false }, { key: 'name', label: 'Name', sortable: false, filterable: true }], rows: [{ rowId: '123456789012345678', cells: { id: '123456789012345678', name: '<script>alert(1)</script>' } }], pagination: { pageSize: 20, stableCursor: 'mock-table-v1:abcdef123456:0', nextCursor: 'mock-table-v1:abcdef123456:20', totalRows: 21 }, query: { sort: { key: 'id', direction: 'asc' }, filters: [{ key: 'name', value: 'C30' }] }, sortAllowlist: ['id'], filterAllowlist: ['name'], selectedRowIds: ['123456789012345678'], exportSnapshotRef: 'snapshot://table/1' }, 4),
  base('multi_select', { title: 'Multi', options: [{ id: 'a', label: 'A' }], selectedIds: ['a'] }, 5),
  base('date_picker', { title: 'Date', value: '2026-09-13' }, 6),
  base('diff', { title: 'Diff', entries: [{ field: 'owner', label: 'Owner', before: '李四', after: '张三' }] }, 7),
  base('mutation_confirmation', { title: 'Confirm', operationId: 'op-1', digest: 'sha256:digest', summary: 'summary', warning: 'mock only' }, 8),
  base('report_preview', { title: 'Report', format: 'XLSX', snapshotRef: 'snapshot://report/1', summary: 'preview' }, 9),
  base('error_resolution', { title: 'Error', code: 'PROJECT_REQUIRED', message: 'select project', resolution: 'reselect_project' }, 10),
]

const snapshot: IndustryWorkspaceSnapshot = {
  context: {
    apiVersion: 'industry-api-v1',
    context: { requestId: 'request-1', userId: 'user-1', tenantId: 'tenant-1', companyId: 'company-1', projectId: 'project-1' },
    authorizedProjects: [{ projectId: 'project-1', companyId: 'company-1', name: 'Project One' }],
  },
  conversation: {
    conversationId: 'conversation-1', projectId: 'project-1', title: 'Workspace', status: 'ACTIVE',
    createdAt: '2026-09-13T00:00:00.000Z', updatedAt: '2026-09-13T00:00:01.000Z', lastSequenceNo: 13,
    messages: [{ messageId: 'message-1', role: 'ASSISTANT', text: 'Mock response', createdAt: '2026-09-13T00:00:01.000Z', traceId }],
  },
  events: [],
  actions,
}

describe('IndustryWorkspaceView', () => {
  it('renders the three required workspace columns and inspector placeholders', () => {
    const html = renderToStaticMarkup(<IndustryWorkspaceView snapshot={snapshot} message="" busy={false} error={null} />)
    expect(html).toContain('Project Context')
    expect(html).toContain('Conversation')
    expect(html).toContain('Context Inspector')
    expect(html).toContain('Tool Card')
    expect(html).toContain('Citation')
    expect(html).toContain('Working Memory')
    expect(html).toContain('Trace link')
    expect(html).toContain('Image upload')
    expect(html).toContain('Export placeholder')
  })

  it('renders all ten UIAction registry types', () => {
    const html = renderToStaticMarkup(<IndustryWorkspaceView snapshot={snapshot} message="" busy={false} error={null} />)
    for (const type of ['entity_picker', 'form', 'editable_form', 'table', 'multi_select', 'date_picker', 'diff', 'mutation_confirmation', 'report_preview', 'error_resolution']) {
      expect(html).toContain(`data-ui-action="${type}"`)
    }
  })

  it('renders server DataTable controls, restores query state, preserves 18-digit IDs and escapes raw HTML', () => {
    const html = renderToStaticMarkup(<IndustryWorkspaceView snapshot={snapshot} message="" busy={false} error={null} />)
    expect(html).toContain('123456789012345678')
    expect(html).toContain('mock-table-v1:abcdef123456:0')
    expect(html).toContain('snapshot://table/1')
    expect(html).toContain('Apply server query')
    expect(html).toContain('1 / 21 rows')
    expect(html).toContain('C30')
    expect(html).toContain('Next')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('keeps mutation confirmation display-only in P3', () => {
    const html = renderToStaticMarkup(<IndustryWorkspaceView snapshot={snapshot} message="" busy={false} error={null} />)
    expect(html).toContain('Confirmation handled in P4')
    expect(html).toContain('disabled=""')
  })
})

describe('IndustryEventBuffer UIAction support', () => {
  it('treats presented and interaction events as known while preserving cursor monotonicity', () => {
    const buffer = new IndustryEventBuffer()
    const result = buffer.apply([
      event(1, 'ui.action.presented', { action: actions[0] }),
      event(2, 'ui.action.interaction.accepted', { interactionId: 'interaction-1', actionId: 'action-1', kind: 'entity_selection' }),
    ])
    expect(result.applied).toHaveLength(2)
    expect(result.ignoredUnknown).toHaveLength(0)
    expect(buffer.afterSequenceNo).toBe(2)
  })

  it('reduces repeated presented events to the latest state for each action id', () => {
    const updated = { ...actions[0], traceId: 'trace-updated', payload: { ...(actions[0]?.payload as object), selectedEntityIds: [] } } as UiActionEnvelope
    const latest = actionsFromEvents([
      event(1, 'ui.action.presented', { action: actions[0] }),
      event(2, 'ui.action.interaction.accepted', { interactionId: 'interaction-1', actionId: 'action-1', kind: 'entity_selection' }),
      event(3, 'ui.action.presented', { action: updated }),
    ])
    expect(latest).toHaveLength(1)
    expect(latest[0]?.actionId).toBe('action-1')
    expect(latest[0]?.traceId).toBe('trace-updated')
  })
})

function event(sequenceNo: number, type: string, payload: unknown): IndustryEventEnvelope {
  return {
    schemaVersion: 'industry-event-v1',
    eventId: `event-${sequenceNo}`,
    sequenceNo,
    traceId: `trace-${sequenceNo}`,
    requestId: `request-${sequenceNo}`,
    conversationId: 'conversation-1',
    type,
    timestamp: '2026-09-13T00:00:00.000Z',
    payload,
  }
}
