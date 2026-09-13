import { randomUUID } from 'node:crypto'
import type { AuthorizedProject } from '../../../../shared/industry/common'
import type {
  CreateConversationRequest,
  IndustryConversation,
  IndustryConversationMessage,
  IndustryEventBatch,
  IndustryEventEnvelope,
  SendConversationMessageRequest,
} from '../../../../shared/industry/conversation'
import type {
  UiActionEnvelope,
  UiActionInteractionAcceptedEventPayload,
  UiActionInteractionRequest,
  UiActionInteractionResult,
  UiActionPresentedEventPayload,
} from '../../../../shared/industry/ui-actions'
import type { AuthPrincipal } from '../auth'
import type { TrustedRequestContext } from '../context'
import {
  applyMockUiActionInteraction,
  buildMockUiActions,
  MockUiActionInteractionError,
} from '../ui-action-fixtures'
import { IndustryAgentClientError, type IndustryAgentClient, type IndustryAgentHealth } from './industry-agent-client'

export interface MockAuthorizedProject extends AuthorizedProject {
  tenantId: string
}

interface StoredConversation {
  conversation: IndustryConversation
  events: IndustryEventEnvelope[]
}

export class MockIndustryAgentClient implements IndustryAgentClient {
  readonly #projects: readonly MockAuthorizedProject[]
  readonly #conversations = new Map<string, StoredConversation>()

  constructor(projects: readonly MockAuthorizedProject[]) {
    this.#projects = projects.map((project) => ({ ...project }))
  }

  async getHealth(_context: TrustedRequestContext): Promise<IndustryAgentHealth> {
    return { status: 'ok', adapter: 'mock' }
  }

  async listAuthorizedProjects(principal: AuthPrincipal): Promise<readonly AuthorizedProject[]> {
    return this.#projects
      .filter((project) => project.tenantId === principal.tenantId && principal.companyIds.includes(project.companyId))
      .map(({ projectId, companyId, name }) => ({ projectId, companyId, name }))
  }

  async createConversation(
    context: TrustedRequestContext,
    request: CreateConversationRequest,
    requestId: string,
  ): Promise<IndustryConversation> {
    const projectId = requireProject(context)
    const now = new Date().toISOString()
    const conversationId = `conversation-${randomUUID()}`
    const traceId = `trace-${randomUUID()}`
    const conversation: IndustryConversation = {
      conversationId,
      projectId,
      ...(request.title === undefined ? {} : { title: request.title }),
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      messages: [],
      lastSequenceNo: 1,
    }
    const events: IndustryEventEnvelope[] = [eventEnvelope({
      conversationId,
      sequenceNo: 1,
      traceId,
      requestId,
      type: 'conversation.created',
      timestamp: now,
      payload: { projectId },
    })]
    this.#conversations.set(conversationId, { conversation, events })
    return cloneConversation(conversation)
  }

