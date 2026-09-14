export type TraceEvalScenario =
  | 'TRACE_COMPLETENESS'
  | 'SEQUENCE_MONOTONIC'
  | 'TOKEN_ACCOUNTING'
  | 'TOOL_AUDIT_COMPLETENESS'
  | 'REDACTION_LEAK'
  | 'QUERY_LATENCY'

export type TraceEvalVariant = 'trace-broken-v0' | 'trace-guarded-v1'
export type TraceEvalDatasetSplit = 'REGRESSION' | 'RELEASE_HOLDOUT'

export interface TraceEvalCase {
  schemaVersion: 'eval-case-v1'
  caseId: string
  datasetId: string
  datasetVersion: string
  split: TraceEvalDatasetSplit
  scenario: TraceEvalScenario
  title: string
  description: string
  expected: {
    mustPass: true
    maxLatencyMs?: number
  }
  critical: boolean
  tags: readonly string[]
}

export interface TraceEvalObservationStep {
  step: string
  outcome: 'PASS' | 'FAIL'
  detail: string
}

export interface TraceEvalObservation {
  schemaVersion: 'eval-observation-v1'
  observationId: string
  runId: string
  caseId: string
  scenario: TraceEvalScenario
  passed: boolean
  traceId: string
  completeness?: number
  sequenceMonotonic?: boolean
  tokenAccountingConsistent?: boolean
  toolAuditComplete?: boolean
  redactionLeakDetected?: boolean
  queryLatencyMs?: number
  maxLatencyMs?: number
  reasons: readonly string[]
  steps: readonly TraceEvalObservationStep[]
}

export interface TraceEvalMetricsSummary {
  sampleCount: number
  passedCount: number
  passRate: number
  traceCompletenessRate: number
  sequenceMonotonicRate: number
  tokenAccountingConsistencyRate: number
  toolAuditCompletenessRate: number
  redactionLeakRate: number
  queryLatencyP95Ms: number
  queryLatencyBudgetPassRate: number
  releaseGate: 'PASS' | 'FAIL'
  releaseGateReasons: readonly string[]
}

export interface StartTraceEvalRunRequest {
  datasetId: string
  variantId: TraceEvalVariant
}

export interface TraceEvalRunSummary {
  runId: string
  runType: 'TRACE'
  datasetId: string
  datasetVersion: string
  status: 'COMPLETED'
  environment: 'LOCAL'
  variantId: TraceEvalVariant
  projectId: string
  startedAt: string
  completedAt: string
  metrics: TraceEvalMetricsSummary
}

export interface TraceEvalFailureSummary {
  caseId: string
  scenario: TraceEvalScenario
  reasons: readonly string[]
  traceId: string
}
