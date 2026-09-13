import type { EvalVariantSummary } from '../../../shared/industry/eval/common'
import type { CreateIntentDraftCaseRequest, EvalDatasetSummary, IntentDatasetDetail, IntentEvalCase, IntentTurn } from '../../../shared/industry/eval/datasets'
import type { RetrievalDomain, RetrievalEvalCase, RetrievalLeakageReport, RetrievalPlaygroundResult } from '../../../shared/industry/eval/retrieval'
import type { EvalRunSummary, IntentEvalObservation, IntentPlaygroundResult, IntentRunComparison } from '../../../shared/industry/eval/runs'

interface EvalApiEnvelope<T> {
  apiVersion: 'eval-api-v1'
  data: T
}

interface ApiErrorEnvelope {
  error: {
    requestId: string
    code: string
    message: string
    retryable: boolean
  }
}

export interface EvaluationApiClient {
  listVariants(): Promise<readonly EvalVariantSummary[]>
  listDatasets(): Promise<readonly EvalDatasetSummary[]>
  getDataset(datasetId: string): Promise<IntentDatasetDetail>
  listCases(datasetId: string): Promise<readonly IntentEvalCase[]>
  createDraftCase(datasetId: string, input: CreateIntentDraftCaseRequest): Promise<IntentEvalCase>
  playgroundIntent(input: { query: string; previousTurns: readonly IntentTurn[]; variantId: string }): Promise<IntentPlaygroundResult>
  listRetrievalCases(): Promise<readonly RetrievalEvalCase[]>
  playgroundRetrieval(input: { query: string; domain: RetrievalDomain; variantId: string }): Promise<RetrievalPlaygroundResult>
  getRetrievalLeakageReport(): Promise<RetrievalLeakageReport>
  listRuns(): Promise<readonly EvalRunSummary[]>
  startIntentRun(input: { datasetId: string; variantId: string }): Promise<EvalRunSummary>
  listObservations(runId: string): Promise<readonly IntentEvalObservation[]>
  compareRuns(baselineRunId: string, candidateRunId: string): Promise<IntentRunComparison>
}

export class IndustryApiClientError extends Error {
  readonly code: string
  readonly requestId: string
  readonly retryable: boolean

  constructor(code: string, message: string, requestId: string, retryable: boolean) {
    super(message)
    this.name = 'IndustryApiClientError'
    this.code = code
    this.requestId = requestId
    this.retryable = retryable
  }
}

export function createEvaluationApiClient(fetcher: typeof fetch = fetch): EvaluationApiClient {
  return {
    listVariants: () => get('/api/industry/v1/eval/variants'),
    listDatasets: () => get('/api/industry/v1/eval/datasets'),
    getDataset: (datasetId) => get(`/api/industry/v1/eval/datasets/${encodeURIComponent(datasetId)}`),
    listCases: (datasetId) => get(`/api/industry/v1/eval/datasets/${encodeURIComponent(datasetId)}/cases`),
    createDraftCase: (datasetId, input) => post(`/api/industry/v1/eval/datasets/${encodeURIComponent(datasetId)}/cases`, input),
    playgroundIntent: (input) => post('/api/industry/v1/eval/playground/intent', input),
    listRetrievalCases: () => get('/api/industry/v1/eval/retrieval/cases'),
    playgroundRetrieval: (input) => post('/api/industry/v1/eval/playground/retrieval', input),
    getRetrievalLeakageReport: () => get('/api/industry/v1/eval/retrieval/leakage'),
    listRuns: () => get('/api/industry/v1/eval/runs'),
    startIntentRun: (input) => post('/api/industry/v1/eval/runs', input),
    listObservations: (runId) => get(`/api/industry/v1/eval/runs/${encodeURIComponent(runId)}/observations`),
    compareRuns: (baselineRunId, candidateRunId) => post('/api/industry/v1/eval/compare', { baselineRunId, candidateRunId }),
  }

  async function get<T>(path: string): Promise<T> {
    return request<T>(path, { method: 'GET' })
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetcher(path, { ...init, credentials: 'same-origin' })
    const payload: unknown = await response.json()
    if (!response.ok) {
      if (isApiErrorEnvelope(payload)) {
        throw new IndustryApiClientError(payload.error.code, payload.error.message, payload.error.requestId, payload.error.retryable)
      }
      throw new IndustryApiClientError('INDUSTRY_API_ERROR', `request failed with status ${response.status}`, 'unknown', false)
    }
    if (!isEvalEnvelope(payload)) throw new IndustryApiClientError('INVALID_API_RESPONSE', 'invalid eval API response', 'unknown', false)
    return payload.data as T
  }
}

function isEvalEnvelope(value: unknown): value is EvalApiEnvelope<unknown> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && (value as { apiVersion?: unknown }).apiVersion === 'eval-api-v1'
    && 'data' in value
}

function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('error' in value)) return false
  const error = (value as { error?: unknown }).error
  return typeof error === 'object'
    && error !== null
    && !Array.isArray(error)
    && typeof (error as { code?: unknown }).code === 'string'
    && typeof (error as { message?: unknown }).message === 'string'
    && typeof (error as { requestId?: unknown }).requestId === 'string'
    && typeof (error as { retryable?: unknown }).retryable === 'boolean'
}
