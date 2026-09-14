export type MutationOperationStatus =
  | 'PENDING_CONFIRMATION'
  | 'COMMITTED'
  | 'REJECTED'
  | 'RECONCILIATION_REQUIRED'

export type MutationFaultMode = 'NONE' | 'VERSION_CONFLICT' | 'FINALIZATION_FAILURE'

export type MutationAuditType =
  | 'OPERATION_CREATED'
  | 'DIGEST_MISMATCH'
  | 'CONFIRMATION_ACCEPTED'
  | 'SERVER_APPROVED'
  | 'COMMIT_SUCCEEDED'
  | 'REJECTED'
  | 'VERSION_CONFLICT'
  | 'APPROVAL_REPLAY_BLOCKED'
  | 'COMMIT_FINALIZATION_FAILED'

export interface MutationOperation {
  operationId: string
  projectId: string
  operationType: 'UPDATE'
  title: string
  summary: string
  digest: string
  status: MutationOperationStatus
  targetVersion: string
  preview: Readonly<Record<string, string | number | boolean | null>>
  createdAt: string
  updatedAt: string
  safeToRetryCommit: boolean
}

export interface MutationOperationList {
  operations: readonly MutationOperation[]
}

export interface ConfirmMutationRequest {
  digest: string
  explicitConfirmation: true
}

export interface RejectMutationRequest {
  reason?: string
}

export interface MutationAuditEvent {
  auditId: string
  operationId: string
  sequenceNo: number
  type: MutationAuditType
  requestId: string
  traceId: string
  timestamp: string
  detail: string
}

export interface MutationAuditTrail {
  operationId: string
  events: readonly MutationAuditEvent[]
}

export interface MutationReconciliationItem {
  operationId: string
  projectId: string
  code: 'MUTATION_COMMIT_FINALIZATION_FAILED'
  summary: string
  businessWriteMayHaveSucceeded: true
  automaticRetryForbidden: true
  createdAt: string
}

export interface MutationReconciliationList {
  items: readonly MutationReconciliationItem[]
}
