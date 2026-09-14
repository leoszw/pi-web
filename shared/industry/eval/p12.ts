export type OnlineQualityMetricId =
  | 'INTENT_DRIFT_RATE'
  | 'CLARIFICATION_RATE'
  | 'ZERO_RETRIEVAL_RATE'
  | 'LOW_CONFIDENCE_RATE'
  | 'TOOL_ERROR_RATE'
  | 'MUTATION_REJECT_RATE'
  | 'RAG_INSUFFICIENT_EVIDENCE_RATE'
  | 'P95_LATENCY_MS'
  | 'AVG_TOKENS'
  | 'AVG_COST_USD'
  | 'USER_CORRECTION_RATE'

export type OnlineQualityStatus = 'PASS' | 'WARN' | 'FAIL'
export type OnlineSignalSeverity = 'INFO' | 'WARN' | 'CRITICAL'
export type OnlineFeedbackDomain = 'INTENT' | 'RETRIEVAL' | 'RAG' | 'TOOL' | 'MUTATION' | 'MEMORY'
export type OnlineFeedbackStage = 'SANITIZED' | 'DRAFT' | 'LABELED' | 'REVIEWED' | 'VERSIONED'
export type EvalCaseDifficulty = 'NORMAL' | 'HARD' | 'ADVERSARIAL'
export type QualityDataSource = 'MOCK_FIXTURE' | 'ONLINE_AGGREGATE'

export interface OnlineQualityMetric {
  metricId: OnlineQualityMetricId
  label: string
  value: number
  previousValue: number
  delta: number
  unit: 'RATE' | 'MS' | 'TOKENS' | 'USD'
  warningThreshold: number
  failureThreshold: number
  status: OnlineQualityStatus
}

export interface OnlineQualitySignal {
  signalId: string
  type: OnlineQualityMetricId
  title: string
  severity: OnlineSignalSeverity
  detail: string
  observedValue: number
  threshold: number
  traceIds: readonly string[]
}

export interface OnlineQualitySnapshot {
  source: QualityDataSource
  projectId: string
  windowStart: string
  windowEnd: string
  sampleCount: number
  metrics: readonly OnlineQualityMetric[]
  signals: readonly OnlineQualitySignal[]
}

export interface CreateOnlineFeedbackFromTraceRequest {
  traceId: string
  targetDomain: OnlineFeedbackDomain
}

export interface LabelOnlineFeedbackRequest {
  label: string
  tags: readonly string[]
  difficulty: EvalCaseDifficulty
  notes?: string
}

export interface ReviewOnlineFeedbackRequest {
  approved: true
  reviewNote?: string
}

export interface OnlineFeedbackItem {
  feedbackId: string
  projectId: string
  traceId: string
  source: 'ONLINE_TRACE'
  targetDomain: OnlineFeedbackDomain
  stage: OnlineFeedbackStage
  sanitizedInput: string
  sanitization: {
    removedSecretPatterns: number
    removedPromptContent: boolean
    sourceScopeTrusted: true
  }
  humanLabel?: {
    label: string
    tags: readonly string[]
    difficulty: EvalCaseDifficulty
    notes?: string
    labeledBy: string
    labeledAt: string
  }
  review?: {
    approved: true
    reviewNote?: string
    reviewedBy: string
    reviewedAt: string
  }
  datasetVersion?: {
    datasetId: string
    version: string
    status: 'REVIEWED'
    golden: false
    createdAt: string
  }
  createdAt: string
  updatedAt: string
}

export interface OnlineDatasetVersion {
  datasetId: string
  projectId: string
  version: string
  status: 'REVIEWED'
  golden: false
  sourceFeedbackIds: readonly string[]
  caseCount: number
  fingerprint: string
  createdAt: string
  createdBy: string
}

export interface DatasetHealthTagCount {
  tag: string
  count: number
}

export interface DatasetHealthIssue {
  issueId: string
  type: 'DUPLICATE' | 'NEAR_DUPLICATE' | 'HOLDOUT_LEAKAGE' | 'LABEL_CHURN' | 'STALE_REVIEW'
  severity: 'WARN' | 'FAIL'
  count: number
  detail: string
}

export interface DatasetHealthSummary {
  source: QualityDataSource
  projectId: string
  datasetId: string
  sourceCaseCount: number
  draftCount: number
  labeledCount: number
  reviewedCount: number
  versionedCount: number
  reviewedPercent: number
  hardAdversarialCount: number
  hardAdversarialPercent: number
  tagDistribution: readonly DatasetHealthTagCount[]
  duplicateCount: number
  nearDuplicateCount: number
  holdoutLeakageCount: number
  labelChurnRate: number
  lastReviewAgeDays: number
  issues: readonly DatasetHealthIssue[]
  computedAt: string
}
