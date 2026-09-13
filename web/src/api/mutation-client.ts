import type {
  ConfirmMutationRequest,
  MutationAuditTrail,
  MutationOperation,
  MutationOperationList,
  MutationReconciliationList,
  RejectMutationRequest,
} from '../../../shared/industry/mutation'

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
    resolution?: {
      type: 'refresh' | 'reauth' | 'reselect_project' | 'open_reconciliation' | 'contact_admin'
    }
  }
}

export interface IndustryMutationApiClient {
  listMutations(): Promise<readonly MutationOperation[]>
  getMutation(operationId: string): Promise<MutationOperation>
  confirmMutation(operationId: string, input: ConfirmMutationRequest, idempotencyKey: string): Promise<MutationOperation>
  rejectMutation(operationId: string, input?: RejectMutationRequest): Promise<MutationOperation>
  getMutationAudit(operationId: string): Promise<MutationAuditTrail>
  getReconciliation(): Promise<MutationReconciliationList>
}

export class IndustryMutationApiError extends Error {
  readonly code: string
  readonly requestId: string
  readonly retryable: boolean
  readonly resolution?: IndustryApiErrorEnvelope['error']['resolution']

  constructor(
    code: string,
    message: string,
    requestId: string,
    retryable: boolean,
    resolution?: IndustryApiErrorEnvelope['error']['resolution'],
  ) {
    super(message)
    this.name = 'IndustryMutationApiError'
    this.code = code
    this.requestId = requestId
    this.retryable = retryable
    this.resolution = resolution
  }
}

export function createIndustryMutationApiClient(fetcher: typeof fetch = fetch): IndustryMutationApiClient {
  return {
    listMutations: async () => (await get<MutationOperationList>('/api/industry/v1/mutations')).operations,
    getMutation: (operationId) => get(`/api/industry/v1/mutations/${encodeURIComponent(operationId)}`),
    confirmMutation: (operationId, input, idempotencyKey) => post(
      `/api/industry/v1/mutations/${encodeURIComponent(operationId)}/confirm`,
      input,
      { 'Idempotency-Key': idempotencyKey },
    ),
    rejectMutation: (operationId, input = {}) => post(
      `/api/industry/v1/mutations/${encodeURIComponent(operationId)}/reject`,
      input,
    ),
    getMutationAudit: (operationId) => get(`/api/industry/v1/mutations/${encodeURIComponent(operationId)}/audit`),
    getReconciliation: () => get('/api/industry/v1/mutations/reconciliation'),
  }

  async function get<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'GET' })
  }

  async function post<T>(path: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...extraHeaders },
      body: JSON.stringify(body),
    })
  }

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetcher(path, { ...init, credentials: 'same-origin' })
    const payload: unknown = await response.json()
    if (!response.ok) {
      if (isErrorEnvelope(payload)) {
        throw new IndustryMutationApiError(
          payload.error.code,
          payload.error.message,
          payload.error.requestId,
          payload.error.retryable,
          payload.error.resolution,
        )
      }
      throw new IndustryMutationApiError('INDUSTRY_API_ERROR', `request failed with status ${response.status}`, 'unknown', false)
    }
    if (!isEnvelope(payload)) {
      throw new IndustryMutationApiError('INVALID_API_RESPONSE', 'invalid mutation API response', 'unknown', false)
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
  if (typeof error !== 'object' || error === null || Array.isArray(error)) return false
  const record = error as Record<string, unknown>
  if (typeof record.requestId !== 'string'
    || typeof record.code !== 'string'
    || typeof record.message !== 'string'
    || typeof record.retryable !== 'boolean') return false
  if (record.resolution === undefined) return true
  if (typeof record.resolution !== 'object' || record.resolution === null || Array.isArray(record.resolution)) return false
  const type = (record.resolution as { type?: unknown }).type
  return type === 'refresh'
    || type === 'reauth'
    || type === 'reselect_project'
    || type === 'open_reconciliation'
    || type === 'contact_admin'
}
