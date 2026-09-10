import type { RpcResponse } from '../../shared/protocol'

export interface RpcSocketHandlers {
  onEvent: (event: { type: string } & Record<string, unknown>) => void
  onStatus: (connected: boolean) => void
}

export class RpcSocket {
  private ws: WebSocket | null = null
  private nextId = 1
  private pending = new Map<string, (response: RpcResponse) => void>()
  private retryDelay = 1000
  private closedByUser = false

  constructor(
    private readonly url: string,
    private readonly handlers: RpcSocketHandlers,
  ) {}

  connect(): void {
    this.closedByUser = false
    this.open()
  }

  private open(): void {
    const ws = new WebSocket(this.url)
    this.ws = ws
    ws.onopen = () => {
      this.retryDelay = 1000
      this.handlers.onStatus(true)
    }
    ws.onmessage = (messageEvent) => {
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
        const resolve = this.pending.get(id)
        if (resolve !== undefined) {
          this.pending.delete(id)
          resolve(record as unknown as RpcResponse)
        }
        return
      }
      this.handlers.onEvent(record as { type: string } & Record<string, unknown>)
    }
    ws.onclose = () => {
      this.handlers.onStatus(false)
      if (!this.closedByUser) {
        setTimeout(() => this.open(), this.retryDelay)
        this.retryDelay = Math.min(this.retryDelay * 2, 10000)
      }
    }
    ws.onerror = () => {
      ws.close()
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
      this.pending.set(id, (response) => {
        clearTimeout(timer)
        resolve(response)
      })
      this.ws?.send(JSON.stringify({ ...command, id }))
    })
  }

  close(): void {
    this.closedByUser = true
    this.ws?.close()
  }
}
