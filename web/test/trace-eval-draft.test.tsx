import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TraceAddToEvalDraft } from '../src/features/trace/TraceAddToEvalDraft'

describe('TraceAddToEvalDraft', () => {
  it('offers P7 draft targets without a Golden promotion action', () => {
    const html = renderToStaticMarkup(<TraceAddToEvalDraft traceId="trace-project-1-retrieval-001" />)
    expect(html).toContain('Add to Eval Draft')
    for (const label of ['Normalization', 'Entity', 'Tool', 'Memory']) expect(html).toContain(label)
    expect(html).toContain('does not enter Golden automatically')
    expect(html).not.toContain('Promote')
    expect(html).not.toContain('projectId')
  })
})
