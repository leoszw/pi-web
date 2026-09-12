export type EvalEventType =
  | 'eval_run_started'
  | 'eval_case_started'
  | 'eval_case_completed'
  | 'eval_case_failed'
  | 'eval_metric_updated'
  | 'eval_run_completed'
  | 'eval_run_failed'

export interface EvalEventEnvelope<T = unknown> {
  schemaVersion: 'eval-event-v1'
  eventId: string
  sequenceNo: number
  runId: string
  type: EvalEventType
  timestamp: string
  payload: T
}
