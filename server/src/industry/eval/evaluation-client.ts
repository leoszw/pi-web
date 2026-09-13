import type { CreateIntentDraftCaseRequest, EvalDatasetSummary, IntentDatasetDetail, IntentEvalCase } from '../../../../shared/industry/eval/datasets'
import type { EvalVariantSummary } from '../../../../shared/industry/eval/common'
import type {
  RetrievalEvalCase,
  RetrievalLeakageReport,
  RetrievalPlaygroundRequest,
  RetrievalPlaygroundResult,
} from '../../../../shared/industry/eval/retrieval'
import type {
  EvalRunSummary,
  IntentEvalObservation,
  IntentPlaygroundRequest,
  IntentPlaygroundResult,
  IntentRunComparison,
  StartIntentRunRequest,
} from '../../../../shared/industry/eval/runs'
import type { TrustedRequestContext } from '../context'

export interface EvaluationClient {
  listVariants(context: TrustedRequestContext): Promise<readonly EvalVariantSummary[]>
  listDatasets(context: TrustedRequestContext): Promise<readonly EvalDatasetSummary[]>
  getDataset(context: TrustedRequestContext, datasetId: string): Promise<IntentDatasetDetail>
  listCases(context: TrustedRequestContext, datasetId: string): Promise<readonly IntentEvalCase[]>
  createDraftCase(context: TrustedRequestContext, datasetId: string, request: CreateIntentDraftCaseRequest): Promise<IntentEvalCase>
  playgroundIntent(context: TrustedRequestContext, request: IntentPlaygroundRequest): Promise<IntentPlaygroundResult>
  listRetrievalCases(context: TrustedRequestContext): Promise<readonly RetrievalEvalCase[]>
  playgroundRetrieval(context: TrustedRequestContext, request: RetrievalPlaygroundRequest): Promise<RetrievalPlaygroundResult>
  getRetrievalLeakageReport(context: TrustedRequestContext): Promise<RetrievalLeakageReport>
  listRuns(context: TrustedRequestContext): Promise<readonly EvalRunSummary[]>
  startIntentRun(context: TrustedRequestContext, request: StartIntentRunRequest): Promise<EvalRunSummary>
  getRun(context: TrustedRequestContext, runId: string): Promise<EvalRunSummary>
  listObservations(context: TrustedRequestContext, runId: string): Promise<readonly IntentEvalObservation[]>
  compareRuns(context: TrustedRequestContext, baselineRunId: string, candidateRunId: string): Promise<IntentRunComparison>
}

export class EvaluationClientError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(code: string, message: string, statusCode: number) {
    super(message)
    this.name = 'EvaluationClientError'
    this.code = code
    this.statusCode = statusCode
  }
}