  async getConversation(context: TrustedRequestContext, conversationId: string): Promise<IndustryConversation> {
    return cloneConversation(this.#requireConversation(context, conversationId).conversation)
  }

  async sendConversationMessage(
    context: TrustedRequestContext,
    conversationId: string,
    request: SendConversationMessageRequest,
    requestId: string,
  ): Promise<IndustryConversation> {
    const stored = this.#requireConversation(context, conversationId)
    requireActive(stored.conversation)

    const now = new Date().toISOString()
    const userTraceId = `trace-${randomUUID()}`
    const userMessage: IndustryConversationMessage = {
      messageId: `message-${randomUUID()}`,
      role: 'USER',
      text: request.text,
      createdAt: now,
      traceId: userTraceId,
    }
    const assistantTraceId = `trace-${randomUUID()}`
    const assistantMessage: IndustryConversationMessage = {
      messageId: `message-${randomUUID()}`,
      role: 'ASSISTANT',
      text: mockAssistantText(request.text),
      createdAt: now,
      traceId: assistantTraceId,
    }
    const actions = buildMockUiActions(request.text, assistantTraceId)

    const userSequenceNo = stored.conversation.lastSequenceNo + 1
    const assistantSequenceNo = userSequenceNo + 1
    const actionEvents = actions.map((action, index) => eventEnvelope({
      conversationId,
      sequenceNo: assistantSequenceNo + index + 1,
      traceId: assistantTraceId,
      requestId,
      type: 'ui.action.presented',
      timestamp: now,
      payload: { action },
    }))
    stored.events.push(
      eventEnvelope({
        conversationId,
        sequenceNo: userSequenceNo,
        traceId: userTraceId,
        requestId,
        type: 'message.user.accepted',
        timestamp: now,
        payload: { messageId: userMessage.messageId, text: userMessage.text },
      }),
      eventEnvelope({
        conversationId,
        sequenceNo: assistantSequenceNo,
        traceId: assistantTraceId,
        requestId,
        type: 'message.assistant.completed',
        timestamp: now,
        payload: { messageId: assistantMessage.messageId, text: assistantMessage.text },
      }),
      ...actionEvents,
    )
    stored.conversation = {
      ...stored.conversation,
      updatedAt: now,
      messages: [...stored.conversation.messages, userMessage, assistantMessage],
      lastSequenceNo: assistantSequenceNo + actions.length,
    }
    return cloneConversation(stored.conversation)
  }

  async interactWithUiAction(
    context: TrustedRequestContext,
    conversationId: string,
    actionId: string,
    request: UiActionInteractionRequest,
    requestId: string,
  ): Promise<UiActionInteractionResult> {
    const stored = this.#requireConversation(context, conversationId)
    requireActive(stored.conversation)
    const action = latestAction(stored.events, actionId)
    if (action === undefined) throw new IndustryAgentClientError('UI_ACTION_NOT_FOUND', 'UIAction not found', 404)
    if (action.type === 'mutation_confirmation') {
      throw new IndustryAgentClientError(
        'UI_ACTION_MUTATION_DISABLED_P3',
        'mutation confirmation is display-only in P3; commit is implemented in P4',
        409,
      )
    }

    let updatedAction: UiActionEnvelope
    try {
      updatedAction = applyMockUiActionInteraction(action, request.interaction)
    } catch (error) {
      if (error instanceof MockUiActionInteractionError) {
        throw new IndustryAgentClientError(error.code, error.message, error.statusCode)
      }
      throw error
    }

    const now = new Date().toISOString()
    const traceId = `trace-${randomUUID()}`
    const interactionId = `interaction-${randomUUID()}`
    updatedAction = { ...updatedAction, traceId }
    const acceptedSequenceNo = stored.conversation.lastSequenceNo + 1
    const presentedSequenceNo = acceptedSequenceNo + 1
    const acceptedPayload: UiActionInteractionAcceptedEventPayload = {
      interactionId,
      actionId,
      kind: request.interaction.kind,
    }
    stored.events.push(
      eventEnvelope({
        conversationId,
        sequenceNo: acceptedSequenceNo,
        traceId,
        requestId,
        type: 'ui.action.interaction.accepted',
        timestamp: now,
        payload: acceptedPayload,
      }),
      eventEnvelope({
        conversationId,
        sequenceNo: presentedSequenceNo,
        traceId,
        requestId,
        type: 'ui.action.presented',
        timestamp: now,
        payload: { action: updatedAction } satisfies UiActionPresentedEventPayload,
      }),
    )
    stored.conversation = {
      ...stored.conversation,
      updatedAt: now,
      lastSequenceNo: presentedSequenceNo,
    }
    return structuredClone({
      conversationId,
      interactionId,
      action: updatedAction,
      traceId,
      acceptedAt: now,
    })
  }

  async abortConversation(
    context: TrustedRequestContext,
    conversationId: string,
    requestId: string,
  ): Promise<IndustryConversation> {
    const stored = this.#requireConversation(context, conversationId)
    if (stored.conversation.status === 'ABORTED') return cloneConversation(stored.conversation)
    const now = new Date().toISOString()
    const sequenceNo = stored.conversation.lastSequenceNo + 1
    const traceId = `trace-${randomUUID()}`
    stored.events.push(eventEnvelope({
      conversationId,
      sequenceNo,
      traceId,
      requestId,
      type: 'conversation.aborted',
      timestamp: now,
      payload: { reason: 'USER_ABORT' },
    }))
    stored.conversation = {
      ...stored.conversation,
      status: 'ABORTED',
      updatedAt: now,
      lastSequenceNo: sequenceNo,
    }
    return cloneConversation(stored.conversation)
  }

  async getConversationEvents(
    context: TrustedRequestContext,
    conversationId: string,
    afterSequenceNo: number,
  ): Promise<IndustryEventBatch> {
    const stored = this.#requireConversation(context, conversationId)
    return {
      conversationId,
      afterSequenceNo,
      latestSequenceNo: stored.conversation.lastSequenceNo,
      events: structuredClone(stored.events.filter((event) => event.sequenceNo > afterSequenceNo)),
    }
  }

  #requireConversation(context: TrustedRequestContext, conversationId: string): StoredConversation {
    const projectId = requireProject(context)
    const stored = this.#conversations.get(conversationId)
    if (stored === undefined || stored.conversation.projectId !== projectId) {
      throw new IndustryAgentClientError('CONVERSATION_NOT_FOUND', 'conversation not found', 404)
    }
    return stored
  }
}

