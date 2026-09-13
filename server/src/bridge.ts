import type { IncomingMessage, Server } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import type { PiWebMode } from '../../shared/industry/common'
import type { PrincipalProvider } from './industry/auth'
import { isOriginAllowed } from './security/origin'
import { InMemoryRateLimiter } from './security/rate-limit'
import { RpcClient } from './rpc-client'
import { readModelsConfig, saveModelsConfig, validateModelsConfig } from './models-config'
import { redactModelsConfigForControlPlane } from './industry/models-config-security'

/**
 * Appends --continue after the base args so the fresh pi child resumes the most
 * recent session (pi falls back to a new session when none exists).
 */
export function buildSpawnArgs(baseArgs: string[], continueSession: boolean): string[] {
  return continueSession ? [...baseArgs, '--continue'] : [...baseArgs]
}

export function shouldContinueSession(mode: PiWebMode, requestUrl: string | undefined): boolean {
  if (mode !== 'local') return false
  return new URL(requestUrl ?? '/', 'http://localhost').searchParams.get('continue') === '1'
}

export interface BridgeOptions {
  server: Server
  piCommand: string[]
  piCwd: string
  mode?: PiWebMode
  allowedOrigins?: ReadonlySet<string>
  principalProvider?: PrincipalProvider
  rateLimiter?: InMemoryRateLimiter
}

export function attachBridge(options: BridgeOptions): WebSocketServer {
  const mode = options.mode ?? 'local'
  if (mode === 'control-plane' && (options.allowedOrigins === undefined || options.principalProvider === undefined)) {
    throw new Error('control-plane bridge requires allowedOrigins and principalProvider')
  }
  const rateLimiter = options.rateLimiter ?? new InMemoryRateLimiter({ readLimit: 240, writeLimit: 120 })
  const connectionKeys = new WeakMap<IncomingMessage, string>()
  const wss = new WebSocketServer({
    server: options.server,
    path: '/ws',
    maxPayload: mode === 'control-plane' ? 256 * 1024 : 100 * 1024 * 1024,
    verifyClient: mode === 'control-plane'
      ? (info, done) => {
          const allowedOrigins = options.allowedOrigins!
          const principalProvider = options.principalProvider!
          if (!isOriginAllowed(info.req, allowedOrigins)) {
            done(false, 403, 'Forbidden')
            return
          }
          void principalProvider.getPrincipal(info.req).then((principal) => {
            const allowed = principal.permissions.includes('coding.admin') || principal.permissions.includes('coding.chat')
            if (!allowed) {
              done(false, 403, 'Forbidden')
              return
            }
            const key = `${principal.tenantId}\u0000${principal.userId}\u0000${principal.sessionId}`
            const decision = rateLimiter.consume(`upgrade\u0000${key}`, true)
            if (!decision.allowed) {
              done(false, 429, 'Too Many Requests')
              return
            }
            connectionKeys.set(info.req, key)
            done(true)
          }).catch(() => done(false, 401, 'Unauthorized'))
        }
      : undefined,
  })
  wss.on('error', (error) => {
    console.error('[bridge] server error:', error)
  })
  let bridgeId = 0

  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    const continueSession = shouldContinueSession(mode, request.url)
    const connectionKey = connectionKeys.get(request)
    connectionKeys.delete(request)
    if (mode === 'control-plane' && connectionKey === undefined) {
      ws.close(1008, 'missing authenticated websocket context')
      return
    }
    const client = new RpcClient({ command: buildSpawnArgs(options.piCommand, continueSession), cwd: options.piCwd })
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

    // Config commands are served by the bridge itself (never forwarded to pi).
    // Control-plane mode is deliberately read-only and redacts provider secrets.
    const respondConfig = async (command: string, id: string, frame: Record<string, unknown>): Promise<void> => {
      if (command === 'config_get_models') {
        const result = await readModelsConfig()
        if ('config' in result) {
          const config = mode === 'control-plane' ? redactModelsConfigForControlPlane(result.config) : result.config
          sendJson({ type: 'response', command, id, success: true, data: config })
        } else {
          sendJson({ type: 'response', command, id, success: false, error: result.error })
        }
        return
      }
      if (mode === 'control-plane') {
        sendJson({
          type: 'response',
          command,
          id,
          success: false,
          error: 'model config writes are disabled in control-plane mode',
        })
        return
      }
      // frame is the full ws command; its `providers` field is the map to validate.
      const verdict = validateModelsConfig(frame)
      if (!verdict.ok) {
        sendJson({ type: 'response', command, id, success: false, error: verdict.error })
        return
      }
      try {
        await saveModelsConfig(verdict.value)
        sendJson({ type: 'response', command, id, success: true, data: { saved: true } })
      } catch (error) {
        sendJson({ type: 'response', command, id, success: false, error: String(error) })
      }
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
      if (mode === 'control-plane') {
        const decision = rateLimiter.consume(`message\u0000${connectionKey!}`, true)
        if (!decision.allowed) {
          sendJson({ type: 'server_error', message: 'control-plane websocket message rate exceeded' })
          ws.close(1008, 'rate limit exceeded')
          return
        }
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(String(raw))
      } catch {
        sendJson({ type: 'server_error', message: 'invalid JSON sent to bridge' })
        return
      }
      if (typeof parsed !== 'object' || parsed === null || typeof (parsed as { type?: unknown }).type !== 'string') {
        sendJson({ type: 'server_error', message: 'missing command type')
        return
      }
      const command = parsed as { type: string; id?: unknown } & Record<string, unknown>
      const id = typeof command.id === 'string' && command.id !== '' ? command.id : `bridge-${bridgeId++}`
      if (usedIds.has(id)) {
        sendJson({ type: 'server_error', message: 'duplicate request id' })
        return
      }
      usedIds.add(id)
      if (command.type === 'config_get_models' || command.type === 'config_save_models') {
        respondConfig(command.type, id, command).catch((error: unknown) => {
          sendJson({ type: 'response', command: command.type, success: false, id, error: String(error) })
        })
        return
      }
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
