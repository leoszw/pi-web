export const RUNTIME_COMPONENTS = ['AGENT_MODEL','EMBEDDING','RERANKER','OPENSEARCH','PARSER','OBJECT_STORAGE','MULTIMODAL','RENDERER','SANDBOX','TRACE_AUDIT'] as const
export type RuntimeComponent = typeof RUNTIME_COMPONENTS[number]
export type RuntimeHealth = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'NOT_CONFIGURED'
export type SecretSource = 'env' | 'vault' | 'secret-manager' | 'none'

export interface RuntimeSecretRef {
  configured: boolean
  source: SecretSource
  reference?: string
  lastUpdatedAt?: string
}

export interface RuntimeAdapterStatus {
  component: RuntimeComponent
  label: string
  adapter: string
  endpointAlias: string
  configured: boolean
  health: RuntimeHealth
  version: string
  lastCheckAt: string
  secret: RuntimeSecretRef
}

export interface RuntimeInventory {
  environment: 'MOCK'
  configVersion: number
  adapters: readonly RuntimeAdapterStatus[]
  checkedAt: string
}

export interface RuntimeConfigChange {
  component: RuntimeComponent
  adapter?: string
  endpointAlias?: string
}

export interface CreateRuntimeConfigDraftRequest {
  changes: readonly RuntimeConfigChange[]
}

export type RuntimeConfigDraftStatus = 'DRAFT' | 'VALIDATED' | 'SAVED' | 'EVALUATED'
export interface RuntimeConfigValidationIssue {
  component?: RuntimeComponent
  code: string
  severity: 'ERROR' | 'WARNING'
  message: string
}
export interface RuntimeConfigDiffEntry {
  component: RuntimeComponent
  field: 'adapter' | 'endpointAlias'
  before: string
  after: string
}
export interface RuntimeConfigEvalResult {
  status: 'PASS' | 'FAIL'
  runId: string
  completedAt: string
  checks: readonly { name: string; passed: boolean; detail: string }[]
}
export interface RuntimeConfigDraft {
  draftId: string
  projectId: string
  baseVersion: number
  status: RuntimeConfigDraftStatus
  changes: readonly RuntimeConfigChange[]
  validationIssues: readonly RuntimeConfigValidationIssue[]
  diff: readonly RuntimeConfigDiffEntry[]
  savedVersion?: number
  evalResult?: RuntimeConfigEvalResult
  eligibleForPromote: boolean
  createdAt: string
  updatedAt: string
}
