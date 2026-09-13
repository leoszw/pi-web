export type P9EvalDomain = 'REPORT' | 'SANDBOX'
export type P9EvalVariant = 'p9-broken-v0' | 'p9-guarded-v1'

export type ReportEvalScenario =
  | 'HIDDEN_FIELD'
  | 'EVIDENCE_COVERAGE'
  | 'ACTIVE_CONTENT'
  | 'EXTERNAL_LINK'
  | 'XLSX_MACRO'
  | 'PDF_ACTION'
  | 'SVG_SCRIPT'
  | 'PATH_TRAVERSAL'
  | 'SIZE'
  | 'TIMEOUT'

export type SandboxEvalScenario =
  | 'WRITE_SQL'
  | 'SELECT_STAR'
  | 'LOAD_FILE'
  | 'SYSTEM_SCHEMA'
  | 'PYTHON_CAPABILITY'
  | 'DYNAMIC_QUERY_ID'
  | 'ATTESTATION'
  | 'PAYLOAD_BUDGET'

export interface P9EvalCaseBase {
  schemaVersion: 'eval-case-v1'
  caseId: string
  datasetId: string
  datasetVersion: string
  domain: P9EvalDomain
  title: string
  tags: readonly string[]
  critical: boolean
}

export interface ReportEvalCase extends P9EvalCaseBase {
  domain: 'REPORT'
  scenario: ReportEvalScenario
  fixture: string
  expected: string
}

export interface SandboxEvalCase extends P9EvalCaseBase {
  domain: 'SANDBOX'
  scenario: SandboxEvalScenario
  goal: string
  expected: string
}

export type P9EvalCase = ReportEvalCase | SandboxEvalCase

export interface P9EvalMetrics {
  sampleCount: number
  passedCount: number
  passRate: number
  releaseGate: 'PASS' | 'FAIL'
  releaseGateReasons: readonly string[]
  hiddenFieldBlockedRate?: number
  evidenceCoverageRate?: number
  activeContentBlockedRate?: number
  externalLinkBlockedRate?: number
  xlsxMacroBlockedRate?: number
  pdfActionBlockedRate?: number
  svgScriptBlockedRate?: number
  pathTraversalBlockedRate?: number
  sizeLimitEnforcedRate?: number
  timeoutEnforcedRate?: number
  writeSqlRejectRate?: number
  selectStarRejectRate?: number
  loadFileRejectRate?: number
  systemSchemaRejectRate?: number
  pythonCapabilityBlockedRate?: number
  dynamicQueryIdSafetyRate?: number
  attestationVerifiedRate?: number
  payloadBudgetEnforcedRate?: number
}

export interface P9EvalObservation {
  schemaVersion: 'eval-observation-v1'
  observationId: string
  runId: string
  caseId: string
  domain: P9EvalDomain
  title: string
  passed: boolean
  expectedSummary: string
  actualSummary: string
  reasons: readonly string[]
  traceId: string
  details: Readonly<Record<string, unknown>>
}

export interface P9EvalRunSummary {
  runId: string
  domain: P9EvalDomain
  datasetId: string
  datasetVersion: string
  projectId: string
  variantId: P9EvalVariant
  status: 'COMPLETED'
  startedAt: string
  completedAt: string
  metrics: P9EvalMetrics
}

export interface P9EvalFailureSummary {
  caseId: string
  domain: P9EvalDomain
  title: string
  reasons: readonly string[]
  traceId: string
}

export interface StartP9EvalRunRequest {
  datasetId: string
  variantId: P9EvalVariant
}
