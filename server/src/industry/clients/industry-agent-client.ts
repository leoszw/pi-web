import type { AuthorizedProject } from '../../../../shared/industry/common'
import type {
  CreateConversationRequest,
  IndustryConversation,
  IndustryEventBatch,
  SendConversationMessageRequest,
} from '../../../../shared/industry/conversation'
import type {
  ConfirmMutationRequest,
  MutationAuditTrail,
  MutationOperation,
  MutationReconciliationList,
  RejectMutationRequest,
} from '../../../../shared/industry/mutation'
import type { RetrievalDebugResult } from '../../../../shared/industry/retrieval-debug'
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
  sendConversationMessage(
    context: TrustedRequestContext,
    conversationId: string,
    request: SendConversationMessageRequest,
    requestId: string,
  ): Promise<IndustryConversation>
  interactWithUiAction(
    context: TrustedRequestContext,
    conversationId: string,
    actionId: string,
    request: UiActionInteractionRequest,
    requestId: string,
  ): Promise<UiActionInteractionResult>
  abortConversation(context: TrustedRequestContext, conversationId: string, requestId: string): Promise<IndustryConversation>
  getConversationEvents(context: TrustedRequestContext, conversationId: string, afterSequenceNo: number): Promise<IndustryEventBatch>
  listMutations(context: TrustedRequestContext): Promise<readonly MutationOperation[]>
  getMutation(context: TrustedRequestContext, operationId: string): Promise<MutationOperation>
  confirmMutation(
    context: TrustedRequestContext,
    operationId: string,
    request: ConfirmMutationRequest,
    idempotencyKey: string,
    requestId: string,
  ): Promise<MutationOperation>
  rejectMutation(
    context: TrustedRequestContext,
    operationId: string,
    request: RejectMutationRequest,
    requestId: string,
  ): Promise<MutationOperation>
  getMutationAudit(context: TrustedRequestContext, operationId: string): Promise<MutationAuditTrail>
  listMutationReconciliation(context: TrustedRequestContext): Promise<MutationReconciliationList>
  listTraces(context: TrustedRequestContext): Promise<readonly TraceSummary[]>
  getTrace(context: TrustedRequestContext, traceId: string, access: TraceAccessProfile): Promise<TraceDetail>
  getTraceTimeline(context: TrustedRequestContext, traceId: string, access: TraceAccessProfile): Promise<readonly TraceTimelineEvent[]>
  getTraceTree(context: TrustedRequestContext, traceId: string, access: TraceAccessProfile): Promise<TraceTree>
  getTraceStats(context: TrustedRequestContext, traceId: string): Promise<TraceStats>
  getRetrievalDebug(context: TrustedRequestContext, traceId: string): Promise<RetrievalDebugResult>
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
