import type { EvalVariantSummary } from '../../../shared/industry/eval/common'
import type { CreateIntentDraftCaseRequest, EvalDatasetSummary, IntentDatasetDetail, IntentEvalCase, IntentTurn } from '../../../shared/industry/eval/datasets'
import type {
  MutationEvalCase,
  MutationEvalFailureSummary,
  MutationEvalObservation,
  MutationEvalRunSummary,
  MutationEvalVariant,
} from '../../../shared/industry/eval/mutation'
import type {
  RagEvalCase,
  RagEvalFailureSummary,
  RagEvalObservation,
  RagEvalRunSummary,
  RagEvalVariant,
} from '../../../shared/industry/eval/rag'
import type {
  RetrievalComparisonType,
  RetrievalDomain,
  RetrievalEvalCase,
  RetrievalEvalObservation,
  RetrievalLeakageReport,
  RetrievalPlaygroundResult,
  RetrievalRunComparison,
  RetrievalRunSummary,
} from '../../../shared/industry/eval/retrieval'
import type { EvalRunSummary, IntentEvalObservation, IntentPlaygroundResult, IntentRunComparison } from '../../../shared/industry/eval/runs'
import type {
  TraceEvalCase,
  TraceEvalFailureSummary,
  TraceEvalObservation,
  TraceEvalRunSummary,
  TraceEvalVariant,
} from '../../../shared/industry/eval/trace'

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
  listRetrievalRuns(): Promise<readonly RetrievalRunSummary[]>
  startRetrievalRun(input: { datasetId: string; variantId: string }): Promise<RetrievalRunSummary>
  getRetrievalRun(runId: string): Promise<RetrievalRunSummary>
  listRetrievalObservations(runId: string): Promise<readonly RetrievalEvalObservation[]>
  compareRetrievalRuns(baselineRunId: string, candidateRunId: string, comparisonType: RetrievalComparisonType): Promise<RetrievalRunComparison>
  listMutationEvalCases(): Promise<readonly MutationEvalCase[]>
  listMutationEvalRuns(): Promise<readonly MutationEvalRunSummary[]>
  startMutationEvalRun(input: { datasetId: string; variantId: MutationEvalVariant }): Promise<MutationEvalRunSummary>
  getMutationEvalRun(runId: string): Promise<MutationEvalRunSummary>
  listMutationEvalObservations(runId: string): Promise<readonly MutationEvalObservation[]>
  listMutationEvalFailures(runId: string): Promise<readonly MutationEvalFailureSummary[]>
  listTraceEvalCases(): Promise<readonly TraceEvalCase[]>
  listTraceEvalRuns(): Promise<readonly TraceEvalRunSummary[]>
  startTraceEvalRun(input: { datasetId: string; variantId: TraceEvalVariant }): Promise<TraceEvalRunSummary>
  getTraceEvalRun(runId: string): Promise<TraceEvalRunSummary>
  listTraceEvalObservations(runId: string): Promise<readonly TraceEvalObservation[]>
  listTraceEvalFailures(runId: string): Promise<readonly TraceEvalFailureSummary[]>
  listRagEvalCases(): Promise<readonly RagEvalCase[]>
  listRagEvalRuns(): Promise<readonly RagEvalRunSummary[]>
  startRagEvalRun(input: { datasetId: string; variantId: RagEvalVariant }): Promise<RagEvalRunSummary>
  getRagEvalRun(runId: string): Promise<RagEvalRunSummary>
  listRagEvalObservations(runId: string): Promise<readonly RagEvalObservation[]>
  listRagEvalFailures(runId: string): Promise<readonly RagEvalFailureSummary[]>
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
    listRetrievalRuns: () => get('/api/industry/v1/eval/retrieval/runs'),
    startRetrievalRun: (input) => post('/api/industry/v1/eval/retrieval/runs', input),
    getRetrievalRun: (runId) => get(`/api/industry/v1/eval/retrieval/runs/${encodeURIComponent(runId)}`),
    listRetrievalObservations: (runId) => get(`/api/industry/v1/eval/retrieval/runs/${encodeURIComponent(runId)}/observations`),
    compareRetrievalRuns: (baselineRunId, candidateRunId, comparisonType) => post('/api/industry/v1/eval/retrieval/compare', { baselineRunId, candidateRunId, comparisonType }),
    listMutationEvalCases: () => get('/api/industry/v1/eval/mutation/cases'),
    listMutationEvalRuns: () => get('/api/industry/v1/eval/mutation/runs'),
    startMutationEvalRun: (input) => post('/api/industry/v1/eval/mutation/runs', input),
    getMutationEvalRun: (runId) => get(`/api/industry/v1/eval/mutation/runs/${encodeURIComponent(runId)}`),
    listMutationEvalObservations: (runId) => get(`/api/industry/v1/eval/mutation/runs/${encodeURIComponent(runId)}/observations`),
    listMutationEvalFailures: (runId) => get(`/api/industry/v1/eval/mutation/runs/${encodeURIComponent(runId)}/failures`),
    listTraceEvalCases: () => get('/api/industry/v1/eval/trace/cases'),
    listTraceEvalRuns: () => get('/api/industry/v1/eval/trace/runs'),
    startTraceEvalRun: (input) => post('/api/industry/v1/eval/trace/runs', input),
    getTraceEvalRun: (runId) => get(`/api/industry/v1/eval/trace/runs/${encodeURIComponent(runId)}`),
    listTraceEvalObservations: (runId) => get(`/api/industry/v1/eval/trace/runs/${encodeURIComponent(runId)}/observations`),
    listTraceEvalFailures: (runId) => get(`/api/industry/v1/eval/trace/runs/${encodeURIComponent(runId)}/failures`),
    listRagEvalCases: () => get('/api/industry/v1/eval/rag/cases'),
    listRagEvalRuns: () => get('/api/industry/v1/eval/rag/runs'),
    startRagEvalRun: (input) => post('/api/industry/v1/eval/rag/runs', input),
    getRagEvalRun: (runId) => get(`/api/industry/v1/eval/rag/runs/${encodeURIComponent(runId)}`),
    listRagEvalObservations: (runId) => get(`/api/industry/v1/eval/rag/runs/${encodeURIComponent(runId)}/observations`),
    listRagEvalFailures: (runId) => get(`/api/industry/v1/eval/rag/runs/${encodeURIComponent(runId)}/failures`),
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
