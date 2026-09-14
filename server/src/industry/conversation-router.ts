import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CreateConversationRequest, SendConversationMessageRequest } from '../../../shared/industry/conversation'
import type {
  UiActionInteraction,
  UiActionInteractionRequest,
  UiActionPrimitive,
  UiActionTableFilter,
  UiActionTableSort,
} from '../../../shared/industry/ui-actions'
import type { AuthPrincipal } from './auth'
import type { TrustedRequestContext } from './context'
import { IndustryAgentClientError, type IndustryAgentClient } from './clients/industry-agent-client'
import { RequestBodyError, readJsonBody } from '../security/request-limits'

export interface ConversationRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: IndustryAgentClient
  bodyLimitBytes: number
}

export async function handleConversationRoute(options: ConversationRouteOptions): Promise<boolean> {
  const path = options.url.pathname
  if (!path.startsWith('/api/industry/v1/conversations')) return false
  requireWorkspacePermission(options.principal)

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

  const interactionMatch = path.match(/^\/api\/industry\/v1\/conversations\/([^/]+)\/ui-actions\/([^/]+)\/interactions$/u)
  if (interactionMatch !== null && options.request.method === 'POST') {
    const body = await readJsonBody(options.request, options.bodyLimitBytes)
    const conversationId = decodeSegment(interactionMatch[1])
    const actionId = decodeSegment(interactionMatch[2])
    const result = await options.client.interactWithUiAction(
      options.context,
      conversationId,
      actionId,
      parseUiActionInteractionRequest(body),
      options.requestId,
    )
    return sendData(options.response, result)
  }

  const abortMatch = path.match(/^\/api\/industry\/v1\/conversations\/([^/]+)\/abort$/u)
  if (abortMatch !== null && options.request.method === 'POST') {
    const body = await readJsonBody(options.request, options.bodyLimitBytes)
    assertOnlyKeys(requireRecord(body), [])
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

function requireWorkspacePermission(principal: AuthPrincipal): void {
  if (principal.permissions.includes('industry.admin') || principal.permissions.includes('industry.workspace')) return
  throw new IndustryAgentClientError('WORKSPACE_ACCESS_DENIED', 'industry.workspace permission is required', 403)
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

function parseUiActionInteractionRequest(input: unknown): UiActionInteractionRequest {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['interaction'])
  return { interaction: parseUiActionInteraction(record.interaction) }
}

function parseUiActionInteraction(input: unknown): UiActionInteraction {
  const record = requireRecord(input)
  const kind = record.kind
  if (kind === 'entity_selection') {
    assertOnlyKeys(record, ['kind', 'selectedEntityIds'])
    return { kind, selectedEntityIds: parseStringArray(record.selectedEntityIds, 'selectedEntityIds') }
  }
  if (kind === 'form_submit') {
    assertOnlyKeys(record, ['kind', 'values'])
    return { kind, values: parsePrimitiveRecord(record.values, 'values') }
  }
  if (kind === 'table_query') {
    assertOnlyKeys(record, ['kind', 'pageSize', 'cursor', 'sort', 'filters'])
    if (typeof record.pageSize !== 'number' || !Number.isInteger(record.pageSize) || record.pageSize < 1 || record.pageSize > 100) {
      throw new RequestBodyError('INVALID_JSON', 'pageSize must be an integer between 1 and 100', 400)
    }
    const cursor = optionalNonEmptyString(record.cursor, 'cursor')
    const sort = record.sort === undefined ? undefined : parseTableSort(record.sort)
    const filters = record.filters === undefined ? undefined : parseTableFilters(record.filters)
    return {
      kind,
      pageSize: record.pageSize,
      ...(cursor === undefined ? {} : { cursor }),
      ...(sort === undefined ? {} : { sort }),
      ...(filters === undefined ? {} : { filters }),
    }
  }
  if (kind === 'table_selection') {
    assertOnlyKeys(record, ['kind', 'selectedRowIds'])
    return { kind, selectedRowIds: parseStringArray(record.selectedRowIds, 'selectedRowIds') }
  }
  if (kind === 'multi_select') {
    assertOnlyKeys(record, ['kind', 'selectedIds'])
    return { kind, selectedIds: parseStringArray(record.selectedIds, 'selectedIds') }
  }
  if (kind === 'date_select') {
    assertOnlyKeys(record, ['kind', 'value'])
    if (record.value !== null && (typeof record.value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(record.value))) {
      throw new RequestBodyError('INVALID_JSON', 'date_select.value must be null or YYYY-MM-DD', 400)
    }
    return { kind, value: record.value as string | null }
  }
  throw new RequestBodyError('INVALID_JSON', 'unsupported UIAction interaction kind', 400)
}

function parseTableSort(input: unknown): UiActionTableSort {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['key', 'direction'])
  const key = requireNonEmptyString(record.key, 'sort.key')
  if (record.direction !== 'asc' && record.direction !== 'desc') {
    throw new RequestBodyError('INVALID_JSON', 'sort.direction must be asc or desc', 400)
  }
  return { key, direction: record.direction }
}

function parseTableFilters(input: unknown): readonly UiActionTableFilter[] {
  if (!Array.isArray(input) || input.length > 20) {
    throw new RequestBodyError('INVALID_JSON', 'filters must be an array with at most 20 items', 400)
  }
  return input.map((item, index) => {
    const record = requireRecord(item)
    assertOnlyKeys(record, ['key', 'value'])
    return {
      key: requireNonEmptyString(record.key, `filters[${index}].key`),
      value: requireString(record.value, `filters[${index}].value`, 500),
    }
  })
}

function parseStringArray(input: unknown, field: string): readonly string[] {
  if (!Array.isArray(input) || input.length > 200 || input.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new RequestBodyError('INVALID_JSON', `${field} must be an array of non-empty strings`, 400)
  }
  return [...new Set(input as string[])]
}

function parsePrimitiveRecord(input: unknown, field: string): Readonly<Record<string, UiActionPrimitive>> {
  const record = requireRecord(input)
  if (Object.keys(record).length > 100) throw new RequestBodyError('INVALID_JSON', `${field} has too many fields`, 400)
  const result: Record<string, UiActionPrimitive> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key.trim() === '') throw new RequestBodyError('INVALID_JSON', `${field} contains an empty key`, 400)
    if (value !== null && typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      throw new RequestBodyError('INVALID_JSON', `${field}.${key} must be a primitive value`, 400)
    }
    result[key] = value as UiActionPrimitive
  }
  return result
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

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new RequestBodyError('INVALID_JSON', `${field} must be a non-empty string`, 400)
  }
  return value.trim()
}

function optionalNonEmptyString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined
  return requireNonEmptyString(value, field)
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length > maxLength) {
    throw new RequestBodyError('INVALID_JSON', `${field} must be a string up to ${maxLength} characters`, 400)
  }
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
  response.end(JSON.stringify({ apiVersion: 'industry-api-v1', data }))
}
