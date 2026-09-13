import type {
  TraceAccessProfile,
  TraceAuditRecord,
  TraceDebugView,
  TraceDetail,
  TracePromptRecord,
  TraceSpan,
  TraceStats,
  TraceSummary,
  TraceTimelineEvent,
  TraceTree,
  TraceTreeNode,
} from '../../../../shared/industry/trace'
import type { TrustedRequestContext } from '../context'
import { IndustryAgentClientError } from '../clients/industry-agent-client'

interface StoredTrace {
  summary: TraceSummary
  spans: readonly TraceSpan[]
  debug: TraceDebugView
  prompts: readonly TracePromptRecord[]
  audit: readonly TraceAuditRecord[]
  stats: TraceStats
}

export class MockTraceStore {
  readonly #projects = new Map<string, Map<string, StoredTrace>>()

  list(context: TrustedRequestContext): readonly TraceSummary[] {
    const store = this.#projectStore(requireProject(context))
    return [...store.values()]
      .map((item) => structuredClone(item.summary))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  get(context: TrustedRequestContext, traceId: string, access: TraceAccessProfile): TraceDetail {
    const stored = this.#requireTrace(context, traceId)
    return {
      summary: structuredClone(stored.summary),
      spans: stored.spans.map((span) => publicSpan(span, access.debug)),
      ...(access.debug ? { debug: redactTraceValue(stored.debug) as TraceDebugView } : {}),
      ...(access.prompt ? { prompts: stored.prompts.map((item) => ({ ...item, content: redactText(item.content) })) } : {}),
      ...(access.audit ? { audit: redactTraceValue(stored.audit) as readonly TraceAuditRecord[] } : {}),
    }
  }

  timeline(context: TrustedRequestContext, traceId: string, access: TraceAccessProfile): readonly TraceTimelineEvent[] {
    const stored = this.#requireTrace(context, traceId)
    const events: TraceTimelineEvent[] = [{
      eventId: `${traceId}:trace:start`,
      sequenceNo: 1,
      timestamp: stored.summary.startedAt,
      type: 'TRACE_STARTED',
      title: stored.summary.name,
    }]
    let sequenceNo = 2
    for (const span of stored.spans) {
      events.push({
        eventId: `${traceId}:${span.spanId}:start`,
        sequenceNo: sequenceNo++,
        timestamp: span.startedAt,
        spanId: span.spanId,
        type: 'SPAN_STARTED',
        title: span.name,
      })
      events.push({
        eventId: `${traceId}:${span.spanId}:end`,
        sequenceNo: sequenceNo++,
        timestamp: span.completedAt,
        spanId: span.spanId,
        type: span.kind === 'TOOL' ? 'TOOL_CALLED' : span.kind === 'LLM' ? 'LLM_COMPLETED' : 'SPAN_COMPLETED',
        title: `${span.name} · ${span.status}`,
        ...(access.debug && span.error !== undefined ? { detail: redactText(span.error) } : {}),
      })
    }
    if (access.audit) {
      for (const audit of stored.audit) {
        events.push({
          eventId: `${traceId}:${audit.auditId}`,
          sequenceNo: sequenceNo++,
          timestamp: audit.timestamp,
          type: 'AUDIT',
          title: audit.type,
          detail: redactText(audit.detail),
        })
      }
    }
    events.push({
      eventId: `${traceId}:trace:end`,
      sequenceNo: sequenceNo,
      timestamp: stored.summary.completedAt,
      type: 'TRACE_COMPLETED',
      title: `${stored.summary.name} · ${stored.summary.status}`,
    })
    return events
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.sequenceNo - b.sequenceNo)
      .map((event, index) => ({ ...event, sequenceNo: index + 1 }))
  }

