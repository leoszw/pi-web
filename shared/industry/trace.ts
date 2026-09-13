export type TraceStatus = 'OK' | 'ERROR' | 'ABORTED'
export type TraceKind = 'CONVERSATION' | 'RETRIEVAL' | 'MUTATION' | 'EVALUATION'
export type TraceSpanKind = 'AGENT' | 'LLM' | 'TOOL' | 'RETRIEVAL' | 'MUTATION' | 'SYSTEM'

export interface TraceSummary {
  traceId: string
  requestId: string
  projectId: string
  kind: TraceKind
  name: string
  status: TraceStatus
  startedAt: string
  completedAt: string
  durationMs: number
  spanCount: number
}

export interface TraceSpan {
  spanId: string
  parentSpanId?: string
  name: string
  kind: TraceSpanKind
  status: TraceStatus
  startedAt: string
  completedAt: string
  durationMs: number
  attributes?: Readonly<Record<string, unknown>>
  input?: unknown
  output?: unknown
  error?: string
}

export interface TracePromptRecord {
  promptId: string
  spanId: string
  model: string
  role: 'SYSTEM' | 'USER' | 'ASSISTANT'
  content: string
}

export interface TraceAuditRecord {
  auditId: string
  sequenceNo: number
  type: string
  actorId: string
  timestamp: string
  detail: string
  metadata?: Readonly<Record<string, unknown>>
}

export interface TraceDebugView {
  request: unknown
  response: unknown
  toolCalls: readonly {
    toolCallId: string
    name: string
    arguments: unknown
    result: unknown
  }[]
}

export interface TraceDetail {
  summary: TraceSummary
  spans: readonly TraceSpan[]
  debug?: TraceDebugView
  prompts?: readonly TracePromptRecord[]
  audit?: readonly TraceAuditRecord[]
}

export interface TraceTimelineEvent {
  eventId: string
  sequenceNo: number
  timestamp: string
  spanId?: string
  type: 'TRACE_STARTED' | 'SPAN_STARTED' | 'SPAN_COMPLETED' | 'TOOL_CALLED' | 'LLM_COMPLETED' | 'AUDIT' | 'TRACE_COMPLETED'
  title: string
  detail?: string
}

export interface TraceTreeNode {
  span: TraceSpan
  children: readonly TraceTreeNode[]
}

export interface TraceTree {
  traceId: string
  roots: readonly TraceTreeNode[]
}

export interface TraceTokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface TraceStats {
  traceId: string
  durationMs: number
  queryLatencyMs: number
  llmCallCount: number
  toolCallCount: number
  tokenUsage: TraceTokenUsage
  spanCount: number
  errorCount: number
}

export interface TraceAccessProfile {
  debug: boolean
  prompt: boolean
  audit: boolean
}
