import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import type { MutationAuditTrail, MutationOperation, MutationReconciliationList } from '../../../../shared/industry/mutation'
import {
  createIndustryMutationApiClient,
  IndustryMutationApiError,
  type IndustryMutationApiClient,
} from '../../api/mutation-client'
import { mutationOperationPath } from '../../app/routes'
import './mutation-center.css'

const defaultClient = createIndustryMutationApiClient()

export type MutationCenterMode = 'list' | 'detail' | 'reconciliation'

export interface MutationCenterSnapshot {
  operations: readonly MutationOperation[]
  operation?: MutationOperation
  audit?: MutationAuditTrail
  reconciliation?: MutationReconciliationList
}

interface MutationCenterError {
  code: string
  message: string
  resolution?: string
}

type SnapshotSetter = Dispatch<SetStateAction<MutationCenterSnapshot | undefined>>

export function MutationCenterPage({
  mode,
  operationId,
  client = defaultClient,
  initialSnapshot,
  idempotencyKeyFactory = createIdempotencyKey,
}: {
  mode: MutationCenterMode
  operationId?: string
  client?: IndustryMutationApiClient
  initialSnapshot?: MutationCenterSnapshot
  idempotencyKeyFactory?: () => string
}) {
  const [snapshot, setSnapshot] = useState<MutationCenterSnapshot | undefined>(initialSnapshot)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MutationCenterError | null>(null)
  const [explicitConfirmation, setExplicitConfirmation] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [attemptKey, setAttemptKey] = useState<string | null>(null)
  const [confirmationStatusUnknown, setConfirmationStatusUnknown] = useState(false)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void loadSnapshot(client, mode, operationId)
      .then((value) => { if (!cancelled) setSnapshot(value) })
      .catch((reason: unknown) => { if (!cancelled) setError(errorOf(reason)) })
    return () => { cancelled = true }
  }, [client, initialSnapshot, mode, operationId])

  async function refreshDetail(): Promise<void> {
    if (operationId === undefined) return
    setBusy(true)
    try {
      const [operation, audit] = await Promise.all([client.getMutation(operationId), client.getMutationAudit(operationId)])
      setSnapshot((current) => ({
        operations: current?.operations ?? [],
        operation,
        audit,
        ...(current?.reconciliation === undefined ? {} : { reconciliation: current.reconciliation }),
      }))
      setConfirmationStatusUnknown(false)
      setError(null)
      if (operation.status !== 'PENDING_CONFIRMATION') {
        setAttemptKey(null)
        setExplicitConfirmation(false)
      }
    } catch (reason) {
      setError(errorOf(reason))
    } finally {
      setBusy(false)
    }
  }

  async function confirm(): Promise<void> {
    const operation = snapshot?.operation
    if (operation === undefined || operation.status !== 'PENDING_CONFIRMATION' || !explicitConfirmation || confirmationStatusUnknown) return
    setBusy(true)
    setError(null)
    const key = attemptKey ?? idempotencyKeyFactory()
    setAttemptKey(key)
    try {
      const updated = await client.confirmMutation(operation.operationId, { digest: operation.digest, explicitConfirmation: true }, key)
      const audit = await client.getMutationAudit(operation.operationId)
      setSnapshot((current) => mergeOperation(current, updated, audit))
      clearAttempt()
    } catch (reason) {
      await handleConfirmFailure(reason, operation)
    } finally {
      setBusy(false)
    }
  }

  async function handleConfirmFailure(reason: unknown, operation: MutationOperation): Promise<void> {
    if (!(reason instanceof IndustryMutationApiError)) {
      lockUnknownConfirmation('CONFIRMATION_STATUS_UNKNOWN', 'Confirmation response is unknown. Check server status before any retry. The same Idempotency-Key is retained for this attempt.')
      return
    }

    setError(errorOf(reason))
    if (reason.code === 'MUTATION_COMMIT_FINALIZATION_FAILED' || reason.code === 'MUTATION_UNSAFE_RETRY_FORBIDDEN') {
      // Fail closed immediately. A follow-up GET is evidence enrichment only; it must never decide whether retry controls are visible.
      markLocalTerminal(operation, 'RECONCILIATION_REQUIRED')
      clearAttempt()
      await refreshAfterFinalizationFailure(client, operation.operationId, setSnapshot)
      return
    }
    if (reason.code === 'APPROVAL_REPLAY') {
      markLocalTerminal(operation, 'COMMITTED')
      clearAttempt()
      await refreshKnownOperation(client, operation.operationId, setSnapshot)
      return
    }
    if (isDefinitivePrecommitFailure(reason.code)) {
      clearAttempt()
      await refreshKnownOperation(client, operation.operationId, setSnapshot)
      return
    }

    lockUnknownConfirmation(
      reason.code,
      `${reason.message} Confirmation outcome is not proven; check server status before any retry.`,
    )
  }

  function markLocalTerminal(operation: MutationOperation, status: 'COMMITTED' | 'RECONCILIATION_REQUIRED'): void {
    const local = { ...operation, status, safeToRetryCommit: false, updatedAt: new Date().toISOString() } satisfies MutationOperation
    setSnapshot((current) => mergeOperation(current, local, current?.audit))
  }

  function clearAttempt(): void {
    setAttemptKey(null)
    setExplicitConfirmation(false)
    setConfirmationStatusUnknown(false)
  }

  function lockUnknownConfirmation(code: string, message: string): void {
    setConfirmationStatusUnknown(true)
    setError({ code, message, resolution: 'refresh' })
  }

  async function reject(): Promise<void> {
    const operation = snapshot?.operation
    if (operation === undefined || operation.status !== 'PENDING_CONFIRMATION' || confirmationStatusUnknown) return
    setBusy(true)
    setError(null)
    try {
      const updated = await client.rejectMutation(operation.operationId, rejectReason.trim() === '' ? {} : { reason: rejectReason.trim() })
      const audit = await client.getMutationAudit(operation.operationId)
      setSnapshot((current) => mergeOperation(current, updated, audit))
      setRejectReason('')
      clearAttempt()
    } catch (reason) {
      setError(errorOf(reason))
    } finally {
      setBusy(false)
    }
  }

  if (snapshot === undefined) {
    return <main className="mutation-center"><h1>变更中心</h1>{error === null ? <p>加载变更状态中…</p> : <ErrorBanner error={error} />}</main>
  }

  return <MutationCenterView
    mode={mode}
    snapshot={snapshot}
    busy={busy}
    error={error}
    explicitConfirmation={explicitConfirmation}
    rejectReason={rejectReason}
    confirmationStatusUnknown={confirmationStatusUnknown}
    hasRetainedAttempt={attemptKey !== null}
    onExplicitConfirmation={setExplicitConfirmation}
    onRejectReason={setRejectReason}
    onConfirm={() => void confirm()}
    onReject={() => void reject()}
    onRefresh={() => void refreshDetail()}
  />
}

