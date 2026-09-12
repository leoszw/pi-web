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

export interface UiActionEnvelope<TPayload = unknown> {
  schemaVersion: 'ui-action-v1'
  actionId: string
  type: UiActionType
  traceId: string
  payload: TPayload
}
