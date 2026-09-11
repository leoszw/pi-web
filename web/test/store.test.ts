import assert from 'node:assert/strict'
import { describe, expect, test } from 'vitest'
import { reducer, type ChatState } from '../src/store'
import type { ModelInfo } from '../../shared/protocol'

const model: ModelInfo = {
  id: 'fake-model', name: 'Fake Model', provider: 'fake', api: 'fake-api',
  baseUrl: 'https://fake.invalid', reasoning: true, input: ['text'],
  contextWindow: 128000, maxTokens: 8192,
}

const base: ChatState = {
  connected: false, streaming: false, sessionId: null, model: null,
  thinkingLevel: null, models: [], thinkingLevels: [], items: [], notice: null,
}

const event = (type: string, extra: Record<string, unknown> = {}) =>
  ({ type: 'rpc_event' as const, event: { type, ...extra } })

test('message_update appends text deltas to last assistant item', () => {
  let state = reducer(base, event('agent_start'))
  state = reducer(state, event('message_start', { message: { role: 'assistant', content: [] } }))
  state = reducer(state, event('message_update', { assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hello' } }))
  state = reducer(state, event('message_update', { assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: ' world' } }))
  expect(state.items).toHaveLength(1)
  const item = state.items[0]
  assert(item.kind === 'assistant')
  expect(item.text).toBe('Hello world')
})

test('agent_settled clears streaming', () => {
  let state = reducer(base, event('agent_start'))
  expect(state.streaming).toBe(true)
  state = reducer(state, event('agent_settled'))
  expect(state.streaming).toBe(false)
})

test('tool events drive tool card lifecycle', () => {
  let state = reducer(base, event('tool_execution_start', { toolCallId: 'c1', toolName: 'bash', args: { command: 'ls' } }))
  const tool = state.items[0]
  assert(tool.kind === 'tool')
  expect(tool.status).toBe('running')
  expect(tool.args).toBe(JSON.stringify({ command: 'ls' }, null, 2))

  state = reducer(state, event('tool_execution_update', { toolCallId: 'c1', partialResult: { content: [{ type: 'text', text: 'partial' }] } }))
  const updated = state.items[0]
  assert(updated.kind === 'tool')
  expect(updated.output).toBe('partial')

  state = reducer(state, event('tool_execution_end', { toolCallId: 'c1', result: { content: [{ type: 'text', text: 'full output' }] }, isError: false }))
  const done = state.items[0]
  assert(done.kind === 'tool')
  expect(done.output).toBe('full output')
  expect(done.status).toBe('done')
})

test('message_end finalizes assistant text authoritatively', () => {
  let state = reducer(base, event('message_start', { message: { role: 'assistant', content: [] } }))
  state = reducer(state, event('message_update', { assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hello wor' } }))
  state = reducer(state, event('message_end', { message: { role: 'assistant', content: [{ type: 'text', text: 'Hello world' }, { type: 'thinking', thinking: 'hmm' }] } }))
  const item = state.items[0]
  assert(item.kind === 'assistant')
  expect(item.text).toBe('Hello world')
  expect(item.thinking).toBe('hmm')
})

test('user message_start dedupes optimistic entry', () => {
  let state = reducer(base, { type: 'optimistic_user', text: 'hi' })
  state = reducer(state, event('message_start', { message: { role: 'user', content: 'hi' } }))
  expect(state.items.filter((i) => i.kind === 'user')).toHaveLength(1)
})

test('get_state response sets model and session', () => {
  const state = reducer(base, {
    type: 'rpc_response',
    response: { type: 'response', command: 'get_state', success: true, data: { model, thinkingLevel: 'high', isStreaming: false, sessionId: 'abc' } },
  })
  expect(state.model?.id).toBe('fake-model')
  expect(state.thinkingLevel).toBe('high')
  expect(state.sessionId).toBe('abc')
})

test('get_messages rebuilds items with tool args from assistant toolCalls', () => {
  const state = reducer(base, {
    type: 'rpc_response',
    response: {
      type: 'response', command: 'get_messages', success: true,
      data: {
        messages: [
          { role: 'user', content: 'run ls' },
          { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'ls' } }] },
          { role: 'toolResult', toolCallId: 'c1', toolName: 'bash', content: [{ type: 'text', text: 'file.txt' }], isError: false },
        ],
      },
    },
  })
  expect(state.items).toHaveLength(2)
  const tool = state.items[1]
  assert(tool.kind === 'tool')
  expect(tool.args).toBe(JSON.stringify({ command: 'ls' }, null, 2))
  expect(tool.output).toBe('file.txt')
  expect(tool.status).toBe('done')
})

test('failed response sets notice', () => {
  const state = reducer(base, {
    type: 'rpc_response',
    response: { type: 'response', command: 'prompt', success: false, error: 'no model' },
  })
  expect(state.notice).toBe('no model')
})

test('thinking deltas accumulate into the thinking field', () => {
  let state = reducer(base, event('message_start', { message: { role: 'assistant', content: [] } }))
  state = reducer(state, event('message_update', { assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: 'a' } }))
  state = reducer(state, event('message_update', { assistantMessageEvent: { type: 'thinking_delta', contentIndex: 0, delta: 'b' } }))
  const item = state.items[0]
  assert(item.kind === 'assistant')
  expect(item.thinking).toBe('ab')
  expect(item.text).toBe('')
})

test('connected clears notice and disconnected flips state', () => {
  let state = reducer({ ...base, notice: 'boom' }, { type: 'connected' })
  expect(state.connected).toBe(true)
  expect(state.notice).toBeNull()
  state = reducer(state, { type: 'disconnected' })
  expect(state.connected).toBe(false)
})

test('server_error sets notice and stops streaming', () => {
  let state = reducer(base, event('agent_start'))
  state = reducer(state, event('server_error', { message: 'pi died' }))
  expect(state.notice).toBe('pi died')
  expect(state.streaming).toBe(false)
})

test('tool update and end for unknown toolCallId are no-ops', () => {
  const before = reducer(base, event('agent_start'))
  const after = reducer(before, event('tool_execution_update', { toolCallId: 'ghost', partialResult: { content: [{ type: 'text', text: 'x' }] } }))
  expect(after).toBe(before)
  const afterEnd = reducer(before, event('tool_execution_end', { toolCallId: 'ghost', result: { content: [] }, isError: false }))
  expect(afterEnd).toBe(before)
})

test('duplicate tool_execution_start does not create a second card', () => {
  let state = reducer(base, event('tool_execution_start', { toolCallId: 'c1', toolName: 'bash', args: {} }))
  state = reducer(state, event('tool_execution_start', { toolCallId: 'c1', toolName: 'bash', args: {} }))
  expect(state.items).toHaveLength(1)
})

test('message_end with empty content removes the empty assistant item', () => {
  let state = reducer(base, event('message_start', { message: { role: 'assistant', content: [] } }))
  state = reducer(state, event('message_end', { message: { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: {} }] } }))
  expect(state.items).toHaveLength(0)
})

test('delta arriving without a trailing assistant item creates one', () => {
  let state = reducer(base, event('tool_execution_start', { toolCallId: 'c1', toolName: 'bash', args: {} }))
  state = reducer(state, event('message_update', { assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'resumed' } }))
  const item = state.items[1]
  assert(item.kind === 'assistant')
  expect(item.text).toBe('resumed')
})

test('prompt_failed removes the matching optimistic user item', () => {
  let state = reducer(base, { type: 'optimistic_user', text: 'hello' })
  state = reducer(state, event('tool_execution_start', { toolCallId: 'c1', toolName: 'bash', args: {} }))
  state = reducer(state, { type: 'prompt_failed', text: 'hello' })
  expect(state.items.filter((i) => i.kind === 'user')).toHaveLength(0)
  expect(state.items).toHaveLength(1)
})
