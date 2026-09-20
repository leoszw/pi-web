import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { MutationAuditTrail, MutationOperation, MutationReconciliationList } from '../../shared/industry/mutation'
import { MutationCenterView, type MutationCenterSnapshot } from '../src/features/mutation-center/MutationCenterPage'

const digest = `sha256:${'a'.repeat(64)}`

function operation(status: MutationOperation['status']): MutationOperation {
  return {
    operationId: 'mutation-project-1-safe-001',
    projectId: 'project-1',
    operationType: 'UPDATE',
    title: '更新工程负责人',
    summary: '将左幅路基填筑负责人更新为张三。',
    digest,
    status,
    targetVersion: 'entity-v17',
    preview: { entityId: '123456789012345678', field: 'owner', before: '李四', after: '张三' },
    createdAt: '2026-09-13T00:00:00.000Z',
    updatedAt: '2026-09-13T00:00:01.000Z',
    safeToRetryCommit: false,
  }
}

const audit: MutationAuditTrail = {
  operationId: 'mutation-project-1-safe-001',
  events: [{
    auditId: 'audit-1',
    operationId: 'mutation-project-1-safe-001',
    sequenceNo: 1,
    type: 'OPERATION_CREATED',
    requestId: 'request-1',
    traceId: 'trace-1',
    timestamp: '2026-09-13T00:00:00.000Z',
    detail: 'mock operation created',
  }],
}

function renderDetail(status: MutationOperation['status'], unknown = false, retained = false): string {
  const snapshot: MutationCenterSnapshot = { operations: [], operation: operation(status), audit }
  return renderToStaticMarkup(
    <MutationCenterView
      mode="detail"
      snapshot={snapshot}
      busy={false}
      error={null}
      explicitConfirmation={false}
      rejectReason=""
      confirmationStatusUnknown={unknown}
      hasRetainedAttempt={retained}
    />,
  )
}

describe('MutationCenterView', () => {
  it('renders pending diff, digest, audit, and explicit confirmation without approval token material', () => {
    const html = renderDetail('PENDING_CONFIRMATION')
    expect(html).toContain('差异 / 预览')
    expect(html).toContain('123456789012345678')
    expect(html).toContain(digest)
    expect(html).toContain('审计时间线')
    expect(html).toContain('确认变更')
    expect(html).toContain('拒绝操作')
    expect(html.toLowerCase()).not.toContain('approvaltoken')
    expect(html.toLowerCase()).not.toContain('approval_token')
  })

  it('removes confirmation controls when finalization requires reconciliation', () => {
    const html = renderDetail('RECONCILIATION_REQUIRED')
    expect(html).toContain('业务写入可能已成功')
    expect(html).toContain('禁止重试提交')
    expect(html).toContain('打开对账')
    expect(html).not.toContain('确认变更')
    expect(html).not.toContain('拒绝操作')
  })

  it('locks an uncertain confirmation attempt until status is refreshed', () => {
    const html = renderDetail('PENDING_CONFIRMATION', true, true)
    expect(html).toContain('确认状态未知')
    expect(html).toContain('刷新状态')
    expect(html).toContain('Idempotency-Key 在此浏览器会话中保持保留')
    expect(html).not.toContain('确认变更')
    expect(html).not.toContain('拒绝操作')
  })

  it('resumes a refreshed pending confirmation with the retained Idempotency-Key instead of creating a new attempt', () => {
    const html = renderDetail('PENDING_CONFIRMATION', false, true)
    expect(html).toContain('恢复同一幂等尝试')
    expect(html).toContain('恢复同一确认尝试')
    expect(html).toContain('不会创建新的提交尝试')
  })

  it('surfaces reconciliation backlog and forbids automatic retry', () => {
    const reconciliation: MutationReconciliationList = {
      items: [{
        operationId: 'mutation-project-1-finalization-001',
        projectId: 'project-1',
        code: 'MUTATION_COMMIT_FINALIZATION_FAILED',
        summary: 'finalization failed',
        businessWriteMayHaveSucceeded: true,
        automaticRetryForbidden: true,
        createdAt: '2026-09-13T00:00:02.000Z',
      }],
    }
    const html = renderToStaticMarkup(
      <MutationCenterView
        mode="reconciliation"
        snapshot={{ operations: [operation('RECONCILIATION_REQUIRED')], reconciliation }}
        busy={false}
        error={null}
        explicitConfirmation={false}
        rejectReason=""
        confirmationStatusUnknown={false}
      />,
    )
    expect(html).toContain('MUTATION_COMMIT_FINALIZATION_FAILED')
    expect(html).toContain('业务写入可能已成功')
    expect(html).toContain('禁止自动重试')
    expect(html).not.toContain('确认变更')
  })
})
