import type { RpcResponse } from '../../shared/protocol'

export interface RpcSocketHandlers {
  onEvent: (event: { type: string } & Record<string, unknown>) => void
  onStatus: (connected: boolean) => void
}

interface PendingRequest {
  resolve: (response: RpcResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class RpcSocket {
  private ws: WebSocket | null = null
  private nextId = 1
  private pending = new Map<string, PendingRequest>()
  private retryDelay = 1000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private openedAt = 0
  private closedByUser = false

  constructor(
    private readonly url: string,
    private readonly handlers: RpcSocketHandlers,
  ) {}

  connect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.closedByUser = false
    this.open()
  }

  private open(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    const ws = new WebSocket(this.url)
    const socket = ws
    this.ws = ws
    ws.onopen = () => {
      if (this.ws !== socket) return
      this.openedAt = Date.now()
      this.handlers.onStatus(true)
    }
    ws.onmessage = (messageEvent) => {
      if (this.ws !== socket) return
      let parsed: unknown
      try {
        parsed = JSON.parse(String(messageEvent.data))
      } catch {
        return
      }
      if (typeof parsed !== 'object' || parsed === null) return
      const record = parsed as { type?: unknown; id?: unknown } & Record<string, unknown>
      if (typeof record.type !== 'string') return
      if (record.type === 'response') {
        const id = typeof record.id === 'string' ? record.id : ''
        const entry = this.pending.get(id)
        if (entry !== undefined) {
          this.pending.delete(id)
          clearTimeout(entry.timer)
          entry.resolve(record as unknown as RpcResponse)
        }
        return
      }
      this.handlers.onEvent(record as { type: string } & Record<string, unknown>)
    }
    ws.onclose = () => {
      if (this.ws !== socket) return
      this.handlers.onStatus(false)
      for (const entry of this.pending.values()) {
        clearTimeout(entry.timer)
        entry.reject(new Error('connection closed'))
      }
      this.pending.clear()
      if (!this.closedByUser) {
        if (Date.now() - this.openedAt >= 5000) {
          this.retryDelay = 1000
        } else {
          this.retryDelay = Math.min(this.retryDelay * 2, 10000)
        }
        this.reconnectTimer = setTimeout(() => this.open(), this.retryDelay)
      }
    }
    ws.onerror = () => {
      if (this.ws !== socket) return
      socket.close()
    }
  }

  request(command: Record<string, unknown>, timeoutMs = 60000): Promise<RpcResponse> {
    const id = `web-${this.nextId++}`
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`not connected: ${String(command.type)}`))
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`rpc request timed out: ${String(command.type)}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.ws?.send(JSON.stringify({ ...command, id }))
    })
  }

  close(): void {
    this.closedByUser = true
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.ws?.close()
  }
}