export function MutationCenterView({
  mode,
  snapshot,
  busy,
  error,
  explicitConfirmation,
  rejectReason,
  confirmationStatusUnknown,
  hasRetainedAttempt = false,
  onExplicitConfirmation = () => undefined,
  onRejectReason = () => undefined,
  onConfirm = () => undefined,
  onReject = () => undefined,
  onRefresh = () => undefined,
}: {
  mode: MutationCenterMode
  snapshot: MutationCenterSnapshot
  busy: boolean
  error: MutationCenterError | null
  explicitConfirmation: boolean
  rejectReason: string
  confirmationStatusUnknown: boolean
  hasRetainedAttempt?: boolean
  onExplicitConfirmation?: (value: boolean) => void
  onRejectReason?: (value: string) => void
  onConfirm?: () => void
  onReject?: () => void
  onRefresh?: () => void
}) {
  const reconciliationCount = snapshot.reconciliation?.items.length ?? snapshot.operations.filter((item) => item.status === 'RECONCILIATION_REQUIRED').length
  return (
    <main className="mutation-center" aria-labelledby="mutation-center-title">
      <header className="mutation-heading">
        <div><span>行业智能体 · P4</span><h1 id="mutation-center-title">变更中心</h1><p>显式确认、幂等提交控制、审计与对账。仅模拟:无真实数据库 DML。</p></div>
        <nav aria-label="变更中心导航"><a href="/industry">工作区</a><a href="/industry/mutations">操作</a><a href="/industry/mutations/reconciliation">对账{reconciliationCount > 0 ? ` (${reconciliationCount})` : ''}</a></nav>
      </header>
      {error === null ? null : <ErrorBanner error={error} />}
      {mode === 'list' ? <OperationList operations={snapshot.operations} reconciliationCount={reconciliationCount} /> : null}
      {mode === 'detail' && snapshot.operation !== undefined ? <OperationDetail
        operation={snapshot.operation}
        audit={snapshot.audit}
        busy={busy}
        explicitConfirmation={explicitConfirmation}
        rejectReason={rejectReason}
        confirmationStatusUnknown={confirmationStatusUnknown}
        hasRetainedAttempt={hasRetainedAttempt}
        onExplicitConfirmation={onExplicitConfirmation}
        onRejectReason={onRejectReason}
        onConfirm={onConfirm}
        onReject={onReject}
        onRefresh={onRefresh}
      /> : null}
      {mode === 'reconciliation' ? <ReconciliationView reconciliation={snapshot.reconciliation ?? { items: [] }} /> : null}
    </main>
  )
}

