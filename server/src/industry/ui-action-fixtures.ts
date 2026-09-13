import { createHash } from 'node:crypto'
import type {
  DatePickerPayload,
  EditableFormPayload,
  EntityPickerPayload,
  FormPayload,
  MultiSelectPayload,
  UiActionEnvelope,
  UiActionInteraction,
  UiActionPrimitive,
  UiActionTableFilter,
  UiActionTablePayload,
  UiActionTableRow,
  UiActionTableSort,
  UiActionType,
} from '../../../shared/industry/ui-actions'

const LONG_ID = '123456789012345678'
const TABLE_CURSOR_VERSION = 'mock-table-v1'
const MAX_PAGE_SIZE = 100

const BOQ_ROWS: readonly UiActionTableRow[] = [
  { rowId: LONG_ID, cells: { id: LONG_ID, code: '104-1-a', name: 'C30 混凝土基础 <script>alert(1)</script>', quantity: 128.5 } },
  { rowId: '123456789012345679', cells: { id: '123456789012345679', code: '104-1-b', name: 'C25 混凝土基础', quantity: 96 } },
  { rowId: '123456789012345680', cells: { id: '123456789012345680', code: '204-2-a', name: 'C30 混凝土墩柱', quantity: 76.25 } },
  { rowId: '123456789012345681', cells: { id: '123456789012345681', code: '204-2-b', name: 'HRB400 钢筋', quantity: 42.8 } },
  { rowId: '123456789012345682', cells: { id: '123456789012345682', code: '304-3-a', name: 'C35 盖梁混凝土', quantity: 64.1 } },
]

export function buildMockUiActions(text: string, traceId: string): readonly UiActionEnvelope[] {
  const all = /uiaction|交互组件|全部组件|all actions/iu.test(text)
  const actions: readonly UiActionType[] = all ? ALL_TYPES : []
  return actions.map((type, index) => actionFor(type, traceId, index))
}

