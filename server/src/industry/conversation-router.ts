import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CreateConversationRequest, SendConversationMessageRequest } from '../../../shared/industry/conversation'
import type { TrustedRequestContext } from './context'
import type { IndustryAgentClient } from './clients/industry-agent-client'
import { RequestBodyError, readJsonBody } from '../security/request-limits'

export interface ConversationRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  context: TrustedRequestContext
  client: IndustryAgentClient
  bodyLimitBytes: number
}

export async function handleConversationRoute(options: ConversationRouteOptions): Promise<boolean> {
  const path = options.url.pathname
  if (!path.startsWith('/api/industry/v1/conversations')) return false

  if (path === '/api/industry/v1/conversations' && options.request.method === 'POST') {
    const body = await readJsonBody(options.request, options.bodyLimitBytes)
    const created = await options.client.createConversation(options.context, parseCreateConversationRequest(body), options.requestId)
    return sendData(options.response, created, 201)
  }

  const messageMatch = path.match(/^\/api\/industry\/v1\/conversations\/([^/]+)\/messages$/u)
  if (messageMatch !== null && options.request.method === 'POST') {
    const body = await readJsonBody(options.request, options.bodyLimitBytes)
    const conversationId = decodeSegment(messageMatch[1])
    const updated = await options.client.sendConversationMessage(
      options.context,
      conversationId,
      parseSendMessageRequest(body),
      options.requestId,
    )
    return sendData(options.response, updated)
  }

  const abortMatch = path.match(/^\/api\/industry\/v1\/conversations\/([^/]+)\/abort$/u)
  if (abortMatch !== null && options.request.method === 'POST') {
    const conversationId = decodeSegment(abortMatch[1])
    const aborted = await options.client.abortConversation(options.context, conversationId, options.requestId)
    return sendData(options.response, aborted)
  }

  const eventsMatch = path.match(/^\/api\/industry\/v1\/conversations\/([^/]+)\/events$/u)
  if (eventsMatch !== null && options.request.method === 'GET') {
    const conversationId = decodeSegment(eventsMatch[1])
    const afterSequenceNo = parseAfterSequenceNo(options.url.searchParams.get('afterSequenceNo'))
    const events = await options.client.getConversationEvents(options.context, conversationId, afterSequenceNo)
    return sendData(options.response, events)
  }

  const conversationMatch = path.match(/^\/api\/industry\/v1\/conversations\/([^/]+)$/u)
  if (conversationMatch !== null && options.request.method === 'GET') {
    const conversationId = decodeSegment(conversationMatch[1])
    return sendData(options.response, await options.client.getConversation(options.context, conversationId))
  }

  return false
}

function parseCreateConversationRequest(input: unknown): CreateConversationRequest {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['title'])
  if (record.title === undefined) return {}
  if (typeof record.title !== 'string' || record.title.trim() === '' || record.title.length > 200) {
    throw new RequestBodyError('INVALID_JSON', 'title must be a non-empty string up to 200 characters', 400)
  }
  return { title: record.title.trim() }
}

function parseSendMessageRequest(input: unknown): SendConversationMessageRequest {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['text'])
  if (typeof record.text !== 'string' || record.text.trim() === '' || record.text.length > 20_000) {
    throw new RequestBodyError('INVALID_JSON', 'text must be a non-empty string up to 20000 characters', 400)
  }
  return { text: record.text.trim() }
}

function parseAfterSequenceNo(value: string | null): number {
  if (value === null || value === '') return 0
  if (!/^\d+$/u.test(value)) throw new RequestBodyError('INVALID_QUERY', 'afterSequenceNo must be a non-negative integer', 400)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new RequestBodyError('INVALID_QUERY', 'afterSequenceNo must be a safe integer', 400)
  return parsed
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
