export type UiActionType =
  | 'entity_picker'
  | 'form'
  | 'editable_form'
  | 'diff'
  | 'mutation_confirmation'
  | 'table'
  | 'multi_select'
  | 'date_picker'
  | 'report_preview'
  | 'error_resolution'

export type UiActionPrimitive = string | number | boolean | null

export interface UiActionEnvelope<TPayload = UiActionPayload> {
  schemaVersion: 'ui-action-v1'
  actionId: string
  type: UiActionType
  traceId: string
  payload: TPayload
}

export interface UiActionOption {
  id: string
  label: string
  description?: string
}

export interface EntityPickerPayload {
  title: string
  entityType: string
  options: readonly UiActionOption[]
  selectedEntityIds: readonly string[]
  multi: boolean
}

export interface UiActionField {
  key: string
  label: string
  value: UiActionPrimitive
  required?: boolean
  readOnly?: boolean
}

export interface FormPayload {
  title: string
  fields: readonly UiActionField[]
  submitLabel: string
}

export interface EditableFormPayload extends FormPayload {
  version: string
}

export interface DiffEntry {
  field: string
  label: string
  before: UiActionPrimitive
  after: UiActionPrimitive
}

export interface DiffPayload {
  title: string
  entries: readonly DiffEntry[]
}

export interface MutationConfirmationPayload {
  title: string
  operationId: string
  digest: string
  summary: string
  warning: string
}

export interface UiActionTableColumn {
  key: string
  label: string
  sortable: boolean
  filterable: boolean
}

export interface UiActionTableRow {
  rowId: string
  cells: Readonly<Record<string, UiActionPrimitive>>
}

export interface UiActionTablePayload {
  title: string
  columns: readonly UiActionTableColumn[]
  rows: readonly UiActionTableRow[]
  pagination: {
    pageSize: number
    stableCursor: string
    nextCursor?: string
    previousCursor?: string
    totalRows: number
  }
  sortAllowlist: readonly string[]
  filterAllowlist: readonly string[]
  selectedRowIds: readonly string[]
  exportSnapshotRef: string
}

export interface MultiSelectPayload {
  title: string
  options: readonly UiActionOption[]
  selectedIds: readonly string[]
}

export interface DatePickerPayload {
  title: string
  value: string | null
  min?: string
  max?: string
}

export interface ReportPreviewPayload {
  title: string
  format: 'PDF' | 'XLSX' | 'DOCX'
  snapshotRef: string
  summary: string
}

export interface ErrorResolutionPayload {
  title: string
  code: string
  message: string
  resolution: 'refresh' | 'reauth' | 'reselect_project' | 'open_reconciliation' | 'contact_admin'
}

export type UiActionPayload =
  | EntityPickerPayload
  | FormPayload
  | EditableFormPayload
  | DiffPayload
  | MutationConfirmationPayload
  | UiActionTablePayload
  | MultiSelectPayload
  | DatePickerPayload
  | ReportPreviewPayload
  | ErrorResolutionPayload

export interface UiActionPresentedEventPayload {
  action: UiActionEnvelope
}

export type UiActionSortDirection = 'asc' | 'desc'

export interface UiActionTableSort {
  key: string
  direction: UiActionSortDirection
}

export interface UiActionTableFilter {
  key: string
  value: string
}

export type UiActionInteraction =
  | {
    kind: 'entity_selection'
    selectedEntityIds: readonly string[]
  }
  | {
    kind: 'form_submit'
    values: Readonly<Record<string, UiActionPrimitive>>
  }
  | {
    kind: 'table_query'
    pageSize: number
    cursor?: string
    sort?: UiActionTableSort
    filters?: readonly UiActionTableFilter[]
  }
  | {
    kind: 'table_selection'
    selectedRowIds: readonly string[]
  }
  | {
    kind: 'multi_select'
    selectedIds: readonly string[]
  }
  | {
    kind: 'date_select'
    value: string | null
  }

export interface UiActionInteractionRequest {
  interaction: UiActionInteraction
}

export interface UiActionInteractionResult {
  conversationId: string
  interactionId: string
  action: UiActionEnvelope
  traceId: string
  acceptedAt: string
}

export interface UiActionInteractionAcceptedEventPayload {
  interactionId: string
  actionId: string
  kind: UiActionInteraction['kind']
}
