import type { IncomingMessage } from 'node:http'

export function parseAllowedOrigins(raw: string | undefined, port: number): ReadonlySet<string> {
  if (raw !== undefined && raw.trim() !== '') {
    return new Set(raw.split(',').map((item) => item.trim()).filter((item) => item !== ''))
  }
  return new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    'http://127.0.0.1:5173',
    'http://localhost:5173',
  ])
}

export function isOriginAllowed(request: IncomingMessage, allowedOrigins: ReadonlySet<string>): boolean {
  const origin = request.headers.origin
  if (origin === undefined) return true
  return allowedOrigins.has(origin)
}
