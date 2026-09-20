import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TraceAddToEvalDraft } from '../src/features/trace/TraceAddToEvalDraft'

describe('TraceAddToEvalDraft', () => {
  it('offers P7 draft targets without a Golden promotion action', () => {
    const html = renderToStaticMarkup(<TraceAddToEvalDraft traceId="trace-project-1-retrieval-001" />)
    expect(html).toContain('加入评测草稿')
    for (const label of ['归一化', '实体', '工具', '内存']) expect(html).toContain(label)
    expect(html).toContain('不会自动进入 Golden')
    expect(html).not.toContain('Promote')
    expect(html).not.toContain('projectId')
  })
})
