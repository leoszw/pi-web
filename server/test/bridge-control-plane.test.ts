import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { WebSocket } from 'ws'
import { attachBridge, shouldContinueSession } from '../src/bridge'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'

const fakePi = fileURLToPath(new URL('./fake-pi.mjs', import.meta.url))

function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = (): void => {
      if (predicate()) {
        resolve()
        return
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('waitFor timed out'))
        return
      }
      setTimeout(tick, 25)
    }
    tick()
  })
}

async function openSocket(port: number, origin = 'http://127.0.0.1'): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin })
    ws.once('open', () => resolve(ws))
    ws.once('error', reject)
  })
}

function principal(permissions: readonly string[]): AuthPrincipal {
  return {
    subject: 'subject-coding',
    userId: 'user-coding',
    tenantId: 'tenant-1',
    companyIds: ['company-1'],
    roles: ['developer'],
    permissions,
    sessionId: 'session-coding',
  }
}

test('control-plane config reads redact secrets and config writes are disabled', async () => {
  const agentDir = await mkdtemp(join(tmpdir(), 'pi-web-control-plane-'))
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR
  process.env.PI_CODING_AGENT_DIR = agentDir

  await writeFile(join(agentDir, 'models.json'), JSON.stringify({
    providers: {
      custom: {
        api: 'openai-completions',
        apiKey: 'sk-never-return-this',
        Authorization: 'Bearer never-return-this',
        models: [{ id: 'm1' }],
      },
    },
  }))

  const server = http.createServer()
  attachBridge({
    server,
    piCommand: ['node', fakePi],
    piCwd: process.cwd(),
    mode: 'control-plane',
    allowedOrigins: new Set(['http://127.0.0.1']),
    principalProvider: new MockPrincipalProvider(principal(['coding.chat'])),
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  const ws = await openSocket(port)
  ws.on('error', () => {})

  try {
    const received: ({ type: string } & Record<string, unknown>)[] = []
    ws.on('message', (raw) => received.push(JSON.parse(String(raw))))

    ws.send(JSON.stringify({ id: 'read-1', type: 'config_get_models' }))
    await waitFor(() => received.some((message) => message.id === 'read-1'))
    const readResponse = received.find((message) => message.id === 'read-1')
    assert.equal(readResponse?.success, true)
    const serialized = JSON.stringify(readResponse?.data)
    assert.equal(serialized.includes('sk-never-return-this'), false)
    assert.equal(serialized.includes('Bearer never-return-this'), false)
    assert.equal(serialized.includes('"apiKeyConfigured":true'), true)

    ws.send(JSON.stringify({
      id: 'write-1',
      type: 'config_save_models',
      providers: { injected: { api: 'x', apiKey: 'new-secret', models: [] } },
    }))
    await waitFor(() => received.some((message) => message.id === 'write-1'))
    const writeResponse = received.find((message) => message.id === 'write-1')
    assert.equal(writeResponse?.success, false)
    assert.match(String(writeResponse?.error), /disabled in control-plane mode/)

    const persisted = await readFile(join(agentDir, 'models.json'), 'utf8')
    assert.equal(persisted.includes('new-secret'), false)
    assert.equal(persisted.includes('sk-never-return-this'), true)
  } finally {
    ws.close()
    server.close()
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir
  }
})

test('control-plane websocket rejects untrusted origin and missing coding permission before connection', async () => {
  const server = http.createServer()
  attachBridge({
    server,
    piCommand: ['node', fakePi],
    piCwd: process.cwd(),
    mode: 'control-plane',
    allowedOrigins: new Set(['http://127.0.0.1']),
    principalProvider: new MockPrincipalProvider(principal([])),
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  try {
    await assert.rejects(openSocket(port), /Unexpected server response: 403/)
    await assert.rejects(openSocket(port, 'https://evil.example'), /Unexpected server response: 403/)
  } finally {
    server.close()
  }
})

test('control-plane never resumes the shared most-recent coding session', () => {
  assert.equal(shouldContinueSession('local', '/ws?continue=1'), true)
  assert.equal(shouldContinueSession('local', '/ws'), false)
  assert.equal(shouldContinueSession('control-plane', '/ws?continue=1'), false)
})
