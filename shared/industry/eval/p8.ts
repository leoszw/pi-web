import type { AgentLoopTerminationReason } from '../agent-loop'
import type { BoundingBox } from '../multimodal'

export type P8EvalDomain = 'MULTIMODAL' | 'AGENT_LOOP'
export type P8EvalVariant = 'p8-broken-v0' | 'p8-guarded-v1'

interface BaseP8Case {
  schemaVersion: 'eval-case-v1'
  caseId: string
  datasetId: string
  datasetVersion: string
  domain: P8EvalDomain
  title: string
  tags: readonly string[]
  critical: boolean
}

export interface MultimodalEvalCase extends BaseP8Case {
  domain: 'MULTIMODAL'
  imageFixtureId: string
  expectedObservations: readonly {
    label: string
    bbox?: BoundingBox
    fields: Readonly<Record<string, string>>
    entityId?: string
  }[]
  expectedNoEvidence: boolean
  containsPromptInjection: boolean
}

export type AgentLoopEvalScenario =
  | 'SUCCESS'
  | 'REPLAN'
  | 'MAX_STEP'
  | 'MAX_TOOL'
  | 'TOKEN_COST'
  | 'TIMEOUT'
  | 'USAGE_INCOMPLETE'
  | 'SCOPE_INJECTION'
  | 'CRITICAL_TOOL'

export interface AgentLoopEvalCase extends BaseP8Case {
  domain: 'AGENT_LOOP'
  scenario: AgentLoopEvalScenario
  goal: string
  expectedTermination: AgentLoopTerminationReason
}

export type P8EvalCase = MultimodalEvalCase | AgentLoopEvalCase

export interface P8EvalObservation {
  schemaVersion: 'eval-observation-v1'
  observationId: string
  runId: string
  caseId: string
  domain: P8EvalDomain
  title: string
  passed: boolean
  expectedSummary: string
  actualSummary: string
  reasons: readonly string[]
  traceId: string
  details: Readonly<Record<string, unknown>>
}

export interface P8EvalMetrics {
  sampleCount: number
  passedCount: number
  passRate: number
  releaseGate: 'PASS' | 'FAIL'
  releaseGateReasons: readonly string[]
  observationPrecision?: number
  observationRecall?: number
  fieldExtractionAccuracy?: number
  entityMatchRate?: number
  noEvidenceRejectRate?: number
  promptInjectionBlockedRate?: number
  wrongTargetRate?: number
  agentLoopSuccessRate?: number
  replanSuccessRate?: number
  maxStepEnforcementRate?: number
  maxToolEnforcementRate?: number
  tokenBudgetEnforcementRate?: number
  costBudgetEnforcementRate?: number
  timeoutEnforcementRate?: number
  usageCompletenessRate?: number
  scopeInjectionBlockedRate?: number
  criticalToolSafetyRate?: number
}

export interface P8EvalRunSummary {
  runId: string
  domain: P8EvalDomain
  datasetId: string
  datasetVersion: string
  projectId: string
  variantId: P8EvalVariant
  status: 'COMPLETED'
  startedAt: string
  completedAt: string
  metrics: P8EvalMetrics
}

export interface P8EvalFailureSummary {
  caseId: string
  domain: P8EvalDomain
  title: string
  reasons: readonly string[]
  traceId: string
}

export interface StartP8EvalRunRequest {
  datasetId: string
  variantId: P8EvalVariant
}
