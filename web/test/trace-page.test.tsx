import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TraceDetail, TraceStats, TraceSummary, TraceTimelineEvent, TraceTree } from '../../shared/industry/trace'
import { TracePageView, type TracePageSnapshot } from '../src/features/trace/TracePage'
import { maskTraceText, maskTraceValue } from '../src/features/trace/trace-redaction'

const summary: TraceSummary = {
  traceId: 'trace-project-1-retrieval-001',
  requestId: 'request-1',
  projectId: 'project-1',
  kind: 'RETRIEVAL',
  name: '工程部位查询',
  status: 'OK',
  startedAt: '2026-09-13T05:00:00.000Z',
  completedAt: '2026-09-13T05:00:00.185Z',
  durationMs: 185,
  spanCount: 2,
}

const detail: TraceDetail = {
  summary,
  spans: [{
    spanId: 'span-root',
    name: 'industry.request',
    kind: 'AGENT',
    status: 'OK',
    startedAt: summary.startedAt,
    completedAt: summary.completedAt,
    durationMs: 185,
  }],
  debug: {
    request: { authorization: 'Bearer should-never-render', apiKey: 'sk-leaked-secret-123' },
    response: { dsn: 'mysql://u:p@db/private' },
    toolCalls: [{
      toolCallId: 'tool-1',
      name: 'query',
      arguments: { approvalToken: 'approval-browser-secret-123' },
      result: { ok: true },
    }],
  },
  prompts: [{ promptId: 'prompt-1', spanId: 'span-root', model: 'mock', role: 'USER', content: 'Authorization: Bearer prompt-secret-123' }],
  audit: [{ auditId: 'audit-1', sequenceNo: 1, type: 'READ', actorId: 'user-1', timestamp: summary.completedAt, detail: 'cookie=session-secret-123' }],
}

const timeline: readonly TraceTimelineEvent[] = [
  { eventId: 'event-1', sequenceNo: 1, timestamp: summary.startedAt, type: 'TRACE_STARTED', title: '工程部位查询' },
  { eventId: 'event-2', sequenceNo: 2, timestamp: summary.completedAt, type: 'TRACE_COMPLETED', title: '工程部位查询 · OK' },
]

const tree: TraceTree = { traceId: summary.traceId, roots: [{ span: detail.spans[0]!, children: [] }] }
const stats: TraceStats = {
  traceId: summary.traceId,
  durationMs: 185,
  queryLatencyMs: 75,
  llmCallCount: 1,
  toolCallCount: 1,
  tokenUsage: { inputTokens: 428, outputTokens: 96, totalTokens: 524 },
  spanCount: 2,
  errorCount: 0,
}

const snapshot: TracePageSnapshot = { traces: [summary], detail, timeline, tree, stats }

describe('TracePageView', () => {
  it('renders list and overview with trace/token statistics', () => {
    const listHtml = renderToStaticMarkup(<TracePageView snapshot={{ traces: [summary] }} tab="overview" />)
    expect(listHtml).toContain('追踪浏览器')
    expect(listHtml).toContain('工程部位查询')
    expect(listHtml).toContain('/industry/traces/trace-project-1-retrieval-001')

    const detailHtml = renderToStaticMarkup(<TracePageView snapshot={snapshot} traceId={summary.traceId} tab="overview" />)
    expect(detailHtml).toContain('查询延迟')
    expect(detailHtml).toContain('75 ms')
    expect(detailHtml).toContain('524')
    expect(detailHtml).toContain('LLM 调用次数')
    expect(detailHtml).toContain('工具调用次数')
  })

  it('renders monotonic timeline and span tree surfaces', () => {
    const timelineHtml = renderToStaticMarkup(<TracePageView snapshot={snapshot} traceId={summary.traceId} tab="timeline" />)
    expect(timelineHtml).toContain('#1')
    expect(timelineHtml).toContain('#2')
    expect(timelineHtml).toContain('TRACE_COMPLETED')

    const treeHtml = renderToStaticMarkup(<TracePageView snapshot={snapshot} traceId={summary.traceId} tab="tree" />)
    expect(treeHtml).toContain('跨度树')
    expect(treeHtml).toContain('industry.request')
  })

  it('applies web-side masking even if an unsafe payload reaches the component', () => {
    const html = renderToStaticMarkup(<TracePageView snapshot={snapshot} traceId={summary.traceId} tab="raw" />)
    for (const forbidden of ['should-never-render', 'sk-leaked-secret-123', 'mysql://u:p@db/private', 'approval-browser-secret-123', 'prompt-secret-123', 'session-secret-123']) {
      expect(html).not.toContain(forbidden)
    }
    expect(html).toContain('MASKED')
    expect(html).toContain('原始 / 调试')
    expect(html).toContain('提示词')
    expect(html).toContain('审计')
  })

  it('shows permission guidance when debug prompt and audit are absent', () => {
    const basic: TracePageSnapshot = { traces: [summary], detail: { summary, spans: detail.spans }, timeline, tree, stats }
    const html = renderToStaticMarkup(<TracePageView snapshot={basic} traceId={summary.traceId} tab="raw" />)
    expect(html).toContain('需要 trace.read.debug 权限')
    expect(html).toContain('需要 trace.read.prompt 权限')
    expect(html).toContain('需要 audit.read 权限')
  })
})

describe('trace redaction', () => {
  it('masks nested sensitive keys and text patterns', () => {
    const value = maskTraceValue({ authorization: 'Bearer abc', nested: { apiKey: 'sk-unit-secret-123' }, text: 'approvalToken=approval-unit-secret-123' })
    const serialized = JSON.stringify(value)
    expect(serialized).not.toContain('Bearer abc')
    expect(serialized).not.toContain('sk-unit-secret-123')
    expect(serialized).not.toContain('approval-unit-secret-123')
    expect(maskTraceText('postgresql://u:p@db/x')).toContain('MASKED_DSN')
  })
})