export function applyMockUiActionInteraction(
  action: UiActionEnvelope,
  interaction: UiActionInteraction,
): UiActionEnvelope {
  switch (interaction.kind) {
    case 'entity_selection': {
      if (action.type !== 'entity_picker') throw mismatch(action, interaction.kind)
      const payload = action.payload as EntityPickerPayload
      const allowed = new Set(payload.options.map((option) => option.id))
      if (interaction.selectedEntityIds.some((id) => !allowed.has(id))) {
        throw new MockUiActionInteractionError('UI_ACTION_ENTITY_NOT_ALLOWED', 'selected entity is not in the action options', 400)
      }
      if (!payload.multi && interaction.selectedEntityIds.length > 1) {
        throw new MockUiActionInteractionError('UI_ACTION_SELECTION_INVALID', 'single-select action accepts at most one entity', 400)
      }
      return cloneAction(action, { ...payload, selectedEntityIds: [...new Set(interaction.selectedEntityIds)] })
    }
    case 'form_submit': {
      if (action.type !== 'form' && action.type !== 'editable_form') throw mismatch(action, interaction.kind)
      const payload = action.payload as FormPayload | EditableFormPayload
      const allowedFields = new Map(payload.fields.map((field) => [field.key, field]))
      for (const key of Object.keys(interaction.values)) {
        const field = allowedFields.get(key)
        if (field === undefined) throw new MockUiActionInteractionError('UI_ACTION_FIELD_NOT_ALLOWED', `field is not allowed: ${key}`, 400)
        if (field.readOnly === true) throw new MockUiActionInteractionError('UI_ACTION_FIELD_READ_ONLY', `field is read-only: ${key}`, 409)
      }
      const fields = payload.fields.map((field) => Object.prototype.hasOwnProperty.call(interaction.values, field.key)
        ? { ...field, value: interaction.values[field.key] ?? null }
        : field)
      return cloneAction(action, { ...payload, fields })
    }
    case 'table_query': {
      if (action.type !== 'table') throw mismatch(action, interaction.kind)
      return cloneAction(action, queryTable(action.actionId, action.payload as UiActionTablePayload, interaction))
    }
    case 'table_selection': {
      if (action.type !== 'table') throw mismatch(action, interaction.kind)
      const payload = action.payload as UiActionTablePayload
      const allowed = new Set(BOQ_ROWS.map((row) => row.rowId))
      if (interaction.selectedRowIds.some((id) => !allowed.has(id))) {
        throw new MockUiActionInteractionError('UI_ACTION_ROW_NOT_FOUND', 'selected table row does not exist in the snapshot', 400)
      }
      return cloneAction(action, { ...payload, selectedRowIds: [...new Set(interaction.selectedRowIds)] })
    }
    case 'multi_select': {
      if (action.type !== 'multi_select') throw mismatch(action, interaction.kind)
      const payload = action.payload as MultiSelectPayload
      const allowed = new Set(payload.options.map((option) => option.id))
      if (interaction.selectedIds.some((id) => !allowed.has(id))) {
        throw new MockUiActionInteractionError('UI_ACTION_OPTION_NOT_ALLOWED', 'selected option is not in the action options', 400)
      }
      return cloneAction(action, { ...payload, selectedIds: [...new Set(interaction.selectedIds)] })
    }
    case 'date_select': {
      if (action.type !== 'date_picker') throw mismatch(action, interaction.kind)
      const payload = action.payload as DatePickerPayload
      if (interaction.value !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(interaction.value)) {
        throw new MockUiActionInteractionError('UI_ACTION_DATE_INVALID', 'date must use YYYY-MM-DD', 400)
      }
      if (interaction.value !== null && payload.min !== undefined && interaction.value < payload.min) {
        throw new MockUiActionInteractionError('UI_ACTION_DATE_INVALID', 'date is before the allowed range', 400)
      }
      if (interaction.value !== null && payload.max !== undefined && interaction.value > payload.max) {
        throw new MockUiActionInteractionError('UI_ACTION_DATE_INVALID', 'date is after the allowed range', 400)
      }
      return cloneAction(action, { ...payload, value: interaction.value })
    }
  }
}

export class MockUiActionInteractionError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(code: string, message: string, statusCode: number) {
    super(message)
    this.name = 'MockUiActionInteractionError'
    this.code = code
    this.statusCode = statusCode
  }
}

const ALL_TYPES: readonly UiActionType[] = [
  'entity_picker',
  'form',
  'editable_form',
  'table',
  'multi_select',
  'date_picker',
  'diff',
  'mutation_confirmation',
  'report_preview',
  'error_resolution',
]

