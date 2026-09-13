import type {
  TraceDetail,
  TraceStats,
  TraceSummary,
  TraceTimelineEvent,
  TraceTree,
} from '../../../shared/industry/trace'

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

export interface IndustryTraceApiClient {
  listTraces(): Promise<readonly TraceSummary[]>
  getTrace(traceId: string): Promise<TraceDetail>
  getTimeline(traceId: string): Promise<readonly TraceTimelineEvent[]>
  getTree(traceId: string): Promise<TraceTree>
  getStats(traceId: string): Promise<TraceStats>
}

export class IndustryTraceApiError extends Error {
  readonly code: string
  readonly requestId: string
  readonly retryable: boolean

  constructor(code: string, message: string, requestId: string, retryable: boolean) {
    super(message)
    this.name = 'IndustryTraceApiError'
    this.code = code
    this.requestId = requestId
    this.retryable = retryable
  }
}

export function createIndustryTraceApiClient(fetcher: typeof fetch = fetch): IndustryTraceApiClient {
  return {
    listTraces: async () => (await get<{ traces: readonly TraceSummary[] }>('/api/industry/v1/traces')).traces,
    getTrace: (traceId) => get(`/api/industry/v1/traces/${encodeURIComponent(traceId)}`),
    getTimeline: async (traceId) => (await get<{ traceId: string; events: readonly TraceTimelineEvent[] }>(`/api/industry/v1/traces/${encodeURIComponent(traceId)}/timeline`)).events,
    getTree: (traceId) => get(`/api/industry/v1/traces/${encodeURIComponent(traceId)}/tree`),
    getStats: (traceId) => get(`/api/industry/v1/traces/${encodeURIComponent(traceId)}/stats`),
  }

  async function get<T>(path: string): Promise<T> {
    const response = await fetcher(path, { method: 'GET', credentials: 'same-origin' })
    const payload: unknown = await response.json()
    if (!response.ok) {
      if (isErrorEnvelope(payload)) {
        throw new IndustryTraceApiError(payload.error.code, payload.error.message, payload.error.requestId, payload.error.retryable)
      }
      throw new IndustryTraceApiError('INDUSTRY_API_ERROR', `request failed with status ${response.status}`, 'unknown', false)
    }
    if (!isEnvelope(payload)) throw new IndustryTraceApiError('INVALID_API_RESPONSE', 'invalid trace API response', 'unknown', false)
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
