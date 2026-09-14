import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  CreateP7DraftFromTraceRequest,
  P7EvalDomain,
  P7EvalRunSummary,
  P7EvalVariant,
  StartP7EvalRunRequest,
} from '../../../../shared/industry/eval/p7'
import type { AuthPrincipal } from '../auth'
import type { IndustryAgentClient } from '../clients/industry-agent-client'
import type { TrustedRequestContext } from '../context'
import { RequestBodyError, readJsonBody } from '../../security/request-limits'
import { EvaluationClientError, type EvaluationClient } from './evaluation-client'

export interface P7EvalRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: EvaluationClient
  agentClient: IndustryAgentClient
  bodyLimitBytes: number
}

export async function handleP7EvalRoute(options: P7EvalRouteOptions): Promise<boolean> {
  const path = options.url.pathname
  if (!path.startsWith('/api/industry/v1/eval/p7/')) return false

  try {
    if (path === '/api/industry/v1/eval/p7/drafts' && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listP7Drafts(options.context))
    }

    if (path === '/api/industry/v1/eval/p7/drafts/from-trace' && options.request.method === 'POST') {
      requirePermission(options.principal, 'eval.dataset.edit')
      requireTracePermission(options.principal)
      const body = parseDraftRequest(await readJsonBody(options.request, options.bodyLimitBytes))
      const trace = await options.agentClient.getTrace(options.context, body.traceId, { debug: false, prompt: false, audit: false })
      return sendData(
        options.response,
        await options.client.createP7DraftFromTrace(options.context, body.traceId, body.targetDomain, trace.summary.name),
        201,
      )
    }

    const casesMatch = path.match(/^\/api\/industry\/v1\/eval\/p7\/([^/]+)\/cases$/u)
    if (casesMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listP7EvalCases(options.context, parseDomain(casesMatch[1])))
    }

    const runsMatch = path.match(/^\/api\/industry\/v1\/eval\/p7\/([^/]+)\/runs$/u)
    if (runsMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listP7EvalRuns(options.context, parseDomain(runsMatch[1])))
    }
    if (runsMatch !== null && options.request.method === 'POST') {
      requirePermission(options.principal, 'eval.run')
      const domain = parseDomain(runsMatch[1])
      const request = parseRunRequest(await readJsonBody(options.request, options.bodyLimitBytes))
      return sendData(options.response, await options.client.startP7EvalRun(options.context, domain, request), 201)
    }

    const failuresMatch = path.match(/^\/api\/industry\/v1\/eval\/p7\/runs\/([^/]+)\/failures$/u)
    if (failuresMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listP7EvalFailures(options.context, decodeSegment(failuresMatch[1])))
    }

    const observationsMatch = path.match(/^\/api\/industry\/v1\/eval\/p7\/runs\/([^/]+)\/observations$/u)
    if (observationsMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listP7EvalObservations(options.context, decodeSegment(observationsMatch[1])))
    }

    const runMatch = path.match(/^\/api\/industry\/v1\/eval\/p7\/runs\/([^/]+)$/u)
    if (runMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      const run: P7EvalRunSummary = await options.client.getP7EvalRun(options.context, decodeSegment(runMatch[1]))
      return sendData(options.response, run)
    }

    return false
  } catch (error) {
    if (error instanceof P7AccessError || error instanceof EvaluationClientError || error instanceof RequestBodyError) {
      sendError(options.response, options.requestId, error.code, error.message, error.statusCode)
      return true
    }
    throw error
  }
}

function parseDomain(raw: string): P7EvalDomain {
  const value = decodeSegment(raw).toUpperCase()
  if (value === 'NORMALIZATION' || value === 'ENTITY' || value === 'TOOL' || value === 'MEMORY') return value
  throw new RequestBodyError('INVALID_QUERY', 'P7 domain must be normalization, entity, tool, or memory', 400)
}

function parseRunRequest(value: unknown): StartP7EvalRunRequest {
  const record = requireRecord(value)
  assertOnlyKeys(record, ['datasetId', 'variantId'])
  const datasetId = requireString(record.datasetId, 'datasetId')
  const variantId = requireString(record.variantId, 'variantId')
  if (variantId !== 'p7-broken-v0' && variantId !== 'p7-guarded-v1') throw new RequestBodyError('INVALID_JSON', 'invalid P7 variantId', 400)
  return { datasetId, variantId: variantId as P7EvalVariant }
}

function parseDraftRequest(value: unknown): CreateP7DraftFromTraceRequest {
  const record = requireRecord(value)
  assertOnlyKeys(record, ['traceId', 'targetDomain'])
  return { traceId: requireString(record.traceId, 'traceId'), targetDomain: parseBodyDomain(record.targetDomain) }
}

function parseBodyDomain(value: unknown): P7EvalDomain {
  if (value === 'NORMALIZATION' || value === 'ENTITY' || value === 'TOOL' || value === 'MEMORY') return value
  throw new RequestBodyError('INVALID_JSON', 'targetDomain must be NORMALIZATION, ENTITY, TOOL, or MEMORY', 400)
}

function requirePermission(principal: AuthPrincipal, permission: 'eval.read' | 'eval.run' | 'eval.dataset.edit'): void {
  if (principal.permissions.includes('eval.admin') || principal.permissions.includes(permission)) return
  throw new P7AccessError('EVAL_ACCESS_DENIED', `missing permission: ${permission}`, 403)
}
function requireTracePermission(principal: AuthPrincipal): void {
  if (principal.permissions.includes('trace.admin') || principal.permissions.includes('trace.read.basic')) return
  throw new P7AccessError('TRACE_ACCESS_DENIED', 'missing permission: trace.read.basic', 403)
}

class P7AccessError extends Error {
  readonly code: string
  readonly statusCode: number
  constructor(code: string, message: string, statusCode: number) { super(message); this.name = 'P7AccessError'; this.code = code; this.statusCode = statusCode }
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new RequestBodyError('INVALID_JSON', 'request body must be an object', 400)
  return value as Record<string, unknown>
}
function assertOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const invalid = Object.keys(record).filter((key) => !allowed.includes(key))
  if (invalid.length > 0) throw new RequestBodyError('INVALID_JSON', `unexpected request fields: ${invalid.join(', ')}`, 400)
}
function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new RequestBodyError('INVALID_JSON', `${field} must be a non-empty string`, 400)
  return value
}
function decodeSegment(value: string): string {
  try { return decodeURIComponent(value) } catch { throw new RequestBodyError('INVALID_QUERY', 'path segment is not valid URL encoding', 400) }
}
function sendData(response: ServerResponse, data: unknown, statusCode = 200): true {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify({ apiVersion: 'eval-api-v1', data }))
  return true
}
function sendError(response: ServerResponse, requestId: string, code: string, message: string, statusCode: number): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify({ error: { requestId, code, message, retryable: false } }))
}
