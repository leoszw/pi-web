import type { Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { RpcClient } from './rpc-client'

export interface BridgeOptions {
  server: Server
  piCommand: string[]
  piCwd: string
}

export function attachBridge(options: BridgeOptions): WebSocketServer {
  const wss = new WebSocketServer({ server: options.server, path: '/ws' })
  wss.on('error', (error) => {
    console.error('[bridge] server error:', error)
  })
  let bridgeId = 0

  wss.on('connection', (ws: WebSocket) => {
    const client = new RpcClient({ command: options.piCommand, cwd: options.piCwd })
    client.start()
    ws.on('error', () => {
      ws.terminate()
    })
    const pending = new Map<string, (response: { type: string } & Record<string, unknown>) => void>()
    // An id is single-use per connection: in-flight ids are correlated via pending,
    // and reuse after completion is rejected instead of silently re-correlated.
    const usedIds = new Set<string>()

    const sendJson = (value: unknown): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value))
    }

    const removeMessage = client.onMessage((message) => {
      if (message.type === 'response') {
        const id = typeof message.id === 'string' ? message.id : ''
        const resolve = pending.get(id)
        if (resolve !== undefined) {
          pending.delete(id)
          resolve(message)
          return
        }
      }
      sendJson(message)
    })

    const removeClose = client.onClose((code) => {
      pending.clear()
      sendJson({ type: 'server_error', message: `pi process exited (code ${code ?? 'unknown'})` })
    })

    ws.on('message', (raw) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(String(raw))
      } catch {
        sendJson({ type: 'server_error', message: 'invalid JSON sent to bridge' })
        return
      }
      if (typeof parsed !== 'object' || parsed === null || typeof (parsed as { type?: unknown }).type !== 'string') {
        sendJson({ type: 'server_error', message: 'missing command type' })
        return
      }
      const command = parsed as { type: string; id?: unknown } & Record<string, unknown>
      const id = typeof command.id === 'string' && command.id !== '' ? command.id : `bridge-${bridgeId++}`
      if (usedIds.has(id)) {
        sendJson({ type: 'server_error', message: 'duplicate request id' })
        return
      }
      usedIds.add(id)
      const payload = { ...command, id }
      pending.set(id, (response) => sendJson(response))
      try {
        client.send(payload)
      } catch (error) {
        pending.delete(id)
        sendJson({ type: 'response', command: command.type, success: false, id, error: String(error) })
      }
    })

    ws.on('close', () => {
      removeMessage()
      removeClose()
      client.kill()
    })
  })

  return wss
}
