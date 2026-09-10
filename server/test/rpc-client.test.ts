import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { RpcClient } from '../src/rpc-client'
import type { RpcEvent, RpcResponse } from '../../shared/protocol'

const fakePi = fileURLToPath(new URL('./fake-pi.mjs', import.meta.url))

function startFake(): RpcClient {
  const client = new RpcClient({ command: ['node', fakePi], cwd: process.cwd() })
  client.start()
  return client
}

test('request correlates response by id', async () => {
  const client = startFake()
  try {
    const res = await client.request({ type: 'get_state' })
    assert.ok(res.success)
    assert.equal(res.command, 'get_state')
    const data = res.data as { model: { id: string }; sessionId: string }
    assert.equal(data.model.id, 'fake-model')
    assert.equal(data.sessionId, 'fake-session-id')
  } finally {
    client.kill()
  }
})

test('LF framing: two commands in one write both get responses', async () => {
  const client = startFake()
  try {
    const [r1, r2] = await Promise.all([
      client.request({ type: 'get_state' }),
      client.request({ type: 'get_available_models' }),
    ])
    assert.equal(r1.command, 'get_state')
    assert.equal(r2.command, 'get_available_models')
  } finally {
    client.kill()
  }
})

test('prompt streams events in order', async () => {
  const client = startFake()
  try {
    const events: RpcEvent[] = []
    client.onMessage((msg) => {
      if (msg.type !== 'response') events.push(msg as RpcEvent)
    })
    await client.request({ type: 'prompt', message: 'hi' })
    assert.deepEqual(events.map((e) => e.type), [
      'agent_start',
      'message_start',
      'message_start',
      'message_update',
      'message_end',
      'agent_end',
      'agent_settled',
    ])
  } finally {
    client.kill()
  }
})

test('non-JSON lines are skipped and later responses still arrive', async () => {
  const client = startFake()
  try {
    const res = await client.request({ type: 'garbage' })
    assert.ok(res.success)
  } finally {
    client.kill()
  }
})

test('child exit fires close handler with code', async () => {
  const client = startFake()
  const exited = new Promise<number | null>((resolve) => {
    client.onClose((code) => resolve(code))
  })
  await assert.rejects(client.request({ type: 'die' }), /rpc client exited/)
  assert.equal(await exited, 1)
})

test('spawn error fails fast without crashing', async () => {
  const client = new RpcClient({ command: ['definitely-not-a-real-bin-xyz'], cwd: process.cwd() })
  const closed = new Promise<number | null>((resolve) => {
    client.onClose((code) => resolve(code))
  })
  client.start()
  await assert.rejects(client.request({ type: 'get_state' }), /rpc client errored/)
  assert.equal(await closed, null)
})

test('request times out when the child never responds', async () => {
  const client = startFake()
  try {
    await assert.rejects(client.request({ type: 'hang' }, 50), /timed out/)
  } finally {
    client.kill()
  }
})

test('send before start throws', () => {
  const client = new RpcClient({ command: ['node', fakePi], cwd: process.cwd() })
  assert.throws(() => client.send({ type: 'get_state' }), /not started/)
})

test('response split across two writes is reassembled', async () => {
  const client = startFake()
  try {
    const pending = client.request({ type: 'split' })
    client.send({ type: 'split_end' })
    const res = await pending
    assert.ok(res.success)
    assert.equal((res.data as { partial: boolean }).partial, true)
  } finally {
    client.kill()
  }
})

test('start after kill throws', () => {
  const client = startFake()
  client.kill()
  assert.throws(() => client.start(), /killed/)
})
