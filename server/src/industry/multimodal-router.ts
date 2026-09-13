import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AuthPrincipal } from './auth'
import { IndustryAgentClientError, type IndustryAgentClient } from './clients/industry-agent-client'
import type { TrustedRequestContext } from './context'
import { RequestBodyError, readJsonBody } from '../security/request-limits'

export interface MultimodalRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: IndustryAgentClient
  bodyLimitBytes: number
}

export async function handleMultimodalRoute(options: MultimodalRouteOptions): Promise<boolean> {
  const path = options.url.pathname
  if (!path.startsWith('/api/industry/v1/multimodal')) return false
  if (path === '/api/industry/v1/multimodal/analyses' && options.request.method === 'GET') {
    requirePermission(options.principal, 'multimodal.read')
    return sendData(options.response, await options.client.listMultimodalAnalyses(options.context))
  }
  if (path === '/api/industry/v1/multimodal/analyses' && options.request.method === 'POST') {
    requirePermission(options.principal, 'multimodal.analyze')
    const body = await readJsonBody(options.request, options.bodyLimitBytes)
    return sendData(options.response, await options.client.createMultimodalAnalysis(options.context, parseCreate(body)), 201)
  }
  const reviewMatch = path.match(/^\/api\/industry\/v1\/multimodal\/analyses\/([^/]+)\/observations\/([^/]+)\/review$/u)
  if (reviewMatch !== null && options.request.method === 'POST') {
    requirePermission(options.principal, 'multimodal.review')
    const body = await readJsonBody(options.request, options.bodyLimitBytes)
    return sendData(options.response, await options.client.reviewMultimodalObservation(options.context, decode(reviewMatch[1]), decode(reviewMatch[2]), parseReview(body)))
  }
  const analysisMatch = path.match(/^\/api\/industry\/v1\/multimodal\/analyses\/([^/]+)$/u)
  if (analysisMatch !== null && options.request.method === 'GET') {
    requirePermission(options.principal, 'multimodal.read')
    return sendData(options.response, await options.client.getMultimodalAnalysis(options.context, decode(analysisMatch[1])))
  }
  return false
}

function parseCreate(input: unknown) {
  const value = record(input)
  only(value, ['fileName','mimeType','sizeBytes','width','height'])
  return {
    fileName: str(value.fileName, 'fileName'),
    mimeType: str(value.mimeType, 'mimeType'),
    sizeBytes: integer(value.sizeBytes, 'sizeBytes'),
    ...(value.width === undefined ? {} : { width: integer(value.width, 'width') }),
    ...(value.height === undefined ? {} : { height: integer(value.height, 'height') }),
  }
}

function parseReview(input: unknown) {
  const value = record(input)
  only(value, ['decision','selectedEntityId','correctedFields','note'])
  if (value.decision !== 'ACCEPT' && value.decision !== 'CORRECT' && value.decision !== 'REJECT') throw new RequestBodyError('INVALID_JSON', 'decision is invalid', 400)
  const correctedFields = value.correctedFields === undefined ? undefined : stringRecord(value.correctedFields, 'correctedFields')
  return {
    decision: value.decision,
    ...(value.selectedEntityId === undefined ? {} : { selectedEntityId: str(value.selectedEntityId, 'selectedEntityId') }),
    ...(correctedFields === undefined ? {} : { correctedFields }),
    ...(value.note === undefined ? {} : { note: str(value.note, 'note') }),
  }
}

function requirePermission(principal: AuthPrincipal, permission: 'multimodal.read'|'multimodal.analyze'|'multimodal.review'): void {
  if (principal.permissions.includes('multimodal.admin') || principal.permissions.includes(permission)) return
  throw new IndustryAgentClientError('MULTIMODAL_ACCESS_DENIED', `missing permission: ${permission}`, 403)
}
function record(value: unknown): Record<string, unknown> { if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new RequestBodyError('INVALID_JSON','request body must be an object',400); return value as Record<string, unknown> }
function only(value: Record<string, unknown>, allowed: readonly string[]): void { const bad = Object.keys(value).filter((key) => !allowed.includes(key)); if (bad.length > 0) throw new RequestBodyError('INVALID_JSON',`unexpected fields: ${bad.join(', ')}`,400) }
function str(value: unknown, name: string): string { if (typeof value !== 'string' || value.trim() === '') throw new RequestBodyError('INVALID_JSON',`${name} must be a non-empty string`,400); return value }
function integer(value: unknown, name: string): number { if (typeof value !== 'number' || !Number.isInteger(value)) throw new RequestBodyError('INVALID_JSON',`${name} must be an integer`,400); return value }
function stringRecord(value: unknown, name: string): Readonly<Record<string,string>> { const input = record(value); const result: Record<string,string> = {}; for (const [key,item] of Object.entries(input)) { if (typeof item !== 'string') throw new RequestBodyError('INVALID_JSON',`${name}.${key} must be a string`,400); result[key] = item } return result }
function decode(value: string): string { try { return decodeURIComponent(value) } catch { throw new RequestBodyError('INVALID_QUERY','invalid path encoding',400) } }
function sendData(response: ServerResponse, data: unknown, statusCode = 200): true { response.writeHead(statusCode, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); response.end(JSON.stringify({apiVersion:'industry-api-v1',data})); return true }
