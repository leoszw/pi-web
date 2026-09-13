export const OPERATIONS_CHECKS = ['CI','ADAPTER_READINESS','STAGING_INFRA','TRACE_AUDIT','EVAL_GATE','E2E','RENDERER','SANDBOX','DB_APPROVAL','PRODUCTION_APPROVAL'] as const
export type OperationsCheckType = typeof OPERATIONS_CHECKS[number]
export type OperationsCheckStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'PENDING'

export interface OperationsCheck {
  type: OperationsCheckType
  label: string
  status: OperationsCheckStatus
  detail: string
  evidenceRef?: string
  checkedAt: string
}

export interface OperationsReadiness {
  environment: 'MOCK'
  projectId: string
  overall: 'READY' | 'NOT_READY'
  checks: readonly OperationsCheck[]
  lastUpdatedAt: string
}
