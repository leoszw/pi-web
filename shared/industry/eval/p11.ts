export type UnifiedBenchmarkDomain =
  | 'INTENT' | 'RETRIEVAL' | 'MUTATION' | 'TRACE' | 'RAG'
  | 'NORMALIZATION' | 'ENTITY' | 'TOOL' | 'MEMORY'
  | 'MULTIMODAL' | 'AGENT_LOOP' | 'REPORT' | 'SANDBOX'

export interface UnifiedCorpusDomainCount { domain: UnifiedBenchmarkDomain; caseCount: number }
export interface UnifiedCorpusManifest {
  corpusId: string
  version: string
  status: 'REVIEWED'
  totalCaseCount: 1030
  goldenCount: number
  hardCount: number
  criticalCaseCount: number
  fullCoverageRequired: true
  fingerprint: string
  domainCounts: readonly UnifiedCorpusDomainCount[]
  source: 'PHASE_11_MOCK_MANIFEST'
  reviewedAt: string
}

export interface UnifiedBenchmarkMetric {
  metricId: string
  label: string
  value: number
  regressionThreshold: number
  higherIsBetter: boolean
  critical: boolean
}

export interface UnifiedReleaseGate {
  status: 'PASS' | 'FAIL'
  source: 'PI'
  ruleVersion: string
  reasons: readonly string[]
  evaluatedAt: string
}

export interface UnifiedReproducibility {
  complete: boolean
  gitCommit: string
  corpusFingerprint: string
  configFingerprint: string
  runtimeConfigVersion: number
  componentVersions: Readonly<Record<string, string>>
  missing: readonly string[]
}

export interface UnifiedCriticalE2E {
  passed: boolean
  total: number
  passedCount: number
  failedCaseIds: readonly string[]
}

export interface UnifiedBenchmarkRun {
  runId: string
  projectId: string
  corpusId: string
  corpusVersion: string
  corpusFingerprint: string
  variantId: string
  status: 'COMPLETED'
  coveredCaseCount: number
  coverageRate: number
  datasetReviewed: boolean
  criticalE2E: UnifiedCriticalE2E
  metrics: readonly UnifiedBenchmarkMetric[]
  releaseGate: UnifiedReleaseGate
  reproducibility: UnifiedReproducibility
  startedAt: string
  completedAt: string
}

export interface StartUnifiedBenchmarkRunRequest { corpusId: string; variantId: 'p11-guarded-v1' | 'p11-broken-v0' }

export interface BaselineAcceptance {
  acceptanceId: string
  projectId: string
  runId: string
  acceptedAt: string
  acceptedBy: string
  explicit: true
}

export interface UnifiedMetricDelta {
  metricId: string
  label: string
  baseline: number
  candidate: number
  delta: number
  regressionThreshold: number
  regressed: boolean
}

export interface UnifiedCaseMovement {
  caseId: string
  domain: UnifiedBenchmarkDomain
  title: string
  movement: 'IMPROVED' | 'REGRESSED' | 'UNCHANGED'
  baselineScore: number
  candidateScore: number
}

export interface UnifiedVersionDiff { component: string; before: string; after: string; changed: boolean }
export interface UnifiedRankMovement { caseId: string; entityId: string; beforeRank: number; afterRank: number; delta: number }
export interface UnifiedStatisticalCI {
  method: 'PAIRED_BOOTSTRAP'
  confidence: 0.95
  sampleCount: 1030
  deltaMean: number
  lower: number
  upper: number
  conclusive: boolean
}

export interface UnifiedRunComparison {
  baselineRunId: string
  candidateRunId: string
  metricDeltas: readonly UnifiedMetricDelta[]
  caseMovements: readonly UnifiedCaseMovement[]
  versionDiff: readonly UnifiedVersionDiff[]
  rankMovements: readonly UnifiedRankMovement[]
  statisticalCI: UnifiedStatisticalCI
}

export interface ReleaseWaiver {
  waiverId: string
  projectId: string
  runId: string
  reason: string
  status: 'ACTIVE' | 'EXPIRED'
  originalGate: 'FAIL'
  releaseDisposition: 'WAIVED'
  createdBy: string
  createdAt: string
  expiresAt: string
}

export interface CreateReleaseWaiverRequest { reason: string; expiresAt: string }

export interface UnifiedReleaseDecision {
  runId: string
  gate: UnifiedReleaseGate
  waiver?: ReleaseWaiver
  releaseDisposition: 'ELIGIBLE' | 'BLOCKED' | 'WAIVED'
  baselineEligible: boolean
  baselineBlockReasons: readonly string[]
}
