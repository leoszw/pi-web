import { createHash, randomUUID } from 'node:crypto'
import type {
  ConfirmMutationRequest,
  MutationAuditEvent,
  MutationAuditTrail,
  MutationFaultMode,
  MutationOperation,
  MutationReconciliationItem,
  MutationReconciliationList,
  RejectMutationRequest,
} from '../../../../shared/industry/mutation'
import type { TrustedRequestContext } from '../context'
import { IndustryAgentClientError } from '../clients/industry-agent-client'

interface StoredMutation {
  operation: MutationOperation
  faultMode: MutationFaultMode
  audit: MutationAuditEvent[]
  approvalToken?: string
  idempotency?: {
    key: string
    digest: string
  }
}

export class MockMutationStore {
  readonly #projects = new Map<string, Map<string, StoredMutation>>()

  list(context: TrustedRequestContext): readonly MutationOperation[] {
    const store = this.#projectStore(requireProject(context))
    return [...store.values()]
      .map((item) => structuredClone(item.operation))
      .sort((a, b) => a.operationId.localeCompare(b.operationId))
  }

  get(context: TrustedRequestContext, operationId: string): MutationOperation {
    return structuredClone(this.#requireOperation(context, operationId).operation)
  }

  confirm(
    context: TrustedRequestContext,
    operationId: string,
    request: ConfirmMutationRequest,
    idempotencyKey: string,
    requestId: string,
  ): MutationOperation {
    const stored = this.#requireOperation(context, operationId)
    const operation = stored.operation

    if (stored.idempotency !== undefined) {
      if (stored.idempotency.key === idempotencyKey && stored.idempotency.digest === request.digest) {
        if (operation.status === 'COMMITTED') return structuredClone(operation)
        if (operation.status === 'RECONCILIATION_REQUIRED') {
          throw new IndustryAgentClientError(
            'MUTATION_COMMIT_FINALIZATION_FAILED',
            'business write may have succeeded; automatic commit retry is forbidden and reconciliation is required',
            500,
          )
        }
      }
      if (stored.idempotency.key === idempotencyKey && stored.idempotency.digest !== request.digest) {
        throw new IndustryAgentClientError('IDEMPOTENCY_KEY_REUSE', 'idempotency key was already used with another digest', 409)
      }
    }

    if (operation.status === 'COMMITTED') {
      this.#audit(stored, 'APPROVAL_REPLAY_BLOCKED', requestId, 'new confirmation attempt blocked after commit')
      throw new IndustryAgentClientError('APPROVAL_REPLAY', 'operation was already committed; approval replay is forbidden', 409)
    }
    if (operation.status === 'RECONCILIATION_REQUIRED') {
      throw new IndustryAgentClientError(
        'MUTATION_UNSAFE_RETRY_FORBIDDEN',
        'operation requires reconciliation; commit must not be retried automatically',
        409,
      )
    }
    if (operation.status !== 'PENDING_CONFIRMATION') {
      throw new IndustryAgentClientError('MUTATION_INVALID_STATE', `operation cannot be confirmed from ${operation.status}`, 409)
    }

    if (request.digest !== operation.digest) {
      this.#audit(stored, 'DIGEST_MISMATCH', requestId, 'confirmation digest did not match the server operation digest')
      throw new IndustryAgentClientError('DIGEST_MISMATCH', 'confirmation digest does not match current operation', 409)
    }

    if (stored.faultMode === 'VERSION_CONFLICT') {
      this.#audit(stored, 'VERSION_CONFLICT', requestId, `target version ${operation.targetVersion} is stale`)
      throw new IndustryAgentClientError('VERSION_CONFLICT', 'target entity version changed before commit', 409)
    }

    stored.idempotency = { key: idempotencyKey, digest: request.digest }
    this.#audit(stored, 'CONFIRMATION_ACCEPTED', requestId, 'explicit browser confirmation accepted')

    // Server-only approval material. It is intentionally never copied into public DTOs or audit detail.
    stored.approvalToken = `approval-${randomUUID()}`
    this.#audit(stored, 'SERVER_APPROVED', requestId, 'server-side approval issued; approval material remains private')

    if (stored.faultMode === 'FINALIZATION_FAILURE') {
      const now = new Date().toISOString()
      stored.operation = {
        ...operation,
        status: 'RECONCILIATION_REQUIRED',
        updatedAt: now,
        safeToRetryCommit: false,
      }
      this.#audit(
        stored,
        'COMMIT_FINALIZATION_FAILED',
        requestId,
        'business write may have succeeded; finalization failed and automatic retry is forbidden',
      )
      throw new IndustryAgentClientError(
        'MUTATION_COMMIT_FINALIZATION_FAILED',
        'business write may have succeeded; automatic commit retry is forbidden and reconciliation is required',
        500,
      )
    }

    // P4 remains mock-only. No database DML is performed here.
    stored.operation = {
      ...operation,
      status: 'COMMITTED',
      updatedAt: new Date().toISOString(),
      safeToRetryCommit: false,
    }
    this.#audit(stored, 'COMMIT_SUCCEEDED', requestId, 'mock commit completed without database DML')
    return structuredClone(stored.operation)
  }

