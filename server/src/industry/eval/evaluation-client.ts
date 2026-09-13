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
  P7EvalCase,
  P7EvalDomain,
  P7EvalDraft,
  P7EvalFailureSummary,
  P7EvalObservation,
  P7EvalRunSummary,
  StartP7EvalRunRequest,
} from '../../../../shared/industry/eval/p7'
import type {
  RagEvalCase,
  RagEvalFailureSummary,
  RagEvalObservation,
  RagEvalRunSummary,
  StartRagEvalRunRequest,
} from '../../../../shared/industry/eval/rag'
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
import type {
  StartTraceEvalRunRequest,
  TraceEvalCase,
  TraceEvalFailureSummary,
  TraceEvalObservation,
  TraceEvalRunSummary,
} from '../../../../shared/industry/eval/trace'
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
  compareRetrievalRuns(context: TrustedRequestContext, baselineRunId: string, candidateRunId: string, comparisonType: RetrievalComparisonType): Promise<RetrievalRunComparison>
  listMutationEvalCases(context: TrustedRequestContext): Promise<readonly MutationEvalCase[]>
  listMutationEvalRuns(context: TrustedRequestContext): Promise<readonly MutationEvalRunSummary[]>
  startMutationEvalRun(context: TrustedRequestContext, request: StartMutationEvalRunRequest): Promise<MutationEvalRunSummary>
  getMutationEvalRun(context: TrustedRequestContext, runId: string): Promise<MutationEvalRunSummary>
  listMutationEvalObservations(context: TrustedRequestContext, runId: string): Promise<readonly MutationEvalObservation[]>
  listMutationEvalFailures(context: TrustedRequestContext, runId: string): Promise<readonly MutationEvalFailureSummary[]>
  listTraceEvalCases(context: TrustedRequestContext): Promise<readonly TraceEvalCase[]>
  listTraceEvalRuns(context: TrustedRequestContext): Promise<readonly TraceEvalRunSummary[]>
  startTraceEvalRun(context: TrustedRequestContext, request: StartTraceEvalRunRequest): Promise<TraceEvalRunSummary>
  getTraceEvalRun(context: TrustedRequestContext, runId: string): Promise<TraceEvalRunSummary>
  listTraceEvalObservations(context: TrustedRequestContext, runId: string): Promise<readonly TraceEvalObservation[]>
  listTraceEvalFailures(context: TrustedRequestContext, runId: string): Promise<readonly TraceEvalFailureSummary[]>
  listRagEvalCases(context: TrustedRequestContext): Promise<readonly RagEvalCase[]>
  listRagEvalRuns(context: TrustedRequestContext): Promise<readonly RagEvalRunSummary[]>
  startRagEvalRun(context: TrustedRequestContext, request: StartRagEvalRunRequest): Promise<RagEvalRunSummary>
  getRagEvalRun(context: TrustedRequestContext, runId: string): Promise<RagEvalRunSummary>
  listRagEvalObservations(context: TrustedRequestContext, runId: string): Promise<readonly RagEvalObservation[]>
  listRagEvalFailures(context: TrustedRequestContext, runId: string): Promise<readonly RagEvalFailureSummary[]>
  listP7EvalCases(context: TrustedRequestContext, domain: P7EvalDomain): Promise<readonly P7EvalCase[]>
  listP7EvalRuns(context: TrustedRequestContext, domain: P7EvalDomain): Promise<readonly P7EvalRunSummary[]>
  startP7EvalRun(context: TrustedRequestContext, domain: P7EvalDomain, request: StartP7EvalRunRequest): Promise<P7EvalRunSummary>
  getP7EvalRun(context: TrustedRequestContext, runId: string): Promise<P7EvalRunSummary>
  listP7EvalObservations(context: TrustedRequestContext, runId: string): Promise<readonly P7EvalObservation[]>
  listP7EvalFailures(context: TrustedRequestContext, runId: string): Promise<readonly P7EvalFailureSummary[]>
  listP7Drafts(context: TrustedRequestContext): Promise<readonly P7EvalDraft[]>
  createP7DraftFromTrace(context: TrustedRequestContext, traceId: string, targetDomain: P7EvalDomain, sourceTraceName: string): Promise<P7EvalDraft>
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
