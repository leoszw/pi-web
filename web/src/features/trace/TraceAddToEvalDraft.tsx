import { useState } from 'react'
import type { P7EvalDomain, P7EvalDraft } from '../../../../shared/industry/eval/p7'
import { createP7EvaluationApiClient, type P7EvaluationApiClient } from '../../api/p7-client'

const defaultClient = createP7EvaluationApiClient()

export function TraceAddToEvalDraft({ traceId, client = defaultClient }: { traceId: string; client?: P7EvaluationApiClient }) {
  const [targetDomain, setTargetDomain] = useState<P7EvalDomain>('ENTITY')
  const [draft, setDraft] = useState<P7EvalDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addDraft(): Promise<void> {
    setBusy(true); setError(null)
    try { setDraft(await client.createDraftFromTrace({ traceId, targetDomain })) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setBusy(false) }
  }

  return <section className="trace-panel" aria-label="将追踪加入评测草稿">
    <h2>加入评测草稿</h2>
    <p>仅创建未评审的 P7 草稿。不会自动进入 Golden。</p>
    <label>目标领域 <select value={targetDomain} disabled={busy} onChange={(event) => setTargetDomain(event.target.value as P7EvalDomain)}><option value="NORMALIZATION">归一化</option><option value="ENTITY">实体</option><option value="TOOL">工具</option><option value="MEMORY">内存</option></select></label>{' '}
    <button type="button" disabled={busy || draft !== null} onClick={() => void addDraft()}>{draft === null ? '加入评测草稿' : '草稿已创建'}</button>
    {error === null ? null : <p role="alert">{error}</p>}
    {draft === null ? null : <p><code>{draft.draftId}</code> · <strong>{draft.status}</strong> · 已评审={String(draft.reviewed)}</p>}
  </section>
}
