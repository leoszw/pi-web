import type { UiActionEnvelope, UiActionType } from '../../../shared/industry/ui-actions'

const LONG_ID = '123456789012345678'

export function buildMockUiActions(text: string, traceId: string): readonly UiActionEnvelope[] {
  const all = /uiaction|交互组件|全部组件|all actions/iu.test(text)
  const actions: readonly UiActionType[] = all ? ALL_TYPES : []
  return actions.map((type, index) => actionFor(type, traceId, index))
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
      return { ...base, payload: {
        title: '工程量清单结果',
        columns: [
          { key: 'id', label: '清单 ID', sortable: true, filterable: false },
          { key: 'code', label: '编码', sortable: true, filterable: true },
          { key: 'name', label: '名称', sortable: false, filterable: true },
          { key: 'quantity', label: '工程量', sortable: true, filterable: false },
        ],
        rows: [{
          rowId: LONG_ID,
          cells: { id: LONG_ID, code: '104-1-a', name: 'C30 混凝土基础 <script>alert(1)</script>', quantity: 128.5 },
        }],
        pagination: { pageSize: 20, stableCursor: 'cursor:p1:v1', nextCursor: 'cursor:p2:v1' },
        sortAllowlist: ['id', 'code', 'quantity'],
        filterAllowlist: ['code', 'name'],
        selectedRowIds: [LONG_ID],
        exportSnapshotRef: 'snapshot://boq/mock-001',
      } }
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