export function parseMockProjects(raw: string | undefined): readonly MockAuthorizedProject[] {
  if (raw === undefined || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('PI_WEB_MOCK_PROJECTS_JSON must be valid JSON')
  }
  if (!Array.isArray(parsed)) throw new Error('PI_WEB_MOCK_PROJECTS_JSON must be an array')
  return parsed.map((value, index) => parseProject(value, index))
}

function parseProject(value: unknown, index: number): MockAuthorizedProject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`mock project ${index} must be an object`)
  }
  const record = value as Record<string, unknown>
  return {
    tenantId: requireString(record.tenantId, index, 'tenantId'),
    projectId: requireString(record.projectId, index, 'projectId'),
    companyId: requireString(record.companyId, index, 'companyId'),
    name: requireString(record.name, index, 'name'),
  }
}

function requireString(value: unknown, index: number, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`mock project ${index}.${field} must be a non-empty string`)
  }
  return value
}

function requireProject(context: TrustedRequestContext): string {
  if (context.projectId === null) {
    throw new IndustryAgentClientError('INDUSTRY_PROJECT_REQUIRED', 'active project is required', 409)
  }
  return context.projectId
}

function requireActive(conversation: IndustryConversation): void {
  if (conversation.status !== 'ACTIVE') {
    throw new IndustryAgentClientError('CONVERSATION_ABORTED', 'conversation is aborted', 409)
  }
}

function latestAction(events: readonly IndustryEventEnvelope[], actionId: string): UiActionEnvelope | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'ui.action.presented' || !isPresentedPayload(event.payload)) continue
    if (event.payload.action.actionId === actionId) return structuredClone(event.payload.action)
  }
  return undefined
}

function isPresentedPayload(payload: unknown): payload is UiActionPresentedEventPayload {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false
  const action = (payload as { action?: unknown }).action
  return typeof action === 'object'
    && action !== null
    && !Array.isArray(action)
    && typeof (action as { actionId?: unknown }).actionId === 'string'
    && (action as { schemaVersion?: unknown }).schemaVersion === 'ui-action-v1'
}

function cloneConversation(conversation: IndustryConversation): IndustryConversation {
  return structuredClone(conversation)
}

function mockAssistantText(text: string): string {
  return `Mock industry response: ${text}`
}

function eventEnvelope(input: Omit<IndustryEventEnvelope, 'schemaVersion' | 'eventId'>): IndustryEventEnvelope {
  return {
    schemaVersion: 'industry-event-v1',
    eventId: `event-${randomUUID()}`,
    ...input,
  }
}
