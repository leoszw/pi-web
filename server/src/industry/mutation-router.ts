import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ConfirmMutationRequest, RejectMutationRequest } from '../../../shared/industry/mutation'
import type { IndustryAgentClient } from './clients/industry-agent-client'
import { IndustryAgentClientError } from './clients/industry-agent-client'
import type { TrustedRequestContext } from './context'
import { RequestBodyError, readJsonBody } from '../security/request-limits'

export interface MutationRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  context: TrustedRequestContext
  client: IndustryAgentClient
  bodyLimitBytes: number
}

export async function handleMutationRoute(options: MutationRouteOptions): Promise<boolean> {
  const path = options.url.pathname
  if (!path.startsWith('/api/industry/v1/mutations')) return false

  if (path === '/api/industry/v1/mutations' && options.request.method === 'GET') {
    return sendData(options.response, { operations: await options.client.listMutations(options.context) })
  }

  if (path === '/api/industry/v1/mutations/reconciliation' && options.request.method === 'GET') {
    return sendData(options.response, await options.client.listMutationReconciliation(options.context))
  }

  const confirmMatch = path.match(/^\/api\/industry\/v1\/mutations\/([^/]+)\/confirm$/u)
  if (confirmMatch !== null && options.request.method === 'POST') {
    const operationId = decodeSegment(confirmMatch[1])
    const idempotencyKey = requireIdempotencyKey(options.request)
    const body = await readJsonBody(options.request, options.bodyLimitBytes)
    const operation = await options.client.confirmMutation(
      options.context,
      operationId,
      parseConfirmRequest(body),
      idempotencyKey,
      options.requestId,
    )
    return sendData(options.response, operation)
  }

  const rejectMatch = path.match(/^\/api\/industry\/v1\/mutations\/([^/]+)\/reject$/u)
  if (rejectMatch !== null && options.request.method === 'POST') {
    const operationId = decodeSegment(rejectMatch[1])
    const body = await readJsonBody(options.request, options.bodyLimitBytes)
    return sendData(options.response, await options.client.rejectMutation(
      options.context,
      operationId,
      parseRejectRequest(body),
      options.requestId,
    ))
  }

  const auditMatch = path.match(/^\/api\/industry\/v1\/mutations\/([^/]+)\/audit$/u)
  if (auditMatch !== null && options.request.method === 'GET') {
    return sendData(options.response, await options.client.getMutationAudit(options.context, decodeSegment(auditMatch[1])))
  }

  const detailMatch = path.match(/^\/api\/industry\/v1\/mutations\/([^/]+)$/u)
  if (detailMatch !== null && options.request.method === 'GET') {
    return sendData(options.response, await options.client.getMutation(options.context, decodeSegment(detailMatch[1])))
  }

  return false
}

function parseConfirmRequest(input: unknown): ConfirmMutationRequest {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['digest', 'explicitConfirmation'])
  if (typeof record.digest !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(record.digest)) {
    throw new RequestBodyError('INVALID_JSON', 'digest must be a sha256:<64 hex> string', 400)
  }
  if (record.explicitConfirmation !== true) {
    throw new RequestBodyError('INVALID_JSON', 'explicitConfirmation must be true', 400)
  }
  return { digest: record.digest, explicitConfirmation: true }
}

function parseRejectRequest(input: unknown): RejectMutationRequest {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['reason'])
  if (record.reason === undefined) return {}
  if (typeof record.reason !== 'string' || record.reason.trim() === '' || record.reason.length > 500) {
    throw new RequestBodyError('INVALID_JSON', 'reason must be a non-empty string up to 500 characters', 400)
  }
  return { reason: record.reason.trim() }
}

function requireIdempotencyKey(request: IncomingMessage): string {
  const value = request.headers['idempotency-key']
  if (typeof value !== 'string' || value.trim() === '' || value.length > 200) {
    throw new IndustryAgentClientError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required for mutation confirmation', 400)
  }
  return value.trim()
}

function requireRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new RequestBodyError('INVALID_JSON', 'request body must be an object', 400)
  }
  return input as Record<string, unknown>
}

function assertOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed)
  const unexpected = Object.keys(record).filter((key) => !allowedSet.has(key))
  if (unexpected.length > 0) {
    throw new RequestBodyError('INVALID_JSON', `unexpected request fields: ${unexpected.join(', ')}`, 400)
  }
}

function decodeSegment(value: string | undefined): string {
  if (value === undefined) throw new RequestBodyError('INVALID_JSON', 'missing path segment', 400)
  try {
    return decodeURIComponent(value)
  } catch {
    throw new RequestBodyError('INVALID_JSON', 'invalid path encoding', 400)
  }
}

function sendData(response: ServerResponse, data: unknown, statusCode = 200): true {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify({ apiVersion: 'industry-api-v1', data }))
  return true
}
