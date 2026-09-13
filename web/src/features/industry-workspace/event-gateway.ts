import type { IndustryEventEnvelope } from '../../../../shared/industry/conversation'
import type { IndustryConversationApiClient } from '../../api/conversation-client'
import { IndustryEventBuffer, type IndustryEventApplyResult } from './event-buffer'

export interface IndustryEventSyncResult extends IndustryEventApplyResult {
  requestedAfterSequenceNo: number
  serverLatestSequenceNo: number
}

export class IndustryEventGateway {
  readonly #client: Pick<IndustryConversationApiClient, 'getEvents'>
  readonly #buffer: IndustryEventBuffer

  constructor(
    client: Pick<IndustryConversationApiClient, 'getEvents'>,
    buffer = new IndustryEventBuffer(),
  ) {
    this.#client = client
    this.#buffer = buffer
  }

  get afterSequenceNo(): number {
    return this.#buffer.afterSequenceNo
  }

  get knownEvents(): readonly IndustryEventEnvelope[] {
    return this.#buffer.knownEvents
  }

  async reconnect(conversationId: string): Promise<IndustryEventSyncResult> {
    const requestedAfterSequenceNo = this.#buffer.afterSequenceNo
    const batch = await this.#client.getEvents(conversationId, requestedAfterSequenceNo)
    if (batch.conversationId !== conversationId) {
      throw new IndustryEventGatewayError('EVENT_CONVERSATION_MISMATCH', 'event batch belongs to another conversation')
    }
    if (batch.afterSequenceNo !== requestedAfterSequenceNo) {
      throw new IndustryEventGatewayError('EVENT_CURSOR_MISMATCH', 'event batch cursor does not match requested cursor')
    }
    const applied = this.#buffer.apply(batch.events)
    return {
      ...applied,
      requestedAfterSequenceNo,
      serverLatestSequenceNo: batch.latestSequenceNo,
    }
  }
}

export class IndustryEventGatewayError extends Error {
  readonly code: 'EVENT_CONVERSATION_MISMATCH' | 'EVENT_CURSOR_MISMATCH'

  constructor(code: 'EVENT_CONVERSATION_MISMATCH' | 'EVENT_CURSOR_MISMATCH', message: string) {
    super(message)
    this.name = 'IndustryEventGatewayError'
    this.code = code
  }
}