function actionFor(type: UiActionType, traceId: string, index: number): UiActionEnvelope {
  const base = {
    schemaVersion: 'ui-action-v1' as const,
    actionId: `${traceId}:${type}:${index + 1}`,
    type,
    traceId,
  }
  switch (type) {
    case 'entity_picker':
      return { ...base, payload: {
        title: '选择工程部位',
        entityType: 'engineering_position',
        options: [
          { id: 'eng-001', label: 'K12+300-K12+800 左幅路基填筑', description: '路基工程' },
          { id: 'eng-002', label: 'K12+300-K12+800 右幅路基填筑', description: '路基工程' },
        ],
        selectedEntityIds: ['eng-001'],
        multi: false,
      } }
    case 'form':
      return { ...base, payload: {
        title: '查询条件',
        fields: [
          { key: 'chainage', label: '桩号', value: 'K12+300-K12+800', required: true },
          { key: 'alignment', label: '幅别', value: 'LEFT' },
        ],
        submitLabel: '查询',
      } }
    case 'editable_form':
      return { ...base, payload: {
        title: '编辑工程属性',
        fields: [
          { key: 'name', label: '名称', value: '左幅路基填筑', required: true },
          { key: 'owner', label: '负责人', value: '张三' },
        ],
        submitLabel: '保存草稿',
        version: 'entity-v17',
      } }
    case 'table':
      return { ...base, payload: initialTablePayload(base.actionId) }
    case 'multi_select':
      return { ...base, payload: {
        title: '选择章节',
        options: [
          { id: 'chapter-100', label: '总则' },
          { id: 'chapter-400', label: '桥梁工程' },
        ],
        selectedIds: ['chapter-400'],
      } }
    case 'date_picker':
      return { ...base, payload: {
        title: '统计日期',
        value: '2026-09-13',
        min: '2026-01-01',
        max: '2026-12-31',
      } }
    case 'diff':
      return { ...base, payload: {
        title: '变更预览',
        entries: [
          { field: 'owner', label: '负责人', before: '李四', after: '张三' },
          { field: 'quantity', label: '工程量', before: 120, after: 128.5 },
        ],
      } }
    case 'mutation_confirmation':
      return { ...base, payload: {
        title: '确认写入',
        operationId: 'mock-operation-001',
        digest: 'sha256:mock-digest-not-a-token',
        summary: '将 1 条工程记录负责人修改为张三。',
        warning: 'P3 仅展示确认面，不执行真实 DML。',
      } }
    case 'report_preview':
      return { ...base, payload: {
        title: '月度工程量报表',
        format: 'XLSX',
        snapshotRef: 'snapshot://report/monthly-2026-09',
        summary: 'Mock 报表预览，导出功能将在后续阶段接入。',
      } }
    case 'error_resolution':
      return { ...base, payload: {
        title: '需要重新选择项目',
        code: 'INDUSTRY_PROJECT_REQUIRED',
        message: '当前操作需要活动项目。',
        resolution: 'reselect_project',
      } }
  }
}

function initialTablePayload(actionId: string): UiActionTablePayload {
  const base: Omit<UiActionTablePayload, 'rows' | 'pagination'> = {
    title: '工程量清单结果',
    columns: [
      { key: 'id', label: '清单 ID', sortable: true, filterable: false },
      { key: 'code', label: '编码', sortable: true, filterable: true },
      { key: 'name', label: '名称', sortable: false, filterable: true },
      { key: 'quantity', label: '工程量', sortable: true, filterable: false },
    ],
    sortAllowlist: ['id', 'code', 'quantity'],
    filterAllowlist: ['code', 'name'],
    selectedRowIds: [LONG_ID],
    exportSnapshotRef: 'snapshot://boq/mock-001',
  }
  return queryTable(actionId, { ...base, rows: [], pagination: { pageSize: 2, stableCursor: '', totalRows: BOQ_ROWS.length } }, {
    kind: 'table_query',
    pageSize: 2,
  })
}

function queryTable(
  actionId: string,
  current: UiActionTablePayload,
  interaction: Extract<UiActionInteraction, { kind: 'table_query' }>,
): UiActionTablePayload {
  if (!Number.isInteger(interaction.pageSize) || interaction.pageSize < 1 || interaction.pageSize > MAX_PAGE_SIZE) {
    throw new MockUiActionInteractionError('UI_ACTION_PAGE_SIZE_INVALID', `pageSize must be between 1 and ${MAX_PAGE_SIZE}`, 400)
  }
  if (interaction.sort !== undefined && !current.sortAllowlist.includes(interaction.sort.key)) {
    throw new MockUiActionInteractionError('UI_ACTION_SORT_NOT_ALLOWED', `sort key is not allowed: ${interaction.sort.key}`, 400)
  }
  const filters = normalizeFilters(interaction.filters ?? [])
  for (const filter of filters) {
    if (!current.filterAllowlist.includes(filter.key)) {
      throw new MockUiActionInteractionError('UI_ACTION_FILTER_NOT_ALLOWED', `filter key is not allowed: ${filter.key}`, 400)
    }
  }

  const fingerprint = tableQueryFingerprint(actionId, interaction.pageSize, interaction.sort, filters)
  const offset = interaction.cursor === undefined ? 0 : parseCursor(interaction.cursor, fingerprint)
  const rows = sortRows(filterRows(BOQ_ROWS, filters), interaction.sort)
  if (offset > rows.length) throw new MockUiActionInteractionError('UI_ACTION_CURSOR_INVALID', 'cursor is outside the result snapshot', 400)
  const pageRows = rows.slice(offset, offset + interaction.pageSize)
  const nextOffset = offset + interaction.pageSize
  const previousOffset = Math.max(0, offset - interaction.pageSize)
  return {
    ...current,
    rows: pageRows.map((row) => structuredClone(row)),
    pagination: {
      pageSize: interaction.pageSize,
      stableCursor: makeCursor(fingerprint, offset),
      ...(nextOffset < rows.length ? { nextCursor: makeCursor(fingerprint, nextOffset) } : {}),
      ...(offset > 0 ? { previousCursor: makeCursor(fingerprint, previousOffset) } : {}),
      totalRows: rows.length,
    },
  }
}

