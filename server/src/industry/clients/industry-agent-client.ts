import type { AuthorizedProject } from '../../../../shared/industry/common'
import type {
  AgentLoopRun,
  StartAgentLoopRunRequest,
} from '../../../../shared/industry/agent-loop'
import type {
  CreateConversationRequest,
  IndustryConversation,
  IndustryEventBatch,
  SendConversationMessageRequest,
} from '../../../../shared/industry/conversation'
import type {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeIngestion,
  KnowledgeUploadOptions,
  KnowledgeUploadRequest,
} from '../../../../shared/industry/knowledge'
import type {
  CreateMultimodalAnalysisRequest,
  MultimodalAnalysis,
  ReviewMultimodalObservationRequest,
} from '../../../../shared/industry/multimodal'
import type {
  ConfirmMutationRequest,
  MutationAuditTrail,
  MutationOperation,
  MutationReconciliationList,
  RejectMutationRequest,
} from '../../../../shared/industry/mutation'
import type { ReportArtifact, ReportDownloadGrant } from '../../../../shared/industry/report'
import type { RetrievalDebugResult } from '../../../../shared/industry/retrieval-debug'
import type { SandboxRun, StartSandboxRunRequest } from '../../../../shared/industry/sandbox'
import type {
  TraceAccessProfile,
  TraceDetail,
  TraceStats,
  TraceSummary,
  TraceTimelineEvent,
  TraceTree,
} from '../../../../shared/industry/trace'
import type { UiActionInteractionRequest, UiActionInteractionResult } from '../../../../shared/industry/ui-actions'
import type { AuthPrincipal } from '../auth'
import type { TrustedRequestContext } from '../context'

export interface IndustryAgentHealth {
  status: 'ok'
  adapter: 'mock'
}

export interface IndustryAgentClient {
  getHealth(context: TrustedRequestContext): Promise<IndustryAgentHealth>
  listAuthorizedProjects(principal: AuthPrincipal): Promise<readonly AuthorizedProject[]>
  createConversation(context: TrustedRequestContext, request: CreateConversationRequest, requestId: string): Promise<IndustryConversation>
  getConversation(context: TrustedRequestContext, conversationId: string): Promise<IndustryConversation>
  sendConversationMessage(context: TrustedRequestContext, conversationId: string, request: SendConversationMessageRequest, requestId: string): Promise<IndustryConversation>
  interactWithUiAction(context: TrustedRequestContext, conversationId: string, actionId: string, request: UiActionInteractionRequest, requestId: string): Promise<UiActionInteractionResult>
  abortConversation(context: TrustedRequestContext, conversationId: string, requestId: string): Promise<IndustryConversation>
  getConversationEvents(context: TrustedRequestContext, conversationId: string, afterSequenceNo: number): Promise<IndustryEventBatch>
  listMutations(context: TrustedRequestContext): Promise<readonly MutationOperation[]>
  getMutation(context: TrustedRequestContext, operationId: string): Promise<MutationOperation>
  confirmMutation(context: TrustedRequestContext, operationId: string, request: ConfirmMutationRequest, idempotencyKey: string, requestId: string): Promise<MutationOperation>
  rejectMutation(context: TrustedRequestContext, operationId: string, request: RejectMutationRequest, requestId: string): Promise<MutationOperation>
  getMutationAudit(context: TrustedRequestContext, operationId: string): Promise<MutationAuditTrail>
  listMutationReconciliation(context: TrustedRequestContext): Promise<MutationReconciliationList>
  listTraces(context: TrustedRequestContext): Promise<readonly TraceSummary[]>
  getTrace(context: TrustedRequestContext, traceId: string, access: TraceAccessProfile): Promise<TraceDetail>
  getTraceTimeline(context: TrustedRequestContext, traceId: string, access: TraceAccessProfile): Promise<readonly TraceTimelineEvent[]>
  getTraceTree(context: TrustedRequestContext, traceId: string, access: TraceAccessProfile): Promise<TraceTree>
  getTraceStats(context: TrustedRequestContext, traceId: string): Promise<TraceStats>
  getRetrievalDebug(context: TrustedRequestContext, traceId: string): Promise<RetrievalDebugResult>
  getKnowledgeUploadOptions(context: TrustedRequestContext): Promise<KnowledgeUploadOptions>
  listKnowledgeDocuments(context: TrustedRequestContext): Promise<readonly KnowledgeDocument[]>
  uploadKnowledgeDocument(context: TrustedRequestContext, request: KnowledgeUploadRequest): Promise<KnowledgeDocument>
  getKnowledgeDocument(context: TrustedRequestContext, documentId: string): Promise<KnowledgeDocument>
  reingestKnowledgeDocument(context: TrustedRequestContext, documentId: string): Promise<KnowledgeDocument>
  listKnowledgeChunks(context: TrustedRequestContext, documentId: string): Promise<readonly KnowledgeChunk[]>
  getKnowledgeIngestion(context: TrustedRequestContext, ingestionId: string): Promise<KnowledgeIngestion>
  listMultimodalAnalyses(context: TrustedRequestContext): Promise<readonly MultimodalAnalysis[]>
  createMultimodalAnalysis(context: TrustedRequestContext, request: CreateMultimodalAnalysisRequest): Promise<MultimodalAnalysis>
  getMultimodalAnalysis(context: TrustedRequestContext, analysisId: string): Promise<MultimodalAnalysis>
  reviewMultimodalObservation(context: TrustedRequestContext, analysisId: string, observationId: string, request: ReviewMultimodalObservationRequest): Promise<MultimodalAnalysis>
  listAgentLoopRuns(context: TrustedRequestContext): Promise<readonly AgentLoopRun[]>
  startAgentLoopRun(context: TrustedRequestContext, request: StartAgentLoopRunRequest): Promise<AgentLoopRun>
  getAgentLoopRun(context: TrustedRequestContext, runId: string): Promise<AgentLoopRun>
  listReports(context: TrustedRequestContext): Promise<readonly ReportArtifact[]>
  getReport(context: TrustedRequestContext, reportId: string): Promise<ReportArtifact>
  createReportDownloadGrant(context: TrustedRequestContext, reportId: string): Promise<ReportDownloadGrant>
  listSandboxRuns(context: TrustedRequestContext): Promise<readonly SandboxRun[]>
  startSandboxRun(context: TrustedRequestContext, request: StartSandboxRunRequest): Promise<SandboxRun>
  getSandboxRun(context: TrustedRequestContext, runId: string): Promise<SandboxRun>
}

export class IndustryAgentClientError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(code: string, message: string, statusCode: number) {
    super(message)
    this.name = 'IndustryAgentClientError'
    this.code = code
    this.statusCode = statusCode
  }
}
