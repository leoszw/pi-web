export type P7EvalDomain = 'NORMALIZATION' | 'ENTITY' | 'TOOL' | 'MEMORY'
export type P7EvalVariant = 'p7-broken-v0' | 'p7-guarded-v1'

export type NormalizationCategory =
  | 'CHAINAGE'
  | 'RANGE'
  | 'ALIGNMENT'
  | 'SIDE'
  | 'UNIT'
  | 'BOQ_CODE'
  | 'DATE'
  | 'SPECIFICATION'
  | 'ABBREVIATION'

export type EntityFailureStage = 'MENTION' | 'CANDIDATE_GENERATION' | 'RANKING' | 'SCOPE' | 'AMBIGUITY'

export interface P7EvalCaseBase {
  schemaVersion: 'eval-case-v1'
  caseId: string
  datasetId: string
  datasetVersion: string
  domain: P7EvalDomain
  title: string
  tags: readonly string[]
  critical: boolean
}

export interface NormalizationEvalCase extends P7EvalCaseBase {
  domain: 'NORMALIZATION'
  category: NormalizationCategory
  input: string
  expectedNormalized: string
}

export interface EntityEvalCase extends P7EvalCaseBase {
  domain: 'ENTITY'
  mention: string
  expectedEntityId: string
  expectedScope: string
}

export interface ToolEvalCase extends P7EvalCaseBase {
  domain: 'TOOL'
  query: string
  expectedTools: readonly string[]
  expectedArguments: Readonly<Record<string, unknown>>
  requiredArguments: readonly string[]
  forbiddenArguments: readonly string[]
  expectedSequence: readonly string[]
}

export interface MemoryEvalCase extends P7EvalCaseBase {
  domain: 'MEMORY'
  utterance: string
  previousContext: readonly string[]
  expectedResolution: string
  expectedProjectId: string
  ttlValid: boolean
  sourcePolicy: 'CONVERSATION' | 'TOOL_RESULT' | 'PROJECT_CONTEXT'
}

export type P7EvalCase = NormalizationEvalCase | EntityEvalCase | ToolEvalCase | MemoryEvalCase

export interface P7EvalObservation {
  schemaVersion: 'eval-observation-v1'
  observationId: string
  runId: string
  caseId: string
  domain: P7EvalDomain
  title: string
  passed: boolean
  expectedSummary: string
  actualSummary: string
  failureStage?: EntityFailureStage | 'NORMALIZATION' | 'SELECTION' | 'ARGUMENTS' | 'SCOPE' | 'SEQUENCE' | 'RESOLUTION' | 'PROJECT_ISOLATION' | 'TTL' | 'SOURCE_POLICY'
  reasons: readonly string[]
  details: Readonly<Record<string, unknown>>
  traceId: string
}

export interface P7EvalMetrics {
  sampleCount: number
  passedCount: number
  passRate: number
  releaseGate: 'PASS' | 'FAIL'
  releaseGateReasons: readonly string[]
  normalizationAccuracy?: number
  entityResolutionAccuracy?: number
  entityFailureStageCounts?: Readonly<Record<EntityFailureStage, number>>
  toolSelectionAccuracy?: number
  toolArgumentExactRate?: number
  toolMissingRequiredRate?: number
  toolUnknownArgumentRate?: number
  toolScopeInjectionBlockedRate?: number
  toolUnnecessaryToolRate?: number
  toolSequenceAccuracy?: number
  memoryResolutionAccuracy?: number
  memoryProjectIsolationRate?: number
  memoryTtlPolicyRate?: number
  memorySourcePolicyRate?: number
}

export interface P7EvalRunSummary {
  runId: string
  domain: P7EvalDomain
  datasetId: string
  datasetVersion: string
  projectId: string
  variantId: P7EvalVariant
  status: 'COMPLETED'
  startedAt: string
  completedAt: string
  metrics: P7EvalMetrics
}

export interface StartP7EvalRunRequest {
  datasetId: string
  variantId: P7EvalVariant
}

export interface P7EvalFailureSummary {
  caseId: string
  domain: P7EvalDomain
  title: string
  failureStage?: P7EvalObservation['failureStage']
  reasons: readonly string[]
  traceId: string
}

export interface P7EvalDraft {
  draftId: string
  projectId: string
  sourceTraceId: string
  sourceTraceName: string
  targetDomain: P7EvalDomain
  status: 'DRAFT'
  reviewed: false
  query: string
  createdAt: string
}

export interface CreateP7DraftFromTraceRequest {
  traceId: string
  targetDomain: P7EvalDomain
}
