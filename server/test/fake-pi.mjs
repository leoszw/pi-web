import readline from 'node:readline'

const model = {
  id: 'fake-model',
  name: 'Fake Model',
  provider: 'fake',
  api: 'fake-api',
  baseUrl: 'https://fake.invalid',
  reasoning: true,
  input: ['text'],
  contextWindow: 128000,
  maxTokens: 8192,
}

const assistantMessage = {
  role: 'assistant',
  content: [{ type: 'text', text: 'Hello from fake pi' }],
  stopReason: 'stop',
}

const rl = readline.createInterface({ input: process.stdin, terminal: false })
rl.on('line', (line) => {
  if (line.trim() === '') return
  let msg
  try {
    msg = JSON.parse(line)
  } catch {
    return
  }
  const { id, type } = msg
  const write = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')
  const respond = (data) => write({ type: 'response', command: type, success: true, id, data })
  const emit = (event) => write(event)
  switch (type) {
    case 'get_state':
      respond({ model, thinkingLevel: 'medium', isStreaming: false, sessionId: 'fake-session-id' })
      break
    case 'get_messages':
      respond({ messages: [] })
      break
    case 'get_available_models':
      respond({ models: [model] })
      break
    case 'get_available_thinking_levels':
      respond({ levels: ['off', 'minimal', 'medium', 'high'] })
      break
    case 'prompt': {
      emit({ type: 'agent_start' })
      emit({ type: 'message_start', message: { role: 'user', content: msg.message ?? '', timestamp: Date.now() } })
      emit({ type: 'message_start', message: { ...assistantMessage, content: [], timestamp: Date.now() } })
      emit({ type: 'message_update', usage: {}, assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hello from fake pi' } })
      emit({ type: 'message_end', message: assistantMessage })
      emit({ type: 'agent_end' })
      emit({ type: 'agent_settled' })
      respond(null)
      break
    }
    case 'garbage':
      process.stdout.write('this line is not json\n')
      respond({ ok: true })
      break
    case 'die':
      process.exit(1)
      break
    default:
      respond(null)
  }
})
