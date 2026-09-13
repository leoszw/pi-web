import type { IncomingMessage, ServerResponse } from 'node:http'
import type { KnowledgeUploadRequest, KnowledgeVisibility } from '../../../shared/industry/knowledge'
import type { AuthPrincipal } from './auth'
import type { IndustryAgentClient } from './clients/industry-agent-client'
import type { TrustedRequestContext } from './context'
import { RequestBodyError, readJsonBody } from '../security/request-limits'

export interface KnowledgeRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: IndustryAgentClient
  bodyLimitBytes: number
}

export async function handleKnowledgeRoute(options: KnowledgeRouteOptions): Promise<boolean> {
  const path = options.url.pathname
  if (!path.startsWith('/api/industry/v1/knowledge')) return false

  try {
    if (path === '/api/industry/v1/knowledge/options' && options.request.method === 'GET') {
      requirePermission(options.principal, 'knowledge.read')
      return sendData(options.response, await options.client.getKnowledgeUploadOptions(options.context))
    }

    if (path === '/api/industry/v1/knowledge/documents' && options.request.method === 'GET') {
      requirePermission(options.principal, 'knowledge.read')
      return sendData(options.response, await options.client.listKnowledgeDocuments(options.context))
    }

    if (path === '/api/industry/v1/knowledge/uploads' && options.request.method === 'POST') {
      requirePermission(options.principal, 'knowledge.upload')
      const body = await readJsonBody(options.request, options.bodyLimitBytes)
      return sendData(options.response, await options.client.uploadKnowledgeDocument(options.context, parseUploadRequest(body)), 201)
    }

    const chunksMatch = path.match(/^\/api\/industry\/v1\/knowledge\/documents\/([^/]+)\/chunks$/u)
    if (chunksMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'knowledge.read')
      return sendData(options.response, await options.client.listKnowledgeChunks(options.context, decodeSegment(chunksMatch[1])))
    }

    const reingestMatch = path.match(/^\/api\/industry\/v1\/knowledge\/documents\/([^/]+)\/reingest$/u)
    if (reingestMatch !== null && options.request.method === 'POST') {
      requirePermission(options.principal, 'knowledge.reingest')
      const body = await readJsonBody(options.request, options.bodyLimitBytes)
      assertEmptyObject(body)
      return sendData(options.response, await options.client.reingestKnowledgeDocument(options.context, decodeSegment(reingestMatch[1])))
    }

    const documentMatch = path.match(/^\/api\/industry\/v1\/knowledge\/documents\/([^/]+)$/u)
    if (documentMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'knowledge.read')
      return sendData(options.response, await options.client.getKnowledgeDocument(options.context, decodeSegment(documentMatch[1])))
    }

    const ingestionMatch = path.match(/^\/api\/industry\/v1\/knowledge\/ingestions\/([^/]+)$/u)
    if (ingestionMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'knowledge.read')
      return sendData(options.response, await options.client.getKnowledgeIngestion(options.context, decodeSegment(ingestionMatch[1])))
    }

    return false
  } catch (error) {
    if (error instanceof KnowledgeAccessError || error instanceof RequestBodyError) {
      sendError(options.response, options.requestId, error.code, error.message, error.statusCode)
      return true
    }
    throw error
  }
}

function parseUploadRequest(input: unknown): KnowledgeUploadRequest {
  const record = requireRecord(input)
  assertOnlyKeys(record, [
    'fileName', 'mimeType', 'sizeBytes', 'industry', 'companyId', 'projectId', 'department',
    'visibility', 'aclUsers', 'aclRoles', 'securityTags',
  ])
  return {
    fileName: requireString(record.fileName, 'fileName', 240),
    mimeType: requireString(record.mimeType, 'mimeType', 160),
    sizeBytes: requirePositiveInteger(record.sizeBytes, 'sizeBytes'),
    industry: requireString(record.industry, 'industry', 120),
    companyId: requireString(record.companyId, 'companyId', 160),
    projectId: requireString(record.projectId, 'projectId', 160),
    department: requireString(record.department, 'department', 120),
    visibility: parseVisibility(record.visibility),
    aclUsers: parseStringArray(record.aclUsers, 'aclUsers'),
    aclRoles: parseStringArray(record.aclRoles, 'aclRoles'),
    securityTags: parseStringArray(record.securityTags, 'securityTags'),
  }
}

function parseVisibility(value: unknown): KnowledgeVisibility {
  if (value === 'PROJECT' || value === 'COMPANY' || value === 'RESTRICTED') return value
  throw new RequestBodyError('INVALID_JSON', 'visibility must be PROJECT, COMPANY, or RESTRICTED', 400)
}

function parseStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new RequestBodyError('INVALID_JSON', `${field} must be an array of non-empty strings`, 400)
  }
  if (value.length > 50) throw new RequestBodyError('INVALID_JSON', `${field} has too many values`, 400)
  return [...new Set(value as string[])]
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maxLength) {
    throw new RequestBodyError('INVALID_JSON', `${field} must be a non-empty string up to ${maxLength} characters`, 400)
  }
  return value
}

function requirePositiveInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new RequestBodyError('INVALID_JSON', `${field} must be a positive safe integer`, 400)
  }
  return value
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

function assertEmptyObject(input: unknown): void {
  const record = requireRecord(input)
  if (Object.keys(record).length !== 0) throw new RequestBodyError('INVALID_JSON', 'reingest request body must be empty', 400)
}

function decodeSegment(value: string | undefined): string {
  if (value === undefined) throw new RequestBodyError('INVALID_JSON', 'missing path segment', 400)
  try {
    return decodeURIComponent(value)
  } catch {
    throw new RequestBodyError('INVALID_JSON', 'invalid path encoding', 400)
  }
}

function requirePermission(principal: AuthPrincipal, permission: 'knowledge.read' | 'knowledge.upload' | 'knowledge.reingest'): void {
  if (principal.permissions.includes('knowledge.admin') || principal.permissions.includes(permission)) return
  throw new KnowledgeAccessError('KNOWLEDGE_ACCESS_DENIED', `missing permission: ${permission}`, 403)
}

class KnowledgeAccessError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(code: string, message: string, statusCode: number) {
    super(message)
    this.name = 'KnowledgeAccessError'
    this.code = code
    this.statusCode = statusCode
  }
}

function sendData(response: ServerResponse, data: unknown, statusCode = 200): true {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify({ apiVersion: 'knowledge-api-v1', data }))
  return true
}

function sendError(response: ServerResponse, requestId: string, code: string, message: string, statusCode: number): void {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify({ error: { requestId, code, message, retryable: false } }))
}