function OperationList({ operations, reconciliationCount }: { operations: readonly MutationOperation[]; reconciliationCount: number }) {
  return <section className="mutation-section">
    <div className="mutation-section-heading"><h2>操作</h2><span>{operations.length} 条操作</span></div>
    {reconciliationCount > 0 ? <div className="mutation-critical"><strong>需要对账</strong><p>{reconciliationCount} 个操作可能已写入业务数据但最终化失败。切勿自动重试提交。</p><a href="/industry/mutations/reconciliation">打开对账</a></div> : null}
    <div className="mutation-operation-list">{operations.map((operation) => <a className="mutation-operation-card" href={mutationOperationPath(operation.operationId)} key={operation.operationId}><div><strong>{operation.title}</strong><p>{operation.summary}</p></div><div><StatusBadge status={operation.status} /><code>{operation.operationId}</code></div></a>)}</div>
  </section>
}

function OperationDetail({
  operation, audit, busy, explicitConfirmation, rejectReason, confirmationStatusUnknown, hasRetainedAttempt,
  onExplicitConfirmation, onRejectReason, onConfirm, onReject, onRefresh,
}: {
  operation: MutationOperation
  audit?: MutationAuditTrail
  busy: boolean
  explicitConfirmation: boolean
  rejectReason: string
  confirmationStatusUnknown: boolean
  hasRetainedAttempt: boolean
  onExplicitConfirmation: (value: boolean) => void
  onRejectReason: (value: string) => void
  onConfirm: () => void
  onReject: () => void
  onRefresh: () => void
}) {
  return <div className="mutation-detail-grid">
    <section className="mutation-section">
      <a href="/industry/mutations">← 返回操作</a>
      <div className="mutation-detail-title"><div><h2>{operation.title}</h2><p>{operation.summary}</p></div><StatusBadge status={operation.status} /></div>
      <dl className="mutation-meta">
        <div><dt>操作 ID</dt><dd><code>{operation.operationId}</code></dd></div><div><dt>项目</dt><dd><code>{operation.projectId}</code></dd></div>
        <div><dt>目标版本</dt><dd><code>{operation.targetVersion}</code></dd></div><div><dt>摘要</dt><dd><code>{operation.digest}</code></dd></div>
        <div><dt>可安全重试提交</dt><dd><strong>{operation.safeToRetryCommit ? '是' : '否'}</strong></dd></div>
      </dl>
      <h3>差异 / 预览</h3>
      <table className="mutation-preview"><tbody>{Object.entries(operation.preview).map(([key, value]) => <tr key={key}><th>{key}</th><td>{String(value ?? 'null')}</td></tr>)}</tbody></table>
      {operation.status === 'PENDING_CONFIRMATION' ? <section className="mutation-confirmation" aria-label="显式变更确认">
        <h3>显式确认</h3><p>确认将使用此精确摘要。审批材料保留在服务端。</p>
        {confirmationStatusUnknown ? <div className="mutation-warning"><strong>确认状态未知</strong><p>请勿发起新的提交尝试。先检查操作状态;当前 Idempotency-Key 在此浏览器会话中保持保留。</p><button type="button" disabled={busy} onClick={onRefresh}>刷新状态</button></div> : <>
          {hasRetainedAttempt ? <div className="mutation-warning"><strong>恢复同一幂等尝试</strong><p>保留的 Idempotency-Key 将被复用。不会创建新的提交尝试。</p></div> : null}
          <label className="mutation-checkbox"><input type="checkbox" checked={explicitConfirmation} disabled={busy} onChange={(event) => onExplicitConfirmation(event.target.checked)} />我已查看差异、目标版本和摘要,并显式确认此变更。</label>
          <button className="mutation-primary" type="button" disabled={busy || !explicitConfirmation} onClick={onConfirm}>{hasRetainedAttempt ? '恢复同一确认尝试' : '确认变更'}</button>
          <div className="mutation-reject"><label>拒绝原因<textarea rows={2} value={rejectReason} disabled={busy} onChange={(event) => onRejectReason(event.target.value)} /></label><button type="button" disabled={busy} onClick={onReject}>拒绝操作</button></div>
        </>}
      </section> : null}
      {operation.status === 'COMMITTED' ? <div className="mutation-success"><strong>已提交</strong><p>模拟操作已终止。无法重复确认。</p></div> : null}
      {operation.status === 'REJECTED' ? <div className="mutation-neutral"><strong>已拒绝</strong><p>此操作已终止,无法稍后确认。</p></div> : null}
      {operation.status === 'RECONCILIATION_REQUIRED' ? <div className="mutation-critical"><strong>业务写入可能已成功</strong><p>最终化失败。禁止重试提交。在采取任何进一步操作前,请调查对账。</p><a href="/industry/mutations/reconciliation">打开对账</a></div> : null}
    </section>
    <AuditTimeline audit={audit} />
  </div>
}

