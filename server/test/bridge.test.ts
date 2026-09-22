import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
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

function openSocket(port: number, origin?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url = `ws://127.0.0.1:${port}/ws`
    const ws = origin === undefined ? new WebSocket(url) : new WebSocket(url, { origin })
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

test('bridge forwards commands, responses, and events over WebSocket', async () => {
  const server = http.createServer()
  attachBridge({ server, piCommand: ['node', fakePi], piCwd: process.cwd() })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const ws = await openSocket(port)
  ws.on('error', () => {})
  try {
    const received: ({ type: string } & Record<string, unknown>)[] = []
    ws.on('message', (raw) => received.push(JSON.parse(String(raw))))

    ws.send(JSON.stringify({ id: 'w1', type: 'get_state' }))
    await waitFor(() => received.some((m) => m.type === 'response' && m.id === 'w1'))
    const stateResponse = received.find((m) => m.type === 'response' && m.id === 'w1')
    assert.equal(stateResponse?.success, true)

    ws.send(JSON.stringify({ id: 'w2', type: 'prompt', message: 'hello' }))
    await waitFor(() => received.some((m) => m.type === 'agent_settled'))
    assert.ok(received.some((m) => m.type === 'message_update'))
    assert.ok(received.some((m) => m.type === 'response' && m.id === 'w2'))
  } finally {
    ws.close()
    server.close()
  }
})

test('local bridge rejects untrusted browser origins when an allowlist is configured', async () => {
  const server = http.createServer()
  attachBridge({
    server,
    piCommand: ['node', fakePi],
    piCwd: process.cwd(),
    mode: 'local',
    allowedOrigins: new Set(['http://127.0.0.1:5173']),
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  try {
    await assert.rejects(openSocket(port, 'https://evil.example'), /Unexpected server response: 403/)
    const trusted = await openSocket(port, 'http://127.0.0.1:5173')
    trusted.close()
  } finally {
    server.close()
  }
})

test('bridge reports pi exit as server_error', async () => {
  const server = http.createServer()
  attachBridge({ server, piCommand: ['node', fakePi], piCwd: process.cwd() })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const ws = await openSocket(port)
  ws.on('error', () => {})
  try {
    const received: ({ type: string } & Record<string, unknown>)[] = []
    ws.on('message', (raw) => received.push(JSON.parse(String(raw))))
    ws.send(JSON.stringify({ id: 'd1', type: 'die' }))
    await waitFor(() => received.some((m) => m.type === 'server_error'))
    assert.ok(String(received.find((m) => m.type === 'server_error')?.message).includes('exited'))
  } finally {
    ws.close()
    server.close()
  }
})

test('bridge rejects duplicate request ids', async () => {
  const server = http.createServer()
  attachBridge({ server, piCommand: ['node', fakePi], piCwd: process.cwd() })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const ws = await openSocket(port)
  ws.on('error', () => {})
  try {
    const received: ({ type: string } & Record<string, unknown>)[] = []
    ws.on('message', (raw) => received.push(JSON.parse(String(raw))))
    ws.send(JSON.stringify({ id: 'dup', type: 'get_state' }))
    await waitFor(() => received.some((m) => m.type === 'response' && m.id === 'dup'))
    ws.send(JSON.stringify({ id: 'dup', type: 'get_state' }))
    await waitFor(() => received.some((m) => m.type === 'server_error'))
    assert.ok(String(received.find((m) => m.type === 'server_error')?.message).includes('duplicate'))
  } finally {
    ws.close()
    server.close()
  }
})
