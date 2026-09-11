import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocket } from 'ws'
import { attachBridge } from '../src/bridge'

const fakePi = fileURLToPath(new URL('./fake-pi.mjs', import.meta.url))

function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - started > timeoutMs) return reject(new Error('waitFor timed out'))
      setTimeout(tick, 25)
    }
    tick()
  })
}

function openSocket(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

async function startBridge(): Promise<{ server: http.Server; ws: WebSocket }> {
  const server = http.createServer()
  attachBridge({ server, piCommand: ['node', fakePi], piCwd: process.cwd() })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const ws = await openSocket(port)
  ws.on('error', () => {})
  return { server, ws }
}

// PI_CODING_AGENT_DIR is re-read on every config call, but setting it in
// beforeEach guarantees it is in place before the server and pi child start.
const originalEnv = process.env.PI_CODING_AGENT_DIR
let agentDir = ''

beforeEach(async () => {
  agentDir = await mkdtemp(join(tmpdir(), 'pi-web-bridge-config-'))
  process.env.PI_CODING_AGENT_DIR = agentDir
})

afterEach(() => {
  if (originalEnv === undefined) delete process.env.PI_CODING_AGENT_DIR
  else process.env.PI_CODING_AGENT_DIR = originalEnv
})

test('config_get_models returns empty providers when models.json is missing', async () => {
  const { server, ws } = await startBridge()
  try {
    const received: ({ type: string } & Record<string, unknown>)[] = []
    ws.on('message', (raw) => received.push(JSON.parse(String(raw))))
    ws.send(JSON.stringify({ id: 'c1', type: 'config_get_models' }))
    await waitFor(() => received.some((m) => m.type === 'response' && m.id === 'c1'))
    const response = received.find((m) => m.type === 'response' && m.id === 'c1')
    assert.equal(response?.success, true)
    assert.equal(response?.command, 'config_get_models')
    const data = response?.data as { providers: Record<string, unknown> }
    assert.deepEqual(data.providers, {})
  } finally {
    ws.close()
    server.close()
  }
})

test('config_save_models persists providers and config_get_models returns them', async () => {
  const { server, ws } = await startBridge()
  try {
    const received: ({ type: string } & Record<string, unknown>)[] = []
    ws.on('message', (raw) => received.push(JSON.parse(String(raw))))
    const providers = {
      custom: {
        baseUrl: 'https://api.example.com/v1',
        api: 'openai-completions',
        apiKey: 'sk-test',
        models: [{ id: 'm1', name: 'Model One' }],
      },
    }
    ws.send(JSON.stringify({ id: 'c2', type: 'config_save_models', providers }))
    await waitFor(() => received.some((m) => m.type === 'response' && m.id === 'c2'))
    const saveResponse = received.find((m) => m.type === 'response' && m.id === 'c2')
    assert.equal(saveResponse?.success, true)
    assert.deepEqual(saveResponse?.data, { saved: true })

    const raw = await readFile(join(agentDir, 'models.json'), 'utf8')
    assert.deepEqual(JSON.parse(raw).providers, providers)

    ws.send(JSON.stringify({ id: 'c3', type: 'config_get_models' }))
    await waitFor(() => received.some((m) => m.type === 'response' && m.id === 'c3'))
    const getResponse = received.find((m) => m.type === 'response' && m.id === 'c3')
    assert.equal(getResponse?.success, true)
    const data = getResponse?.data as { providers: typeof providers }
    assert.deepEqual(data.providers, providers)
  } finally {
    ws.close()
    server.close()
  }
})

test('config_save_models rejects invalid payloads and writes nothing', async () => {
  const { server, ws } = await startBridge()
  try {
    const received: ({ type: string } & Record<string, unknown>)[] = []
    ws.on('message', (raw) => received.push(JSON.parse(String(raw))))
    const providers = { custom: { models: [{ id: 'm1' }] } }
    ws.send(JSON.stringify({ id: 'c4', type: 'config_save_models', providers }))
    await waitFor(() => received.some((m) => m.type === 'response' && m.id === 'c4'))
    const response = received.find((m) => m.type === 'response' && m.id === 'c4')
    assert.equal(response?.success, false)
    assert.match(String(response?.error), /baseUrl must be a string starting with/)
    await assert.rejects(readFile(join(agentDir, 'models.json'), 'utf8'))
  } finally {
    ws.close()
    server.close()
  }
})

test('normal commands still forward to pi alongside config interception', async () => {
  const { server, ws } = await startBridge()
  try {
    const received: ({ type: string } & Record<string, unknown>)[] = []
    ws.on('message', (raw) => received.push(JSON.parse(String(raw))))
    ws.send(JSON.stringify({ id: 's1', type: 'get_state' }))
    await waitFor(() => received.some((m) => m.type === 'response' && m.id === 's1'))
    const response = received.find((m) => m.type === 'response' && m.id === 's1')
    assert.equal(response?.success, true)
    const data = response?.data as { model: { id: string } }
    assert.equal(data.model.id, 'fake-model')
  } finally {
    ws.close()
    server.close()
  }
})