function AuditTimeline({ audit }: { audit?: MutationAuditTrail }) {
  return <aside className="mutation-section mutation-audit" aria-label="变更审计时间线"><h2>审计时间线</h2>{audit === undefined || audit.events.length === 0 ? <p>暂无审计事件。</p> : <ol>{audit.events.map((event) => <li key={event.auditId}><div><strong>{event.type}</strong><span>#{event.sequenceNo}</span></div><p>{event.detail}</p><small>{event.timestamp} · 请求 <code>{event.requestId}</code> · 追踪 <code>{event.traceId}</code></small></li>)}</ol>}</aside>
}

function ReconciliationView({ reconciliation }: { reconciliation: MutationReconciliationList }) {
  return <section className="mutation-section"><div className="mutation-section-heading"><h2>对账</h2><span>{reconciliation.items.length} 项</span></div>{reconciliation.items.length === 0 ? <div className="mutation-success"><strong>无对账积压</strong><p>当前项目中不存在模糊的最终化失败。</p></div> : reconciliation.items.map((item) => <article className="mutation-critical" key={item.operationId}><strong>{item.code}</strong><p>{item.summary}</p><dl className="mutation-meta"><div><dt>业务写入可能已成功</dt><dd>{item.businessWriteMayHaveSucceeded ? '是' : '否'}</dd></div><div><dt>禁止自动重试</dt><dd>{item.automaticRetryForbidden ? '是' : '否'}</dd></div></dl><a href={mutationOperationPath(item.operationId)}>查看操作与审计</a></article>)}</section>
}

function StatusBadge({ status }: { status: MutationOperation['status'] }) {
  return <span className="mutation-status" data-status={status}>{status}</span>
}

function ErrorBanner({ error }: { error: MutationCenterError }) {
  return <div className="mutation-error" role="alert"><strong>{error.code}</strong><span>{error.message}</span>{error.resolution === undefined ? null : <small>解决方案: {error.resolution}</small>}</div>
}

async function loadSnapshot(client: IndustryMutationApiClient, mode: MutationCenterMode, operationId: string | undefined): Promise<MutationCenterSnapshot> {
  if (mode === 'detail') {
    if (operationId === undefined) throw new Error('operationId is required for mutation detail')
    const [operation, audit] = await Promise.all([client.getMutation(operationId), client.getMutationAudit(operationId)])
    return { operations: [], operation, audit }
  }
  const [operations, reconciliation] = await Promise.all([client.listMutations(), client.getReconciliation()])
  return { operations, reconciliation }
}

async function refreshKnownOperation(client: IndustryMutationApiClient, operationId: string, setSnapshot: SnapshotSetter): Promise<void> {
  try {
    const [operation, audit] = await Promise.all([client.getMutation(operationId), client.getMutationAudit(operationId)])
    setSnapshot((current) => mergeOperation(current, operation, audit))
  } catch {
    // Preserve the original mutation error. Refresh failure must never trigger a commit retry.
  }
}

async function refreshAfterFinalizationFailure(client: IndustryMutationApiClient, operationId: string, setSnapshot: SnapshotSetter): Promise<void> {
  try {
    const [operation, audit, reconciliation] = await Promise.all([client.getMutation(operationId), client.getMutationAudit(operationId), client.getReconciliation()])
    setSnapshot((current) => ({ ...mergeOperation(current, operation, audit), reconciliation }))
  } catch {
    // Local fail-closed state already removed commit controls; evidence refresh is best-effort only.
  }
}

function mergeOperation(current: MutationCenterSnapshot | undefined, operation: MutationOperation, audit?: MutationAuditTrail): MutationCenterSnapshot {
  return {
    operations: replaceOperation(current?.operations ?? [], operation),
    operation,
    ...(audit === undefined ? (current?.audit === undefined ? {} : { audit: current.audit }) : { audit }),
    ...(current?.reconciliation === undefined ? {} : { reconciliation: current.reconciliation }),
  }
}

function replaceOperation(operations: readonly MutationOperation[], next: MutationOperation): readonly MutationOperation[] {
  const found = operations.some((item) => item.operationId === next.operationId)
  return found ? operations.map((item) => item.operationId === next.operationId ? next : item) : [...operations, next]
}

function isDefinitivePrecommitFailure(code: string): boolean {
  return code === 'DIGEST_MISMATCH' || code === 'VERSION_CONFLICT' || code === 'IDEMPOTENCY_KEY_REUSE'
}

function errorOf(reason: unknown): MutationCenterError {
  if (reason instanceof IndustryMutationApiError) return { code: reason.code, message: reason.message, ...(reason.resolution === undefined ? {} : { resolution: reason.resolution.type }) }
  return { code: 'MUTATION_UI_ERROR', message: reason instanceof Error ? reason.message : String(reason) }
}

function createIdempotencyKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid === undefined ? `mutation-confirm-${Date.now()}-${Math.random().toString(36).slice(2)}` : `mutation-confirm-${uuid}`
}
