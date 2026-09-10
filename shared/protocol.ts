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
  | { type: 'text_start' | 'text_end' | 'thinking_start' | 'thinking_end'; contentIndex: number; content?: string }
  | { type: 'text_delta' | 'thinking_delta' | 'toolcall_delta'; contentIndex: number; delta: string }
  | { type: 'toolcall_start'; contentIndex: number; id: string; toolName: string }
  | { type: 'toolcall_end'; contentIndex: number; toolCall: { id: string; name: string; arguments: Record<string, unknown> } }

export interface RpcResponse {
  type: 'response'
  command: string
  success: boolean
  id?: string
  data?: unknown
  error?: string
}

export interface RpcEvent {
  type: string
  [key: string]: unknown
}

export interface SessionState {
  model: ModelInfo | null
  thinkingLevel: string
  isStreaming: boolean
  sessionId?: string
  sessionFile?: string
  messageCount?: number
}
