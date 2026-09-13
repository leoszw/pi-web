export const RETRIEVAL_STAGE_ORDER = [
  'SEMANTIC_PARSE',
  'HARD_FILTERS',
  'EXACT',
  'BM25',
  'DENSE',
  'ENTITY_AWARE',
  'RRF',
  'RERANKER',
  'BUSINESS_FEATURE',
  'FINAL',
] as const

export type RetrievalStage = typeof RETRIEVAL_STAGE_ORDER[number]
export type RetrievalDomain = 'ENGINEERING' | 'BOQ'
export type RetrievalDatasetSplit = 'DEV' | 'REGRESSION' | 'RELEASE_HOLDOUT'

export interface RetrievalQueryContext {
  projectId: string
  query: string
  normalizedQuery: string
  domain: RetrievalDomain
  chainageStart?: number
  chainageEnd?: number
  alignment?: string
  unit?: string
  category?: string
  engineeringType?: string
  hierarchy?: readonly string[]
  boqCode?: string
  specification?: string
  concreteGrade?: string
  diameterMm?: number
  thicknessMm?: number
  percentage?: number
}

export interface RetrievalCandidate {
  entityId: string
  name: string
  rank: number
  sourceArm: readonly string[]
  exactScore?: number
  bm25Score?: number
  denseScore?: number
  entityAwareScore?: number
  rrfScore?: number
  rerankScore?: number
  businessScore?: number
  finalScore?: number
  reason: readonly string[]
  projectId: string
  alignment?: string
  hardNegative?: boolean
  criticalSpecConflict?: boolean
}

export interface RetrievalStageSnapshot {
  stage: RetrievalStage
  candidates: readonly RetrievalCandidate[]
  removedEntityIds?: readonly string[]
  notes?: readonly string[]
}

export interface RetrievalCaseExpected {
  relevantEntityIds: readonly string[]
  hardNegativeEntityIds: readonly string[]
  expectedProjectId: string
  expectedAlignment?: string
}

export interface RetrievalEvalCase {
  schemaVersion: 'eval-case-v1'
  caseId: string
  datasetId: string
  datasetVersion: string
  split: RetrievalDatasetSplit
  domain: RetrievalDomain
  queryContext: RetrievalQueryContext
  expected: RetrievalCaseExpected
  tags: readonly string[]
  critical: boolean
}

export interface RetrievalPlaygroundRequest {
  query: string
  domain: RetrievalDomain
  variantId: string
}

export interface RetrievalPlaygroundResult {
  caseId?: string
  variantId: string
  queryContext: RetrievalQueryContext
  stages: readonly RetrievalStageSnapshot[]
  traceId: string
}

export interface RecallAtK {
  k: 1 | 5 | 10 | 20 | 50
  value: number
}

export interface RetrievalMetricsSummary {
  recallAtK: readonly RecallAtK[]
  hitAt1: number
  mrr: number
  map: number
  ndcgAt10: number
  zeroResultRate: number
  crossProjectLeakageRate: number
  crossAlignmentConflictRate: number
  criticalSpecConflictRate: number
  wrongEntityHighConfidenceRate: number
}

export interface RetrievalRankMovement {
  caseId: string
  entityId: string
  baselineRank?: number
  candidateRank?: number
  rankDelta?: number
  baselineScore?: number
  candidateScore?: number
  scoreDelta?: number
}

export interface PairedComparisonStats {
  wins: number
  losses: number
  ties: number
  sampleSize: number
  bootstrap95Ci?: readonly [number, number]
  minimumSampleWarning: boolean
  conclusion: 'IMPROVED' | 'REGRESSED' | 'NO_MATERIAL_CHANGE' | 'INCONCLUSIVE'
}

export interface RetrievalRunComparison {
  baselineRunId: string
  candidateRunId: string
  comparisonType: 'EMBEDDING' | 'RERANKER' | 'CONFIG'
  improvedCaseIds: readonly string[]
  regressedCaseIds: readonly string[]
  rankMovements: readonly RetrievalRankMovement[]
  pairedStats: PairedComparisonStats
}

export interface RetrievalLeakageFinding {
  findingId: string
  kind: 'EXACT_DUPLICATE' | 'NORMALIZED_DUPLICATE' | 'NEAR_DUPLICATE' | 'SAME_SOURCE_DUPLICATE'
  caseIds: readonly string[]
  splits: readonly RetrievalDatasetSplit[]
  severity: 'INFO' | 'WARNING' | 'ERROR'
  reason: string
}

export interface RetrievalLeakageReport {
  datasetId: string
  checkedAt: string
  findings: readonly RetrievalLeakageFinding[]
  releaseHoldoutContaminated: boolean
}