  tree(context: TrustedRequestContext, traceId: string, access: TraceAccessProfile): TraceTree {
    const stored = this.#requireTrace(context, traceId)
    const byParent = new Map<string | undefined, TraceSpan[]>()
    for (const span of stored.spans) {
      const siblings = byParent.get(span.parentSpanId) ?? []
      siblings.push(span)
      byParent.set(span.parentSpanId, siblings)
    }
    const build = (span: TraceSpan): TraceTreeNode => ({
      span: publicSpan(span, access.debug),
      children: (byParent.get(span.spanId) ?? []).map(build),
    })
    return {
      traceId,
      roots: (byParent.get(undefined) ?? []).map(build),
    }
  }

  stats(context: TrustedRequestContext, traceId: string): TraceStats {
    return structuredClone(this.#requireTrace(context, traceId).stats)
  }

  #projectStore(projectId: string): Map<string, StoredTrace> {
    let store = this.#projects.get(projectId)
    if (store === undefined) {
      store = seedProject(projectId)
      this.#projects.set(projectId, store)
    }
    return store
  }

  #requireTrace(context: TrustedRequestContext, traceId: string): StoredTrace {
    const projectId = requireProject(context)
    const trace = this.#projectStore(projectId).get(traceId)
    if (trace === undefined) throw new IndustryAgentClientError('TRACE_NOT_FOUND', 'trace not found', 404)
    return trace
  }
}

export function redactTraceValue(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value)
  if (Array.isArray(value)) return value.map(redactTraceValue)
  if (typeof value !== 'object' || value === null) return value
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? '[REDACTED]' : redactTraceValue(item)
  }
  return output
}

