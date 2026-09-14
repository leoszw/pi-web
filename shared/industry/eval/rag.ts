export type RagEvalVariant = 'rag-broken-v0' | 'rag-guarded-v1'
export type RagEvalSplit = 'REGRESSION' | 'RELEASE_HOLDOUT'

export interface RagExpectedEvidence {
  documentId: string
  chunkId: string
  page: number
  section: string
  sourceVersion: string
}

export interface RagEvalCase {
  schemaVersion: 'eval-case-v1'
  caseId: string
  datasetId: string
  datasetVersion: string
  split: RagEvalSplit
  question: string
  expectedEvidence: readonly RagExpectedEvidence[]
  expectedInsufficientEvidence: boolean
  tags: readonly string[]
  critical: boolean
}

export interface RagRetrievedChunk {
  documentId: string
  chunkId: string
  rank: number
  score: number
  text: string
  parentContext: string
  page: number
  section: string
  sourceVersion: string
  projectId: string
  duplicateOfChunkId?: string
  aclAllowed: boolean
}

export interface RagAnswerClaim {
  claimId: string
  text: string
  citationChunkIds: readonly string[]
  supported: boolean
}

export interface RagEvalObservation {
  schemaVersion: 'eval-observation-v1'
  observationId: string
  runId: string
  caseId: string
  question: string
  expectedEvidence: readonly RagExpectedEvidence[]
  retrievedChunks: readonly RagRetrievedChunk[]
  answer: string
  claims: readonly RagAnswerClaim[]
  recallAt1: number
  recallAt3: number
  recallAt5: number
  reciprocalRank: number
  ndcgAt5: number
  documentHit: boolean
  chunkHit: boolean
  duplicateRate: number
  aclLeakage: boolean
  groundedness: number
  citationCorrectness: number
  citationCompleteness: number
  answerRelevance: number
  unsupportedClaimRate: number
  insufficientEvidenceCorrect: boolean
  passed: boolean
  failureReasons: readonly string[]
  traceId: string
}

export interface RagEvalMetricsSummary {
  sampleCount: number
  passedCount: number
  passRate: number
  recallAt1: number
  recallAt3: number
  recallAt5: number
  mrr: number
  ndcgAt5: number
  documentHitRate: number
  chunkHitRate: number
  duplicateRate: number
  aclLeakageRate: number
  groundedness: number
  citationCorrectness: number
  citationCompleteness: number
  answerRelevance: number
  unsupportedClaimRate: number
  insufficientEvidenceCorrectness: number
  releaseGate: 'PASS' | 'FAIL'
  releaseGateReasons: readonly string[]
}

export interface RagEvalRunSummary {
  runId: string
  runType: 'RAG'
  datasetId: string
  datasetVersion: string
  status: 'COMPLETED'
  environment: 'LOCAL'
  variantId: RagEvalVariant
  projectId: string
  startedAt: string
  completedAt: string
  metrics: RagEvalMetricsSummary
}

export interface RagEvalFailureSummary {
  caseId: string
  question: string
  reasons: readonly string[]
  aclLeakage: boolean
  unsupportedClaimRate: number
  traceId: string
}

export interface StartRagEvalRunRequest {
  datasetId: string
  variantId: RagEvalVariant
}
