import type { CreateIntentDraftCaseRequest, EvalDatasetSummary, IntentDatasetDetail, IntentEvalCase } from '../../../../shared/industry/eval/datasets'
import type { EvalVariantSummary } from '../../../../shared/industry/eval/common'
import type {
  MutationEvalCase,
  MutationEvalFailureSummary,
  MutationEvalObservation,
  MutationEvalRunSummary,
  StartMutationEvalRunRequest,
} from '../../../../shared/industry/eval/mutation'
import type {
  RetrievalComparisonType,
  RetrievalEvalCase,
  RetrievalEvalObservation,
  RetrievalLeakageReport,
  RetrievalPlaygroundRequest,
  RetrievalPlaygroundResult,
  RetrievalRunComparison,
  RetrievalRunSummary,
  StartRetrievalRunRequest,
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
  listRetrievalRuns(context: TrustedRequestContext): Promise<readonly RetrievalRunSummary[]>
  startRetrievalRun(context: TrustedRequestContext, request: StartRetrievalRunRequest): Promise<RetrievalRunSummary>
  getRetrievalRun(context: TrustedRequestContext, runId: string): Promise<RetrievalRunSummary>
  listRetrievalObservations(context: TrustedRequestContext, runId: string): Promise<readonly RetrievalEvalObservation[]>
  compareRetrievalRuns(
    context: TrustedRequestContext,
    baselineRunId: string,
    candidateRunId: string,
    comparisonType: RetrievalComparisonType,
  ): Promise<RetrievalRunComparison>
  listMutationEvalCases(context: TrustedRequestContext): Promise<readonly MutationEvalCase[]>
  listMutationEvalRuns(context: TrustedRequestContext): Promise<readonly MutationEvalRunSummary[]>
  startMutationEvalRun(context: TrustedRequestContext, request: StartMutationEvalRunRequest): Promise<MutationEvalRunSummary>
  getMutationEvalRun(context: TrustedRequestContext, runId: string): Promise<MutationEvalRunSummary>
  listMutationEvalObservations(context: TrustedRequestContext, runId: string): Promise<readonly MutationEvalObservation[]>
  listMutationEvalFailures(context: TrustedRequestContext, runId: string): Promise<readonly MutationEvalFailureSummary[]>
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
