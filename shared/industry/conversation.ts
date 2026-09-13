import type {
  UiActionInteractionAcceptedEventPayload,
  UiActionPresentedEventPayload,
} from './ui-actions'

export const INDUSTRY_EVENT_VERSION = 'industry-event-v1' as const

export type IndustryConversationStatus = 'ACTIVE' | 'ABORTED'
export type IndustryMessageRole = 'USER' | 'ASSISTANT'

export interface IndustryConversationMessage {
  messageId: string
  role: IndustryMessageRole
  text: string
  createdAt: string
  traceId: string
}

export interface IndustryConversation {
  conversationId: string
  projectId: string
  title?: string
  status: IndustryConversationStatus
  createdAt: string
  updatedAt: string
  messages: readonly IndustryConversationMessage[]
  lastSequenceNo: number
}

export interface CreateConversationRequest {
  title?: string
}

export interface SendConversationMessageRequest {
  text: string
}

export interface IndustryEventEnvelope<T = unknown> {
  schemaVersion: typeof INDUSTRY_EVENT_VERSION
  eventId: string
  sequenceNo: number
  traceId: string
  requestId: string
  conversationId?: string
  type: string
  timestamp: string
  payload: T
}

export interface ConversationCreatedEventPayload {
  projectId: string
}

export interface UserMessageAcceptedEventPayload {
  messageId: string
  text: string
}

export interface AssistantMessageEventPayload {
  messageId: string
  text: string
}

export interface ConversationAbortedEventPayload {
  reason: 'USER_ABORT'
}

export type KnownIndustryEvent =
  | IndustryEventEnvelope<ConversationCreatedEventPayload>
  | IndustryEventEnvelope<UserMessageAcceptedEventPayload>
  | IndustryEventEnvelope<AssistantMessageEventPayload>
  | IndustryEventEnvelope<UiActionPresentedEventPayload>
  | IndustryEventEnvelope<UiActionInteractionAcceptedEventPayload>
  | IndustryEventEnvelope<ConversationAbortedEventPayload>

export interface IndustryEventBatch {
  conversationId: string
  afterSequenceNo: number
  latestSequenceNo: number
  events: readonly IndustryEventEnvelope[]
}
