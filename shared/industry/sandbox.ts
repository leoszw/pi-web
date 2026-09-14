export type SandboxScenario =
  | 'SAFE_READ'
  | 'WRITE_SQL'
  | 'SELECT_STAR'
  | 'LOAD_FILE'
  | 'SYSTEM_SCHEMA'
  | 'PYTHON_IMPORT_OPEN_NETWORK_PROCESS'
  | 'DYNAMIC_QUERY_ID'
  | 'ATTESTATION'
  | 'PAYLOAD_BUDGET'

export type SandboxRunStatus = 'COMPLETED' | 'BLOCKED' | 'TERMINATED'
export type SandboxTerminationReason =
  | 'SUCCESS'
  | 'SQL_POLICY_BLOCKED'
  | 'PYTHON_POLICY_BLOCKED'
  | 'QUERY_ID_POLICY_BLOCKED'
  | 'ATTESTATION_FAILED'
  | 'PAYLOAD_BUDGET'
  | 'TIMEOUT'

export interface SandboxBudget {
  maxRows: number
  maxBytes: number
  timeoutMs: number
}

export interface StartSandboxRunRequest {
  goal: string
  budget: SandboxBudget
  scenario?: SandboxScenario
}

export interface SandboxSchemaTable {
  table: string
  columns: readonly { name: string; type: string }[]
}

export interface SandboxValidationFinding {
  code: string
  severity: 'INFO' | 'BLOCK'
  message: string
}

export interface SandboxBrokerPolicy {
  policy: string
  value: string
}

export interface SandboxRuntimeAttestation {
  runtimeId: string
  imageDigest: string
  networkDisabled: boolean
  processSpawnDisabled: boolean
  filesystemReadOnly: boolean
  verified: boolean
}

export interface SandboxLineageNode {
  nodeId: string
  type: 'GOAL' | 'SQL' | 'QUERY' | 'PYTHON' | 'OUTPUT'
  label: string
  parentIds: readonly string[]
}

export interface SandboxRun {
  runId: string
  projectId: string
  goal: string
  status: SandboxRunStatus
  scenario: SandboxScenario
  budget: SandboxBudget
  schema: readonly SandboxSchemaTable[]
  generatedSql: string
  validation: readonly SandboxValidationFinding[]
  queryId: string | null
  brokerPolicies: readonly SandboxBrokerPolicy[]
  pythonSource: string
  pythonHash: string
  runtimeAttestation: SandboxRuntimeAttestation
  output: { columns: readonly string[]; rows: readonly Readonly<Record<string, string | number | null>>[]; rowCount: number; bytes: number }
  lineage: readonly SandboxLineageNode[]
  terminationReason: SandboxTerminationReason
  traceId: string
  createdAt: string
  completedAt: string
}
