import type { IndustryContextResponse, SelectIndustryProjectRequest } from '../../../shared/industry/api'

interface IndustryApiErrorEnvelope {
  error: {
    requestId: string
    code: string
    message: string
    retryable: boolean
  }
}

export interface IndustryWorkspaceApiClient {
  getContext(): Promise<IndustryContextResponse>
  selectProject(input: SelectIndustryProjectRequest): Promise<IndustryContextResponse>
}

export class IndustryWorkspaceApiError extends Error {
  readonly code: string
  readonly requestId: string
  readonly retryable: boolean

  constructor(code: string, message: string, requestId: string, retryable: boolean) {
    super(message)
    this.name = 'IndustryWorkspaceApiError'
    this.code = code
    this.requestId = requestId
    this.retryable = retryable
  }
}

export function createIndustryWorkspaceApiClient(fetcher: typeof fetch = fetch): IndustryWorkspaceApiClient {
  return {
    getContext: () => request('/api/industry/v1/context', { method: 'GET' }),
    selectProject: (input) => request('/api/industry/v1/context/project', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  }

  async function request(path: string, init: RequestInit): Promise<IndustryContextResponse> {
    const response = await fetcher(path, { ...init, credentials: 'same-origin' })
    const payload: unknown = await response.json()
    if (!response.ok) {
      if (isErrorEnvelope(payload)) {
        throw new IndustryWorkspaceApiError(payload.error.code, payload.error.message, payload.error.requestId, payload.error.retryable)
      }
      throw new IndustryWorkspaceApiError('INDUSTRY_API_ERROR', `request failed with status ${response.status}`, 'unknown', false)
    }
    if (!isContextResponse(payload)) {
      throw new IndustryWorkspaceApiError('INVALID_API_RESPONSE', 'invalid industry context response', 'unknown', false)
    }
    return payload
  }
}

function isContextResponse(value: unknown): value is IndustryContextResponse {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return record.apiVersion === 'industry-api-v1'
    && typeof record.context === 'object'
    && record.context !== null
    && Array.isArray(record.authorizedProjects)
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
