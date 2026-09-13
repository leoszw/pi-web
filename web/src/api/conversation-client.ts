import type {
  CreateConversationRequest,
  IndustryConversation,
  IndustryEventBatch,
  SendConversationMessageRequest,
} from '../../../shared/industry/conversation'
import type { UiActionInteractionRequest, UiActionInteractionResult } from '../../../shared/industry/ui-actions'

interface IndustryApiEnvelope<T> {
  apiVersion: 'industry-api-v1'
  data: T
}

interface IndustryApiErrorEnvelope {
  error: {
    requestId: string
    code: string
    message: string
    retryable: boolean
  }
}

export interface IndustryConversationApiClient {
  createConversation(input?: CreateConversationRequest): Promise<IndustryConversation>
  getConversation(conversationId: string): Promise<IndustryConversation>
  sendMessage(conversationId: string, input: SendConversationMessageRequest): Promise<IndustryConversation>
  interactWithUiAction(conversationId: string, actionId: string, input: UiActionInteractionRequest): Promise<UiActionInteractionResult>
  abortConversation(conversationId: string): Promise<IndustryConversation>
  getEvents(conversationId: string, afterSequenceNo: number): Promise<IndustryEventBatch>
}

export class IndustryConversationApiError extends Error {
  readonly code: string
  readonly requestId: string
  readonly retryable: boolean

  constructor(code: string, message: string, requestId: string, retryable: boolean) {
    super(message)
    this.name = 'IndustryConversationApiError'
    this.code = code
    this.requestId = requestId
    this.retryable = retryable
  }
}

export function createIndustryConversationApiClient(fetcher: typeof fetch = fetch): IndustryConversationApiClient {
  return {
    createConversation: (input = {}) => post('/api/industry/v1/conversations', input),
    getConversation: (conversationId) => get(`/api/industry/v1/conversations/${encodeURIComponent(conversationId)}`),
    sendMessage: (conversationId, input) => post(`/api/industry/v1/conversations/${encodeURIComponent(conversationId)}/messages`, input),
    interactWithUiAction: (conversationId, actionId, input) => post(
      `/api/industry/v1/conversations/${encodeURIComponent(conversationId)}/ui-actions/${encodeURIComponent(actionId)}/interactions`,
      input,
    ),
    abortConversation: (conversationId) => post(`/api/industry/v1/conversations/${encodeURIComponent(conversationId)}/abort`, undefined),
    getEvents: (conversationId, afterSequenceNo) => get(
      `/api/industry/v1/conversations/${encodeURIComponent(conversationId)}/events?afterSequenceNo=${encodeURIComponent(String(afterSequenceNo))}`,
    ),
  }

  async function get<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'GET' })
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetcher(path, { ...init, credentials: 'same-origin' })
    const payload: unknown = await response.json()
    if (!response.ok) {
      if (isErrorEnvelope(payload)) {
        throw new IndustryConversationApiError(payload.error.code, payload.error.message, payload.error.requestId, payload.error.retryable)
      }
      throw new IndustryConversationApiError('INDUSTRY_API_ERROR', `request failed with status ${response.status}`, 'unknown', false)
    }
    if (!isEnvelope(payload)) {
      throw new IndustryConversationApiError('INVALID_API_RESPONSE', 'invalid industry API response', 'unknown', false)
    }
    return payload.data as T
  }
}

function isEnvelope(value: unknown): value is IndustryApiEnvelope<unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && (value as { apiVersion?: unknown }).apiVersion === 'industry-api-v1'
    && 'data' in value
}

function isErrorEnvelope(value: unknown): value is IndustryApiErrorEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('error' in value)) return false
  const error = (value as { error?: unknown }).error
  return typeof error === 'object'
    && error !== null
    && !Array.isArray(error)
    && typeof (error as { requestId?: unknown }).requestId === 'string'
    && typeof (error as { code?: unknown }).code === 'string'
    && typeof (error as { message?: unknown }).message === 'string'
    && typeof (error as { retryable?: unknown }).retryable === 'boolean'
}
