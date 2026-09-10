// Deliberately used subset of pi's RPC surface (see packages/coding-agent/docs/rpc.md), not the full protocol.

export interface ModelInfo {
  id: string
  name: string
  api: string
  provider: string
  baseUrl: string
  reasoning: boolean
  input: string[]
  contextWindow: number
  maxTokens: number
  cost?: { input: number; output: number; cacheRead: number; cacheWrite: number }
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'toolCall'; id: string; name: string; arguments: Record<string, unknown> }

export interface UserMessage {
  role: 'user'
  content: string | ContentBlock[]
  timestamp?: number
}

export interface AssistantMessage {
  role: 'assistant'
  content: ContentBlock[]
  provider?: string
  model?: string
  stopReason?: string
  timestamp?: number
}

export interface ToolResultMessage {
  role: 'toolResult'
  toolCallId: string
  toolName: string
  content: { type: string; text?: string }[]
  isError?: boolean
  timestamp?: number
}

export interface BashExecutionMessage {
  role: 'bashExecution'
  command: string
  output: string
  exitCode: number
  cancelled: boolean
  truncated: boolean
  timestamp?: number
}

export type AgentMessage = UserMessage | AssistantMessage | ToolResultMessage | BashExecutionMessage

export type AssistantDelta =
  // text_end/thinking_end carry content; the start variants do not.
  | { type: 'text_start' | 'text_end' | 'thinking_start' | 'thinking_end'; contentIndex: number; content?: string }
  | { type: 'text_delta' | 'thinking_delta' | 'toolcall_delta'; contentIndex: number; delta: string }
  | { type: 'toolcall_start'; contentIndex: number; id: string; toolName: string }
  | { type: 'toolcall_end'; contentIndex: number; toolCall: { id: string; name: string; arguments: Record<string, unknown> } }

export type RpcResponse =
  | { type: 'response'; command: string; success: true; id?: string; data?: unknown }
  | { type: 'response'; command: string; success: false; id?: string; error?: string }

export interface RpcEvent {
  type: string
  [key: string]: unknown
}

export interface MessageStartEvent {
  type: 'message_start'
  message: AgentMessage
}

export interface MessageUpdateEvent {
  type: 'message_update'
  assistantMessageEvent: AssistantDelta
}

export interface MessageEndEvent {
  type: 'message_end'
  message: AgentMessage
}

export interface ToolExecutionStartEvent {
  type: 'tool_execution_start'
  toolCallId: string
  toolName: string
  args?: Record<string, unknown>
}

export interface ToolExecutionUpdateEvent {
  type: 'tool_execution_update'
  toolCallId: string
  toolName?: string
  partialResult?: { content: { type: string; text?: string }[] }
}

export interface ToolExecutionEndEvent {
  type: 'tool_execution_end'
  toolCallId: string
  result?: { content: { type: string; text?: string }[] }
  isError?: boolean
}

export interface ServerErrorEvent {
  type: 'server_error'
  message?: string
}

export type KnownRpcEvent =
  | { type: 'agent_start' }
  | { type: 'agent_settled' }
  | MessageStartEvent
  | MessageUpdateEvent
  | MessageEndEvent
  | ToolExecutionStartEvent
  | ToolExecutionUpdateEvent
  | ToolExecutionEndEvent
  | ServerErrorEvent

export interface SessionState {
  model: ModelInfo | null
  thinkingLevel: string
  isStreaming: boolean
  sessionId?: string
  sessionFile?: string
  messageCount?: number
}
