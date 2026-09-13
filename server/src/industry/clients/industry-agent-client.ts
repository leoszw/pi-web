import type { AuthorizedProject } from '../../../../shared/industry/common'
import type {
  CreateConversationRequest,
  IndustryConversation,
  IndustryEventBatch,
  SendConversationMessageRequest,
} from '../../../../shared/industry/conversation'
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
