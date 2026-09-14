import type { IncomingMessage, ServerResponse } from 'node:http'
import type { StartTraceEvalRunRequest, TraceEvalVariant } from '../../../../shared/industry/eval/trace'
import type { AuthPrincipal } from '../auth'
import type { TrustedRequestContext } from '../context'
import { RequestBodyError, readJsonBody } from '../../security/request-limits'
import { EvaluationClientError, type EvaluationClient } from './evaluation-client'

export interface TraceEvalRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: EvaluationClient
  bodyLimitBytes: number
}

export async function handleTraceEvalRoute(options: TraceEvalRouteOptions): Promise<boolean> {
  const path = options.url.pathname
  if (!path.startsWith('/api/industry/v1/eval/trace')) return false

  try {
    if (path === '/api/industry/v1/eval/trace/cases' && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listTraceEvalCases(options.context))
    }

    if (path === '/api/industry/v1/eval/trace/runs' && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listTraceEvalRuns(options.context))
    }

    if (path === '/api/industry/v1/eval/trace/runs' && options.request.method === 'POST') {
      requirePermission(options.principal, 'eval.run')
      const body = await readJsonBody(options.request, options.bodyLimitBytes)
      return sendData(options.response, await options.client.startTraceEvalRun(options.context, parseStartTraceEvalRunRequest(body)), 201)
    }

    const observationsMatch = path.match(/^\/api\/industry\/v1\/eval\/trace\/runs\/([^/]+)\/observations$/u)
    if (observationsMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listTraceEvalObservations(options.context, decodeSegment(observationsMatch[1])))
    }

    const failuresMatch = path.match(/^\/api\/industry\/v1\/eval\/trace\/runs\/([^/]+)\/failures$/u)
    if (failuresMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listTraceEvalFailures(options.context, decodeSegment(failuresMatch[1])))
    }

    const runMatch = path.match(/^\/api\/industry\/v1\/eval\/trace\/runs\/([^/]+)$/u)
    if (runMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.getTraceEvalRun(options.context, decodeSegment(runMatch[1])))
    }

    return false
  } catch (error) {
    if (error instanceof TraceEvalAccessError || error instanceof EvaluationClientError || error instanceof RequestBodyError) {
      sendError(options.response, options.requestId, error.code, error.message, error.statusCode)
      return true
    }
    throw error
  }
}

function parseStartTraceEvalRunRequest(input: unknown): StartTraceEvalRunRequest {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['datasetId', 'variantId'])
  return {
    datasetId: requireNonEmptyString(record.datasetId, 'datasetId'),
    variantId: parseVariant(record.variantId),
  }
}

function parseVariant(value: unknown): TraceEvalVariant {
  if (value === 'trace-broken-v0' || value === 'trace-guarded-v1') return value
  throw new RequestBodyError('INVALID_JSON', 'variantId must be trace-broken-v0 or trace-guarded-v1', 400)
}

function requirePermission(principal: AuthPrincipal, permission: 'eval.read' | 'eval.run'): void {
  if (principal.permissions.includes('eval.admin') || principal.permissions.includes(permission)) return
  throw new TraceEvalAccessError('EVAL_ACCESS_DENIED', `missing permission: ${permission}`, 403)
}

class TraceEvalAccessError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(code: string, message: string, statusCode: number) {
    super(message)
    this.name = 'TraceEvalAccessError'
    this.code = code
    this.statusCode = statusCode
  }
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
  if (unexpected.length > 0) throw new RequestBodyError('INVALID_JSON', `unexpected request fields: ${unexpected.join(', ')}`, 400)
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new RequestBodyError('INVALID_JSON', `${field} must be a non-empty string`, 400)
  return value
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
  response.end(JSON.stringify({ apiVersion: 'eval-api-v1', data }))
  return true
}

function sendError(response: ServerResponse, requestId: string, code: string, message: string, statusCode: number): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify({ error: { requestId, code, message, retryable: false } }))
}