export function redactText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/giu, 'Bearer [REDACTED]')
    .replace(/\b(?:mysql|postgres(?:ql)?):\/\/[^\s"']+/giu, '[REDACTED_DSN]')
    .replace(/\bsk-[A-Za-z0-9_-]{6,}/gu, '[REDACTED_API_KEY]')
    .replace(/\bapproval-[A-Za-z0-9_-]{6,}/gu, '[REDACTED_APPROVAL_TOKEN]')
    .replace(/((?:api[-_ ]?key|approval[-_ ]?token|password|cookie|authorization)\s*[:=]\s*)[^\s,;]+/giu, '$1[REDACTED]')
}

function publicSpan(span: TraceSpan, includeDebug: boolean): TraceSpan {
  return {
    spanId: span.spanId,
    ...(span.parentSpanId === undefined ? {} : { parentSpanId: span.parentSpanId }),
    name: span.name,
    kind: span.kind,
    status: span.status,
    startedAt: span.startedAt,
    completedAt: span.completedAt,
    durationMs: span.durationMs,
    ...(span.error === undefined ? {} : { error: redactText(span.error) }),
    ...(includeDebug && span.attributes !== undefined ? { attributes: redactTraceValue(span.attributes) as Readonly<Record<string, unknown>> } : {}),
    ...(includeDebug && span.input !== undefined ? { input: redactTraceValue(span.input) } : {}),
    ...(includeDebug && span.output !== undefined ? { output: redactTraceValue(span.output) } : {}),
  }
}

function isSensitiveKey(key: string): boolean {
  return /authorization|cookie|api[-_]?key|approval[-_]?token|password|secret|dsn|database[-_]?url/iu.test(key)
}

function seedProject(projectId: string): Map<string, StoredTrace> {
  const traces = [
    retrievalTrace(projectId),
    mutationTrace(projectId),
    conversationTrace(projectId),
  ]
  return new Map(traces.map((item) => [item.summary.traceId, item]))
}

function retrievalTrace(projectId: string): StoredTrace {
  const traceId = `trace-${safeId(projectId)}-retrieval-001`
  const startedAt = '2026-09-13T05:00:00.000Z'
  const completedAt = '2026-09-13T05:00:00.185Z'
  const spans: TraceSpan[] = [
    span('span-root', undefined, 'industry.request', 'AGENT', startedAt, completedAt, 185, {
      route: '/tools/query-engineering',
      authorization: 'Bearer trace-root-secret',
      cookie: 'session=trace-cookie-secret',
    }),
    span('span-semantic', 'span-root', 'semantic.parse', 'LLM', '2026-09-13T05:00:00.010Z', '2026-09-13T05:00:00.055Z', 45, {
      model: 'mock-semantic-v1',
      apiKey: 'sk-live-super-secret',
    }, { query: 'K12+300到K12+800左幅有哪些路基工程部位' }, { alignment: 'LEFT', chainageStart: 12300, chainageEnd: 12800 }),
    span('span-retrieval', 'span-root', 'retrieval.hybrid', 'RETRIEVAL', '2026-09-13T05:00:00.060Z', '2026-09-13T05:00:00.135Z', 75, {
      databaseDsn: 'mysql://trace:secret@db.internal:3306/industry',
    }, { projectId, alignment: 'LEFT' }, { candidateCount: 12, finalEntityIds: ['123456789012345678'] }),
    span('span-tool', 'span-root', 'tool.query_engineering_position', 'TOOL', '2026-09-13T05:00:00.140Z', '2026-09-13T05:00:00.175Z', 35, {
      approvalToken: 'approval-private-123456',
    }, { projectId, entityIds: ['123456789012345678'] }, { rows: 1 }),
  ]
  return storedTrace({
    traceId,
    requestId: 'request-retrieval-001',
    projectId,
    kind: 'RETRIEVAL',
    name: '工程部位查询',
    status: 'OK',
    startedAt,
    completedAt,
    durationMs: 185,
    spanCount: spans.length,
  }, spans, {
    request: {
      query: 'K12+300到K12+800左幅有哪些路基工程部位',
      headers: { authorization: 'Bearer request-secret', cookie: 'sid=private-cookie' },
    },
    response: { entityIds: ['123456789012345678'], internalDsn: 'postgresql://u:p@trace-db/trace' },
    toolCalls: [{
      toolCallId: 'tool-call-001',
      name: 'query_engineering_position',
      arguments: { projectId, apiKey: 'sk-tool-secret-123' },
      result: { rows: 1, approvalToken: 'approval-tool-secret-123' },
    }],
  }, [
    { promptId: 'prompt-1', spanId: 'span-semantic', model: 'mock-semantic-v1', role: 'SYSTEM', content: 'Parse engineering query. Authorization: Bearer prompt-secret' },
    { promptId: 'prompt-2', spanId: 'span-semantic', model: 'mock-semantic-v1', role: 'USER', content: 'K12+300到K12+800左幅有哪些路基工程部位 apiKey=sk-prompt-secret-123' },
  ], [
    { auditId: 'trace-audit-1', sequenceNo: 1, type: 'TOOL_READ', actorId: 'user-1', timestamp: '2026-09-13T05:00:00.176Z', detail: 'Read engineering entities. approvalToken=approval-audit-secret-123', metadata: { projectId, cookie: 'audit-cookie-secret' } },
  ], {
    traceId,
    durationMs: 185,
    queryLatencyMs: 75,
    llmCallCount: 1,
    toolCallCount: 1,
    tokenUsage: { inputTokens: 428, outputTokens: 96, totalTokens: 524 },
    spanCount: spans.length,
    errorCount: 0,
  })
}

function mutationTrace(projectId: string): StoredTrace {
  const traceId = `trace-${safeId(projectId)}-mutation-001`
  const startedAt = '2026-09-13T04:50:00.000Z'
  const completedAt = '2026-09-13T04:50:00.092Z'
  const spans: TraceSpan[] = [
    span('span-mutation-root', undefined, 'mutation.confirm', 'MUTATION', startedAt, completedAt, 92, undefined, { digest: `sha256:${'a'.repeat(64)}` }, { status: 'COMMITTED' }),
    span('span-mutation-commit', 'span-mutation-root', 'mutation.mock_commit', 'MUTATION', '2026-09-13T04:50:00.030Z', '2026-09-13T04:50:00.080Z', 50, { approvalToken: 'approval-mutation-private-123' }, { entityId: '123456789012345678' }, { version: 'entity-v18' }),
  ]
  return storedTrace({
    traceId,
    requestId: 'request-mutation-001',
    projectId,
    kind: 'MUTATION',
    name: 'Mock mutation confirmation',
    status: 'OK',
    startedAt,
    completedAt,
    durationMs: 92,
    spanCount: spans.length,
  }, spans, {
    request: { idempotencyKey: 'mutation-confirm-001', digest: `sha256:${'a'.repeat(64)}` },
    response: { status: 'COMMITTED' },
    toolCalls: [],
  }, [], [
    { auditId: 'trace-audit-mutation-1', sequenceNo: 1, type: 'MUTATION_COMMITTED', actorId: 'user-1', timestamp: completedAt, detail: 'Mock commit completed without database DML.', metadata: { projectId } },
  ], {
    traceId,
    durationMs: 92,
    queryLatencyMs: 0,
    llmCallCount: 0,
    toolCallCount: 0,
    tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    spanCount: spans.length,
    errorCount: 0,
  })
}

function conversationTrace(projectId: string): StoredTrace {
  const traceId = `trace-${safeId(projectId)}-conversation-001`
  const startedAt = '2026-09-13T04:40:00.000Z'
  const completedAt = '2026-09-13T04:40:00.130Z'
  const spans: TraceSpan[] = [
    span('span-conversation-root', undefined, 'conversation.turn', 'AGENT', startedAt, completedAt, 130),
    span('span-conversation-llm', 'span-conversation-root', 'assistant.generate', 'LLM', '2026-09-13T04:40:00.020Z', '2026-09-13T04:40:00.115Z', 95, { model: 'mock-industry-v1' }),
  ]
  return storedTrace({
    traceId,
    requestId: 'request-conversation-001',
    projectId,
    kind: 'CONVERSATION',
    name: 'Conversation turn',
    status: 'OK',
    startedAt,
    completedAt,
    durationMs: 130,
    spanCount: spans.length,
  }, spans, { request: { text: '继续看这些' }, response: { text: 'Mock industry response' }, toolCalls: [] }, [
    { promptId: 'prompt-conversation-1', spanId: 'span-conversation-llm', model: 'mock-industry-v1', role: 'USER', content: '继续看这些' },
  ], [], {
    traceId,
    durationMs: 130,
    queryLatencyMs: 0,
    llmCallCount: 1,
    toolCallCount: 0,
    tokenUsage: { inputTokens: 210, outputTokens: 61, totalTokens: 271 },
    spanCount: spans.length,
    errorCount: 0,
  })
}

function storedTrace(
  summary: TraceSummary,
  spans: readonly TraceSpan[],
  debug: TraceDebugView,
  prompts: readonly TracePromptRecord[],
  audit: readonly TraceAuditRecord[],
  stats: TraceStats,
): StoredTrace {
  return { summary, spans, debug, prompts, audit, stats }
}

function span(
  spanId: string,
  parentSpanId: string | undefined,
  name: string,
  kind: TraceSpan['kind'],
  startedAt: string,
  completedAt: string,
  durationMs: number,
  attributes?: Readonly<Record<string, unknown>>,
  input?: unknown,
  output?: unknown,
): TraceSpan {
  return {
    spanId,
    ...(parentSpanId === undefined ? {} : { parentSpanId }),
    name,
    kind,
    status: 'OK',
    startedAt,
    completedAt,
    durationMs,
    ...(attributes === undefined ? {} : { attributes }),
    ...(input === undefined ? {} : { input }),
    ...(output === undefined ? {} : { output }),
  }
}

function safeId(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/gu, '-').slice(0, 48)
  return normalized === '' ? 'project' : normalized
}

function requireProject(context: TrustedRequestContext): string {
  if (context.projectId === null) throw new IndustryAgentClientError('INDUSTRY_PROJECT_REQUIRED', 'active project is required', 409)
  return context.projectId
}
