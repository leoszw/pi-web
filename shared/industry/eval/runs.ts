import type { ComponentVersionSnapshot, EvalEnvironment, EvalRunStatus } from './common'
import type { IntentName, IntentTurn } from './datasets'
import type { IntentMetricsSummary } from './metrics'

export interface IntentCandidate {
  intent: IntentName
  confidence: number
}

export interface IntentSemanticFramePreview {
  normalizedQuery: string
  projectId: string | null
  contextDependent: boolean
  tokens: readonly string[]
}

export interface IntentPlaygroundRequest {
  query: string
  previousTurns: readonly IntentTurn[]
  variantId: string
}

export interface IntentPlaygroundResult {
  primaryIntent: IntentName
  candidates: readonly IntentCandidate[]
  confidence: number
  semanticFrame: IntentSemanticFramePreview
  variantId: string
  components: ComponentVersionSnapshot
  traceId: string
}

export interface StartIntentRunRequest {
  datasetId: string
  variantId: string
}

export interface EvalRunSummary {
  runId: string
  runType: 'INTENT'
  datasetId: string
  datasetVersion: string
  datasetFingerprint: string
  status: EvalRunStatus
  environment: EvalEnvironment
  variantId: string
  components: ComponentVersionSnapshot
  startedAt: string
  completedAt?: string
  metrics?: IntentMetricsSummary
}

export interface IntentEvalObservation {
  schemaVersion: 'eval-observation-v1'
  observationId: string
  runId: string
  caseId: string
  query: string
  expectedIntent: IntentName
  actualIntent: IntentName
  confidence: number
  candidates: readonly IntentCandidate[]
  passed: boolean
  critical: boolean
  difficulty: 'NORMAL' | 'HARD' | 'ADVERSARIAL'
  tags: readonly string[]
  traceId: string
}

export interface MetricDelta {
  metric: string
  baseline: number
  candidate: number
  delta: number
}

export interface IntentRunComparison {
  baselineRunId: string
  candidateRunId: string
  metricDeltas: readonly MetricDelta[]
  improvedCaseIds: readonly string[]
  regressedCaseIds: readonly string[]
  unchangedCaseCount: number
}