function normalizeFilters(filters: readonly UiActionTableFilter[]): readonly UiActionTableFilter[] {
  return filters
    .map((filter) => ({ key: filter.key, value: filter.value.trim() }))
    .filter((filter) => filter.value !== '')
    .sort((a, b) => a.key.localeCompare(b.key) || a.value.localeCompare(b.value))
}

function filterRows(rows: readonly UiActionTableRow[], filters: readonly UiActionTableFilter[]): readonly UiActionTableRow[] {
  if (filters.length === 0) return rows
  return rows.filter((row) => filters.every((filter) => String(row.cells[filter.key] ?? '')
    .toLocaleLowerCase()
    .includes(filter.value.toLocaleLowerCase())))
}

function sortRows(rows: readonly UiActionTableRow[], sort: UiActionTableSort | undefined): readonly UiActionTableRow[] {
  if (sort === undefined) return rows
  const direction = sort.direction === 'asc' ? 1 : -1
  return [...rows].sort((left, right) => {
    const comparison = comparePrimitive(left.cells[sort.key] ?? null, right.cells[sort.key] ?? null)
    return comparison === 0 ? left.rowId.localeCompare(right.rowId) : comparison * direction
  })
}

function comparePrimitive(left: UiActionPrimitive, right: UiActionPrimitive): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return String(left ?? '').localeCompare(String(right ?? ''), 'zh-CN', { numeric: true })
}

function tableQueryFingerprint(
  actionId: string,
  pageSize: number,
  sort: UiActionTableSort | undefined,
  filters: readonly UiActionTableFilter[],
): string {
  return createHash('sha256')
    .update(JSON.stringify({ actionId, pageSize, sort: sort ?? null, filters }))
    .digest('hex')
    .slice(0, 12)
}

function makeCursor(fingerprint: string, offset: number): string {
  return `${TABLE_CURSOR_VERSION}:${fingerprint}:${offset}`
}

function parseCursor(cursor: string, expectedFingerprint: string): number {
  const match = cursor.match(/^mock-table-v1:([a-f0-9]{12}):(\d+)$/u)
  if (match === null || match[1] !== expectedFingerprint) {
    throw new MockUiActionInteractionError('UI_ACTION_CURSOR_MISMATCH', 'cursor does not match the current table query', 409)
  }
  const offset = Number(match[2])
  if (!Number.isSafeInteger(offset)) throw new MockUiActionInteractionError('UI_ACTION_CURSOR_INVALID', 'cursor offset is invalid', 400)
  return offset
}

function cloneAction(action: UiActionEnvelope, payload: unknown): UiActionEnvelope {
  return structuredClone({ ...action, payload }) as UiActionEnvelope
}

function mismatch(action: UiActionEnvelope, kind: UiActionInteraction['kind']): MockUiActionInteractionError {
  return new MockUiActionInteractionError(
    'UI_ACTION_INTERACTION_MISMATCH',
    `interaction ${kind} is not valid for action type ${action.type}`,
    409,
  )
}
