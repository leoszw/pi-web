export const DEFAULT_JSON_BODY_LIMIT_BYTES = 64 * 1024
export const DEFAULT_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024

import type { IncomingMessage } from 'node:http'

export class RequestBodyError extends Error {
  readonly code: 'INVALID_JSON' | 'REQUEST_TOO_LARGE'
  readonly statusCode: number

  constructor(code: 'INVALID_JSON' | 'REQUEST_TOO_LARGE', message: string, statusCode: number) {
    super(message)
    this.name = 'RequestBodyError'
    this.code = code
    this.statusCode = statusCode
  }
}

export async function readJsonBody(request: IncomingMessage, limitBytes: number): Promise<unknown> {
  const contentLength = request.headers['content-length']
  if (contentLength !== undefined) {
    const parsed = Number(contentLength)
    if (Number.isFinite(parsed) && parsed > limitBytes) {
      throw new RequestBodyError('REQUEST_TOO_LARGE', 'request body exceeds configured limit', 413)
    }
  }

  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.byteLength
    if (total > limitBytes) {
      throw new RequestBodyError('REQUEST_TOO_LARGE', 'request body exceeds configured limit', 413)
    }
    chunks.push(buffer)
  }

  if (total === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new RequestBodyError('INVALID_JSON', 'request body must be valid JSON', 400)
  }
}
