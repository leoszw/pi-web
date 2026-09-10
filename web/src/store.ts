import type {
  AgentMessage,
  AssistantDelta,
  MessageEndEvent,
  MessageStartEvent,
  MessageUpdateEvent,
  ModelInfo,
  RpcResponse,
  ServerErrorEvent,
  SessionState,
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
  ToolExecutionUpdateEvent,
  UserMessage,
} from '../../shared/protocol'

export interface UserItem {
  kind: 'user'
  key: string
  text: string
}

export interface AssistantItem {
  kind: 'assistant'
  key: string
  text: string
  thinking: string
}

export interface ToolItem {
  kind: 'tool'
  key: string
  toolCallId: string
  name: string
  args: string
  output: string
  status: 'running' | 'done' | 'error'
}

export type ChatItem = UserItem | AssistantItem | ToolItem

export interface ChatState {
  connected: boolean
  streaming: boolean
  sessionId: string | null
  model: ModelInfo | null
  thinkingLevel: string | null
  models: ModelInfo[]
  thinkingLevels: string[]
  items: ChatItem[]
  notice: string | null
}

export type ChatAction =
  | { type: 'connected' }
  | { type: 'disconnected' }
  | { type: 'rpc_response'; response: RpcResponse }
  | { type: 'rpc_event'; event: { type: string } & Record<string, unknown> }
  | { type: 'optimistic_user'; text: string }
  | { type: 'notice_cleared' }

let keyCounter = 0
const nextKey = (prefix: string): string => `${prefix}-${keyCounter++}`

export function reducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'connected':
      return { ...state, connected: true, notice: null }
    case 'disconnected':
      return { ...state, connected: false }
    case 'notice_cleared':
      return { ...state, notice: null }
    case 'optimistic_user':
      return { ...state, items: [...state.items, { kind: 'user', key: nextKey('user'), text: action.text }] }
    case 'rpc_response':
      return applyResponse(state, action.response)
    case 'rpc_event':
      return applyEvent(state, action.event)
  }
}

function applyResponse(state: ChatState, response: RpcResponse): ChatState {
  if (!response.success) {
    const message = typeof response.error === 'string' && response.error !== ''
      ? response.error
      : `RPC failed: ${response.command}`
    return { ...state, notice: message }
  }
  switch (response.command) {
    case 'get_state': {
      const data = response.data as SessionState | undefined
      if (data === undefined) return state
      return {
        ...state,
        model: data.model,
        thinkingLevel: data.thinkingLevel ?? null,
        sessionId: data.sessionId ?? null,
        streaming: data.isStreaming ?? false,
      }
    }
    case 'get_messages': {
      const data = response.data as { messages: AgentMessage[] } | undefined
      if (data?.messages === undefined) return state
      return { ...state, items: rebuildItems(data.messages) }
    }
    case 'get_available_models': {
      const data = response.data as { models: ModelInfo[] } | undefined
      return data?.models !== undefined ? { ...state, models: data.models } : state
    }
    case 'get_available_thinking_levels': {
      const data = response.data as { levels: string[] } | undefined
      return data?.levels !== undefined ? { ...state, thinkingLevels: data.levels } : state
    }
    case 'set_model': {
      const model = response.data as ModelInfo | null | undefined
      return model ? { ...state, model } : state
    }
    default:
      return state
  }
}

function applyEvent(state: ChatState, event: { type: string } & Record<string, unknown>): ChatState {
  switch (event.type) {
    case 'agent_start':
      return { ...state, streaming: true }
    case 'agent_settled':
      return { ...state, streaming: false }
    case 'message_start':
      return applyMessageStart(state, event as unknown as MessageStartEvent)
    case 'message_update':
      return applyUpdate(state, event as unknown as MessageUpdateEvent)
    case 'message_end':
      return applyMessageEnd(state, event as unknown as MessageEndEvent)
    case 'tool_execution_start':
      return applyToolStart(state, event as unknown as ToolExecutionStartEvent)
    case 'tool_execution_update':
      return applyToolUpdate(state, event as unknown as ToolExecutionUpdateEvent)
    case 'tool_execution_end':
      return applyToolEnd(state, event as unknown as ToolExecutionEndEvent)
    case 'server_error':
      return applyServerError(state, event as unknown as ServerErrorEvent)
    default:
      return state
  }
}

