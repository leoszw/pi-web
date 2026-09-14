import type {
  CreateP7DraftFromTraceRequest,
  P7EvalCase,
  P7EvalDomain,
  P7EvalDraft,
  P7EvalFailureSummary,
  P7EvalObservation,
  P7EvalRunSummary,
  P7EvalVariant,
} from '../../../shared/industry/eval/p7'

interface EvalEnvelope<T> { apiVersion: 'eval-api-v1'; data: T }
interface ErrorEnvelope { error: { requestId: string; code: string; message: string; retryable: boolean } }

export interface P7EvaluationApiClient {
  listCases(domain: P7EvalDomain): Promise<readonly P7EvalCase[]>
  listRuns(domain: P7EvalDomain): Promise<readonly P7EvalRunSummary[]>
  startRun(domain: P7EvalDomain, input: { datasetId: string; variantId: P7EvalVariant }): Promise<P7EvalRunSummary>
  getRun(runId: string): Promise<P7EvalRunSummary>
  listObservations(runId: string): Promise<readonly P7EvalObservation[]>
  listFailures(runId: string): Promise<readonly P7EvalFailureSummary[]>
  listDrafts(): Promise<readonly P7EvalDraft[]>
  createDraftFromTrace(input: CreateP7DraftFromTraceRequest): Promise<P7EvalDraft>
}

export class P7ApiError extends Error {
  constructor(readonly code: string, message: string, readonly requestId: string, readonly retryable: boolean) { super(message); this.name = 'P7ApiError' }
}

export function createP7EvaluationApiClient(fetcher: typeof fetch = fetch): P7EvaluationApiClient {
  return {
    listCases: (domain) => get(`/api/industry/v1/eval/p7/${segment(domain)}/cases`),
    listRuns: (domain) => get(`/api/industry/v1/eval/p7/${segment(domain)}/runs`),
    startRun: (domain, input) => post(`/api/industry/v1/eval/p7/${segment(domain)}/runs`, input),
    getRun: (runId) => get(`/api/industry/v1/eval/p7/runs/${encodeURIComponent(runId)}`),
    listObservations: (runId) => get(`/api/industry/v1/eval/p7/runs/${encodeURIComponent(runId)}/observations`),
    listFailures: (runId) => get(`/api/industry/v1/eval/p7/runs/${encodeURIComponent(runId)}/failures`),
    listDrafts: () => get('/api/industry/v1/eval/p7/drafts'),
    createDraftFromTrace: (input) => post('/api/industry/v1/eval/p7/drafts/from-trace', input),
  }

  async function get<T>(path: string): Promise<T> { return request<T>(path, { method: 'GET' }) }
  async function post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  }
  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetcher(path, { ...init, credentials: 'same-origin' })
    const payload: unknown = await response.json()
    if (!response.ok) {
      if (isErrorEnvelope(payload)) throw new P7ApiError(payload.error.code, payload.error.message, payload.error.requestId, payload.error.retryable)
      throw new P7ApiError('INDUSTRY_API_ERROR', `request failed with status ${response.status}`, 'unknown', false)
    }
    if (!isEnvelope(payload)) throw new P7ApiError('INVALID_API_RESPONSE', 'invalid P7 eval API response', 'unknown', false)
    return payload.data as T
  }
}

function segment(domain: P7EvalDomain): string { return domain.toLowerCase() }
function isEnvelope(value: unknown): value is EvalEnvelope<unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as { apiVersion?: unknown }).apiVersion === 'eval-api-v1' && 'data' in value }
function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('error' in value)) return false
  const error = (value as { error?: unknown }).error
  return typeof error === 'object' && error !== null && !Array.isArray(error)
    && typeof (error as { requestId?: unknown }).requestId === 'string'
    && typeof (error as { code?: unknown }).code === 'string'
    && typeof (error as { message?: unknown }).message === 'string'
    && typeof (error as { retryable?: unknown }).retryable === 'boolean'
}
