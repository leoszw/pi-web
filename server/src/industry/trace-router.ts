import type { IncomingMessage, ServerResponse } from 'node:http'
import type { TraceAccessProfile } from '../../../shared/industry/trace'
import type { AuthPrincipal } from './auth'
import type { IndustryAgentClient } from './clients/industry-agent-client'
import type { TrustedRequestContext } from './context'
import { RequestBodyError } from '../security/request-limits'

export interface TraceRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: IndustryAgentClient
}

export async function handleTraceRoute(options: TraceRouteOptions): Promise<boolean> {
  const path = options.url.pathname
  if (!path.startsWith('/api/industry/v1/traces')) return false

  try {
    requirePermission(options.principal, 'trace.read.basic')
    const access = accessProfile(options.principal)

    if (path === '/api/industry/v1/traces' && options.request.method === 'GET') {
      return sendData(options.response, { traces: await options.client.listTraces(options.context) })
    }

    const timelineMatch = path.match(/^\/api\/industry\/v1\/traces\/([^/]+)\/timeline$/u)
    if (timelineMatch !== null && options.request.method === 'GET') {
      return sendData(options.response, {
        traceId: decodeSegment(timelineMatch[1]),
        events: await options.client.getTraceTimeline(options.context, decodeSegment(timelineMatch[1]), access),
      })
    }

    const treeMatch = path.match(/^\/api\/industry\/v1\/traces\/([^/]+)\/tree$/u)
    if (treeMatch !== null && options.request.method === 'GET') {
      return sendData(options.response, await options.client.getTraceTree(options.context, decodeSegment(treeMatch[1]), access))
    }

    const statsMatch = path.match(/^\/api\/industry\/v1\/traces\/([^/]+)\/stats$/u)
    if (statsMatch !== null && options.request.method === 'GET') {
      return sendData(options.response, await options.client.getTraceStats(options.context, decodeSegment(statsMatch[1])))
    }

    const detailMatch = path.match(/^\/api\/industry\/v1\/traces\/([^/]+)$/u)
    if (detailMatch !== null && options.request.method === 'GET') {
      return sendData(options.response, await options.client.getTrace(options.context, decodeSegment(detailMatch[1]), access))
    }

    return false
  } catch (error) {
    if (error instanceof TraceAccessError || error instanceof RequestBodyError) {
      sendError(options.response, options.requestId, error.code, error.message, error.statusCode)
      return true
    }
    throw error
  }
}

export function accessProfile(principal: AuthPrincipal): TraceAccessProfile {
  return {
    debug: hasPermission(principal, 'trace.read.debug'),
    prompt: hasPermission(principal, 'trace.read.prompt'),
    audit: hasPermission(principal, 'audit.read'),
  }
}

function requirePermission(principal: AuthPrincipal, permission: 'trace.read.basic'): void {
  if (hasPermission(principal, permission)) return
  throw new TraceAccessError('TRACE_ACCESS_DENIED', `missing permission: ${permission}`, 403)
}

function hasPermission(principal: AuthPrincipal, permission: string): boolean {
  return principal.permissions.includes('trace.admin') || principal.permissions.includes(permission)
}

class TraceAccessError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(code: string, message: string, statusCode: number) {
    super(message)
    this.name = 'TraceAccessError'
    this.code = code
    this.statusCode = statusCode
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

function sendError(response: ServerResponse, requestId: string, code: string, message: string, statusCode: number): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify({
    error: {
      requestId,
      code,
      message,
      retryable: false,
    },
  }))
}
