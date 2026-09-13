export type MutationEvalScenario =
  | 'WRONG_TARGET'
  | 'SCOPE_LEAKAGE'
  | 'CONFIRMATION_BYPASS'
  | 'DIGEST_MISMATCH'
  | 'APPROVAL_REPLAY'
  | 'VERSION_CONFLICT'
  | 'FINALIZATION_RECONCILIATION'

export type MutationEvalDatasetSplit = 'DEV' | 'REGRESSION' | 'RELEASE_HOLDOUT'
export type MutationEvalVariant = 'mutation-unsafe-v0' | 'mutation-guarded-v1'

export interface MutationEvalExpected {
  outcome: 'BLOCK' | 'COMMIT_ONCE' | 'RECONCILIATION_REQUIRED'
  code?: string
  commitAttempts: number
  scopeLeakage: boolean
  confirmationBypassed: boolean
  automaticRetryAttempted: boolean
}

export interface MutationEvalCase {
  schemaVersion: 'eval-case-v1'
  caseId: string
  datasetId: string
  datasetVersion: string
  split: MutationEvalDatasetSplit
  scenario: MutationEvalScenario
  title: string
  description: string
  expected: MutationEvalExpected
  tags: readonly string[]
  critical: boolean
}

export interface MutationEvalStep {
  step: string
  outcome: 'PASS' | 'BLOCKED' | 'FAILED' | 'COMMITTED' | 'RECONCILIATION'
  detail: string
}

export interface MutationEvalObservation {
  schemaVersion: 'eval-observation-v1'
  observationId: string
  runId: string
  caseId: string
  scenario: MutationEvalScenario
  passed: boolean
  expectedOutcome: MutationEvalExpected['outcome']
  actualOutcome: MutationEvalExpected['outcome']
  expectedCode?: string
  actualCode?: string
  commitAttempts: number
  scopeLeakage: boolean
  confirmationBypassed: boolean
  automaticRetryAttempted: boolean
  reconciliationRequired: boolean
  approvalMaterialExposed: boolean
  steps: readonly MutationEvalStep[]
  traceId: string
}

export interface MutationEvalMetricsSummary {
  sampleCount: number
  passedCount: number
  passRate: number
  criticalPassRate: number
  wrongTargetFailureRate: number
  scopeLeakageRate: number
  confirmationBypassRate: number
  digestMismatchGuardRate: number
  approvalReplayGuardRate: number
  versionConflictGuardRate: number
  reconciliationSafetyRate: number
  unsafeCommitRetryRate: number
  approvalMaterialExposureRate: number
  releaseGate: 'PASS' | 'FAIL'
  releaseGateReasons: readonly string[]
}

export interface StartMutationEvalRunRequest {
  datasetId: string
  variantId: MutationEvalVariant
}

export interface MutationEvalRunSummary {
  runId: string
  runType: 'MUTATION'
  datasetId: string
  datasetVersion: string
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  environment: 'LOCAL' | 'DEV' | 'STAGING' | 'PRODUCTION'
  variantId: MutationEvalVariant
  projectId: string
  startedAt: string
  completedAt?: string
  metrics?: MutationEvalMetricsSummary
}

export interface MutationEvalFailureSummary {
  caseId: string
  scenario: MutationEvalScenario
  expectedOutcome: MutationEvalExpected['outcome']
  actualOutcome: MutationEvalExpected['outcome']
  expectedCode?: string
  actualCode?: string
  reasons: readonly string[]
  traceId: string
}