  reject(
    context: TrustedRequestContext,
    operationId: string,
    request: RejectMutationRequest,
    requestId: string,
  ): MutationOperation {
    const stored = this.#requireOperation(context, operationId)
    if (stored.operation.status !== 'PENDING_CONFIRMATION') {
      throw new IndustryAgentClientError('MUTATION_INVALID_STATE', `operation cannot be rejected from ${stored.operation.status}`, 409)
    }
    stored.operation = {
      ...stored.operation,
      status: 'REJECTED',
      updatedAt: new Date().toISOString(),
      safeToRetryCommit: false,
    }
    this.#audit(stored, 'REJECTED', requestId, request.reason === undefined ? 'operation rejected by user' : `operation rejected: ${request.reason}`)
    return structuredClone(stored.operation)
  }

  audit(context: TrustedRequestContext, operationId: string): MutationAuditTrail {
    const stored = this.#requireOperation(context, operationId)
    return {
      operationId,
      events: structuredClone(stored.audit),
    }
  }

  reconciliation(context: TrustedRequestContext): MutationReconciliationList {
    const projectId = requireProject(context)
    const store = this.#projectStore(projectId)
    const items: MutationReconciliationItem[] = []
    for (const stored of store.values()) {
      if (stored.operation.status !== 'RECONCILIATION_REQUIRED') continue
      items.push({
        operationId: stored.operation.operationId,
        projectId,
        code: 'MUTATION_COMMIT_FINALIZATION_FAILED',
        summary: stored.operation.summary,
        businessWriteMayHaveSucceeded: true,
        automaticRetryForbidden: true,
        createdAt: stored.operation.updatedAt,
      })
    }
    return { items }
  }

  #projectStore(projectId: string): Map<string, StoredMutation> {
    let store = this.#projects.get(projectId)
    if (store === undefined) {
      store = seedProject(projectId)
      this.#projects.set(projectId, store)
    }
    return store
  }

  #requireOperation(context: TrustedRequestContext, operationId: string): StoredMutation {
    const projectId = requireProject(context)
    const operation = this.#projectStore(projectId).get(operationId)
    if (operation === undefined) throw new IndustryAgentClientError('MUTATION_NOT_FOUND', 'mutation operation not found', 404)
    return operation
  }

  #audit(stored: StoredMutation, type: MutationAuditEvent['type'], requestId: string, detail: string): void {
    stored.audit.push({
      auditId: `audit-${randomUUID()}`,
      operationId: stored.operation.operationId,
      sequenceNo: stored.audit.length + 1,
      type,
      requestId,
      traceId: `trace-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      detail,
    })
  }
}

function seedProject(projectId: string): Map<string, StoredMutation> {
  const store = new Map<string, StoredMutation>()
  for (const fixture of [
    { key: 'safe', title: '更新工程负责人', summary: '将左幅路基填筑负责人更新为张三。', faultMode: 'NONE' as const },
    { key: 'version-conflict', title: '更新工程数量', summary: '将 C30 混凝土基础工程量更新为 128.5。', faultMode: 'VERSION_CONFLICT' as const },
    { key: 'finalization', title: '更新清单备注', summary: '更新清单备注并模拟提交后 finalization failure。', faultMode: 'FINALIZATION_FAILURE' as const },
  ]) {
    const operationId = `mutation-${safeId(projectId)}-${fixture.key}-001`
    const preview = fixture.key === 'safe'
      ? { entityId: '123456789012345678', field: 'owner', before: '李四', after: '张三' }
      : fixture.key === 'version-conflict'
        ? { entityId: '223456789012345678', field: 'quantity', before: 120, after: 128.5 }
        : { entityId: '323456789012345678', field: 'remark', before: null, after: '已复核' }
    const targetVersion = fixture.key === 'version-conflict' ? 'entity-v16' : 'entity-v17'
    const digest = digestFor({ projectId, operationId, targetVersion, preview })
    const now = new Date().toISOString()
    const operation: MutationOperation = {
      operationId,
      projectId,
      operationType: 'UPDATE',
      title: fixture.title,
      summary: fixture.summary,
      digest,
      status: 'PENDING_CONFIRMATION',
      targetVersion,
      preview,
      createdAt: now,
      updatedAt: now,
      safeToRetryCommit: false,
    }
    const audit: MutationAuditEvent[] = [{
      auditId: `audit-${randomUUID()}`,
      operationId,
      sequenceNo: 1,
      type: 'OPERATION_CREATED',
      requestId: 'fixture-seed',
      traceId: `trace-${randomUUID()}`,
      timestamp: now,
      detail: 'mock mutation operation created; no database DML has occurred',
    }]
    store.set(operationId, { operation, faultMode: fixture.faultMode, audit })
  }
  return store
}

function digestFor(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`
}

function safeId(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/gu, '-').slice(0, 48)
  return normalized === '' ? 'project' : normalized
}

function requireProject(context: TrustedRequestContext): string {
  if (context.projectId === null) throw new IndustryAgentClientError('INDUSTRY_PROJECT_REQUIRED', 'active project is required', 409)
  return context.projectId
}
