import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import type { RpcResponse } from '../../shared/protocol'

export interface RpcClientOptions {
  command: string[]
  cwd: string
}

interface Pending {
  resolve: (response: RpcResponse) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

export type RpcMessage = { type: string } & Record<string, unknown>

export class RpcClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private buffer = ''
  private pending = new Map<string, Pending>()
  private nextId = 1
  private messageHandlers: ((message: RpcMessage) => void)[] = []
  private closeHandlers: ((code: number | null) => void)[] = []

  constructor(private readonly options: RpcClientOptions) {}

  start(): void {
    if (this.child !== null) return
    const [cmd, ...args] = this.options.command
    const child = spawn(cmd, [...args, '--mode', 'rpc'], {
      cwd: this.options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => this.handleChunk(chunk))
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => process.stderr.write(`[pi stderr] ${chunk}`))
    child.on('exit', (code) => {
      this.rejectPending('rpc client exited')
      for (const handler of this.closeHandlers) handler(code)
    })
    this.child = child
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk
    for (;;) {
      const index = this.buffer.indexOf('\n')
      if (index === -1) break
      const line = this.buffer.slice(0, index)
      this.buffer = this.buffer.slice(index + 1)
      if (line.trim() === '') continue
      let parsed: unknown
      try {
        parsed = JSON.parse(line)
      } catch {
        console.warn('[rpc] skipped non-JSON line:', line.slice(0, 200))
        continue
      }
      if (typeof parsed !== 'object' || parsed === null) continue
      const record = parsed as { type?: unknown } & Record<string, unknown>
      if (typeof record.type !== 'string') continue
      if (record.type === 'response') this.resolvePending(record as unknown as RpcResponse)
      const message: RpcMessage = record as RpcMessage
      for (const handler of this.messageHandlers) handler(message)
    }
  }

  private resolvePending(response: RpcResponse): void {
    const id = typeof response.id === 'string' ? response.id : ''
    const pending = this.pending.get(id)
    if (pending === undefined) return
    clearTimeout(pending.timer)
    this.pending.delete(id)
    pending.resolve(response)
  }

  private rejectPending(reason: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new Error(reason))
    }
    this.pending.clear()
  }

  send(command: Record<string, unknown>): void {
    if (this.child === null) throw new Error('rpc client not started')
    this.child.stdin.write(JSON.stringify(command) + '\n')
  }

  request(command: Record<string, unknown>, timeoutMs = 60000): Promise<RpcResponse> {
    const id = `req-${this.nextId++}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`rpc request timed out: ${String(command.type)}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.send({ ...command, id })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error as Error)
      }
    })
  }

  onMessage(handler: (message: RpcMessage) => void): () => void {
    this.messageHandlers.push(handler)
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler)
    }
  }

  onClose(handler: (code: number | null) => void): () => void {
    this.closeHandlers.push(handler)
    return () => {
      this.closeHandlers = this.closeHandlers.filter((h) => h !== handler)
    }
  }

  kill(): void {
    if (this.child !== null) {
      this.child.kill()
      this.child = null
    }
    this.rejectPending('rpc client killed')
  }
}
