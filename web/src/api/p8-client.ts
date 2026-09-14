import type { AgentLoopRun, StartAgentLoopRunRequest } from '../../../shared/industry/agent-loop'
import type {
  P8EvalCase,
  P8EvalDomain,
  P8EvalFailureSummary,
  P8EvalObservation,
  P8EvalRunSummary,
  P8EvalVariant,
} from '../../../shared/industry/eval/p8'
import type {
  CreateMultimodalAnalysisRequest,
  MultimodalAnalysis,
  ReviewMultimodalObservationRequest,
} from '../../../shared/industry/multimodal'

interface DataEnvelope<T> { apiVersion: 'industry-api-v1' | 'eval-api-v1'; data: T }
interface ErrorEnvelope { error: { requestId: string; code: string; message: string; retryable: boolean } }

export interface P8ApiClient {
  listMultimodalAnalyses(): Promise<readonly MultimodalAnalysis[]>
  createMultimodalAnalysis(input: CreateMultimodalAnalysisRequest): Promise<MultimodalAnalysis>
  getMultimodalAnalysis(analysisId: string): Promise<MultimodalAnalysis>
  reviewMultimodalObservation(analysisId: string, observationId: string, input: ReviewMultimodalObservationRequest): Promise<MultimodalAnalysis>
  listAgentLoopRuns(): Promise<readonly AgentLoopRun[]>
  startAgentLoopRun(input: StartAgentLoopRunRequest): Promise<AgentLoopRun>
  getAgentLoopRun(runId: string): Promise<AgentLoopRun>
  listEvalCases(domain: P8EvalDomain): Promise<readonly P8EvalCase[]>
  listEvalRuns(domain: P8EvalDomain): Promise<readonly P8EvalRunSummary[]>
  startEvalRun(domain: P8EvalDomain, input: { datasetId: string; variantId: P8EvalVariant }): Promise<P8EvalRunSummary>
  getEvalRun(runId: string): Promise<P8EvalRunSummary>
  listEvalObservations(runId: string): Promise<readonly P8EvalObservation[]>
  listEvalFailures(runId: string): Promise<readonly P8EvalFailureSummary[]>
}

export class P8ApiError extends Error {
  constructor(readonly code: string, message: string, readonly requestId: string, readonly retryable: boolean) { super(message); this.name = 'P8ApiError' }
}

export function createP8ApiClient(fetcher: typeof fetch = fetch): P8ApiClient {
  return {
    listMultimodalAnalyses: () => get('/api/industry/v1/multimodal/analyses', 'industry-api-v1'),
    createMultimodalAnalysis: (input) => post('/api/industry/v1/multimodal/analyses', input, 'industry-api-v1'),
    getMultimodalAnalysis: (analysisId) => get(`/api/industry/v1/multimodal/analyses/${encodeURIComponent(analysisId)}`, 'industry-api-v1'),
    reviewMultimodalObservation: (analysisId, observationId, input) => post(`/api/industry/v1/multimodal/analyses/${encodeURIComponent(analysisId)}/observations/${encodeURIComponent(observationId)}/review`, input, 'industry-api-v1'),
    listAgentLoopRuns: () => get('/api/industry/v1/agent-loop/runs', 'industry-api-v1'),
    startAgentLoopRun: (input) => post('/api/industry/v1/agent-loop/runs', input, 'industry-api-v1'),
    getAgentLoopRun: (runId) => get(`/api/industry/v1/agent-loop/runs/${encodeURIComponent(runId)}`, 'industry-api-v1'),
    listEvalCases: (domain) => get(`/api/industry/v1/eval/p8/${evalSegment(domain)}/cases`, 'eval-api-v1'),
    listEvalRuns: (domain) => get(`/api/industry/v1/eval/p8/${evalSegment(domain)}/runs`, 'eval-api-v1'),
    startEvalRun: (domain, input) => post(`/api/industry/v1/eval/p8/${evalSegment(domain)}/runs`, input, 'eval-api-v1'),
    getEvalRun: (runId) => get(`/api/industry/v1/eval/p8/runs/${encodeURIComponent(runId)}`, 'eval-api-v1'),
    listEvalObservations: (runId) => get(`/api/industry/v1/eval/p8/runs/${encodeURIComponent(runId)}/observations`, 'eval-api-v1'),
    listEvalFailures: (runId) => get(`/api/industry/v1/eval/p8/runs/${encodeURIComponent(runId)}/failures`, 'eval-api-v1'),
  }

  async function get<T>(path: string, version: DataEnvelope<T>['apiVersion']): Promise<T> { return request(path, { method: 'GET' }, version) }
  async function post<T>(path: string, body: unknown, version: DataEnvelope<T>['apiVersion']): Promise<T> { return request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, version) }
  async function request<T>(path: string, init: RequestInit, version: DataEnvelope<T>['apiVersion']): Promise<T> {
    const response = await fetcher(path, { ...init, credentials: 'same-origin' })
    const payload: unknown = await response.json()
    if (!response.ok) {
      if (isErrorEnvelope(payload)) throw new P8ApiError(payload.error.code, payload.error.message, payload.error.requestId, payload.error.retryable)
      throw new P8ApiError('INDUSTRY_API_ERROR', `request failed with status ${response.status}`, 'unknown', false)
    }
    if (!isEnvelope(payload, version)) throw new P8ApiError('INVALID_API_RESPONSE', 'invalid P8 API response', 'unknown', false)
    return payload.data as T
  }
}

function evalSegment(domain: P8EvalDomain): string { return domain === 'MULTIMODAL' ? 'multimodal' : 'agent-loop' }
function isEnvelope(value: unknown, version: DataEnvelope<unknown>['apiVersion']): value is DataEnvelope<unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as { apiVersion?: unknown }).apiVersion === version && 'data' in value }
function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('error' in value)) return false
  const error = (value as { error?: unknown }).error
  return typeof error === 'object' && error !== null && !Array.isArray(error)
    && typeof (error as { requestId?: unknown }).requestId === 'string'
    && typeof (error as { code?: unknown }).code === 'string'
    && typeof (error as { message?: unknown }).message === 'string'
    && typeof (error as { retryable?: unknown }).retryable === 'boolean'
}