function applyMessageStart(state: ChatState, event: MessageStartEvent): ChatState {
  const message = event.message
  if (message === undefined) return state
  if (message.role === 'user') {
    const text = userText(message as UserMessage)
    const last = state.items[state.items.length - 1]
    if (last?.kind === 'user' && last.text === text) return state
    return { ...state, items: [...state.items, { kind: 'user', key: nextKey('user'), text }] }
  }
  if (message.role === 'assistant') {
    return { ...state, items: [...state.items, { kind: 'assistant', key: nextKey('asst'), text: '', thinking: '' }] }
  }
  return state
}

function applyUpdate(state: ChatState, event: MessageUpdateEvent): ChatState {
  const delta = event.assistantMessageEvent as AssistantDelta | undefined
  if (delta === undefined) return state
  const last = state.items[state.items.length - 1]
  if (last?.kind !== 'assistant') return state
  if (delta.type === 'text_delta') {
    return replaceLast(state, { ...last, text: last.text + delta.delta })
  }
  if (delta.type === 'thinking_delta') {
    return replaceLast(state, { ...last, thinking: last.thinking + delta.delta })
  }
  return state
}

function applyMessageEnd(state: ChatState, event: MessageEndEvent): ChatState {
  const message = event.message
  if (message?.role !== 'assistant') return state
  const last = state.items[state.items.length - 1]
  if (last?.kind !== 'assistant') return state
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const thinking = message.content.filter((b) => b.type === 'thinking').map((b) => b.thinking).join('')
  return replaceLast(state, { ...last, text: text !== '' ? text : last.text, thinking: thinking !== '' ? thinking : last.thinking })
}

function applyToolStart(state: ChatState, event: ToolExecutionStartEvent): ChatState {
  const item = {
    kind: 'tool' as const,
    key: `tool-${event.toolCallId}`,
    toolCallId: event.toolCallId,
    name: event.toolName ?? 'tool',
    args: JSON.stringify(event.args ?? {}, null, 2),
    output: '',
    status: 'running' as const,
  }
  return { ...state, items: [...state.items, item] }
}

function applyToolUpdate(state: ChatState, event: ToolExecutionUpdateEvent): ChatState {
  const output = blocksText(event.partialResult)
  return updateTool(state, event.toolCallId, (tool) => ({ ...tool, output }))
}

function applyToolEnd(state: ChatState, event: ToolExecutionEndEvent): ChatState {
  const output = blocksText(event.result)
  const status = event.isError === true ? 'error' as const : 'done' as const
  return updateTool(state, event.toolCallId, (tool) => ({ ...tool, output, status }))
}

function applyServerError(state: ChatState, event: ServerErrorEvent): ChatState {
  const message = typeof event.message === 'string' ? event.message : 'server error'
  return { ...state, notice: message, streaming: false }
}

function replaceLast(state: ChatState, item: ChatItem): ChatState {
  return { ...state, items: [...state.items.slice(0, -1), item] }
}

function updateTool(state: ChatState, toolCallId: string, fn: (tool: ToolItem) => ToolItem): ChatState {
  return { ...state, items: state.items.map((item) => (item.kind === 'tool' && item.toolCallId === toolCallId ? fn(item) : item)) }
}

function userText(message: UserMessage): string {
  if (typeof message.content === 'string') return message.content
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
}

function blocksText(container: unknown): string {
  const content = (container as { content?: { type: string; text?: string }[] } | undefined)?.content ?? []
  return content.map((block) => block.text ?? '').join('')
}

function rebuildItems(messages: AgentMessage[]): ChatItem[] {
  const argsById = new Map<string, string>()
  const items: ChatItem[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      items.push({ kind: 'user', key: nextKey('user'), text: userText(message) })
    } else if (message.role === 'assistant') {
      const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
      const thinking = message.content.filter((b) => b.type === 'thinking').map((b) => b.thinking).join('')
      if (text !== '' || thinking !== '') {
        items.push({ kind: 'assistant', key: nextKey('asst'), text, thinking })
      }
      for (const block of message.content) {
        if (block.type === 'toolCall') argsById.set(block.id, JSON.stringify(block.arguments ?? {}, null, 2))
      }
    } else if (message.role === 'toolResult') {
      items.push({
        kind: 'tool',
        key: `tool-${message.toolCallId}`,
        toolCallId: message.toolCallId,
        name: message.toolName,
        args: argsById.get(message.toolCallId) ?? '',
        output: message.content.map((block) => block.text ?? '').join(''),
        status: message.isError === true ? 'error' : 'done',
      })
    } else if (message.role === 'bashExecution') {
      items.push({
        kind: 'tool',
        key: `bash-${nextKey('bash')}`,
        toolCallId: `bash-${nextKey('bid')}`,
        name: 'bash',
        args: message.command,
        output: message.output,
        status: message.exitCode === 0 ? 'done' : 'error',
      })
    }
  }
  return items
}
