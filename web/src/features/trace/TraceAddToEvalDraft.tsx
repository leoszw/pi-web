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

  return <section className="trace-panel" aria-label="Add trace to evaluation draft">
    <h2>Add to Eval Draft</h2>
    <p>Creates an unreviewed P7 Draft only. It does not enter Golden automatically.</p>
    <label>Target domain <select value={targetDomain} disabled={busy} onChange={(event) => setTargetDomain(event.target.value as P7EvalDomain)}><option value="NORMALIZATION">Normalization</option><option value="ENTITY">Entity</option><option value="TOOL">Tool</option><option value="MEMORY">Memory</option></select></label>{' '}
    <button type="button" disabled={busy || draft !== null} onClick={() => void addDraft()}>{draft === null ? 'Add to Eval Draft' : 'Draft created'}</button>
    {error === null ? null : <p role="alert">{error}</p>}
    {draft === null ? null : <p><code>{draft.draftId}</code> · <strong>{draft.status}</strong> · reviewed={String(draft.reviewed)}</p>}
  </section>
}
