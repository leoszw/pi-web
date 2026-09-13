import { describe, expect, it } from 'vitest'
import type { IndustryEventBatch, IndustryEventEnvelope } from '../../shared/industry/conversation'
import { IndustryEventGateway, IndustryEventGatewayError } from '../src/features/industry-workspace/event-gateway'

function event(sequenceNo: number, eventId: string, type: string): IndustryEventEnvelope {
  return {
    schemaVersion: 'industry-event-v1',
    eventId,
    sequenceNo,
    traceId: `trace-${sequenceNo}`,
    requestId: `request-${sequenceNo}`,
    conversationId: 'conversation-1',
    type,
    timestamp: '2026-09-13T00:00:00.000Z',
    payload: { sequenceNo },
  }
}

describe('IndustryEventGateway', () => {
  it('reconnects from the last applied sequence number', async () => {
    const requested: number[] = []
    const batches: IndustryEventBatch[] = [{
      conversationId: 'conversation-1',
      afterSequenceNo: 0,
      latestSequenceNo: 2,
      events: [
        event(1, 'event-1', 'conversation.created'),
        event(2, 'event-2', 'message.user.accepted'),
      ],
    }, {
      conversationId: 'conversation-1',
      afterSequenceNo: 2,
      latestSequenceNo: 4,
      events: [
        event(3, 'event-3', 'future.unknown'),
        event(4, 'event-4', 'message.assistant.completed'),
      ],
    }]
    const client = {
      async getEvents(_conversationId: string, afterSequenceNo: number): Promise<IndustryEventBatch> {
        requested.push(afterSequenceNo)
        const batch = batches.shift()
        if (batch === undefined) throw new Error('unexpected request')
        return batch
      },
    }
    const gateway = new IndustryEventGateway(client)

    const first = await gateway.reconnect('conversation-1')
    expect(first.requestedAfterSequenceNo).toBe(0)
    expect(gateway.afterSequenceNo).toBe(2)

    const second = await gateway.reconnect('conversation-1')
    expect(second.requestedAfterSequenceNo).toBe(2)
    expect(second.ignoredUnknown.map((item) => item.sequenceNo)).toEqual([3])
    expect(gateway.afterSequenceNo).toBe(4)
    expect(requested).toEqual([0, 2])
    expect(gateway.knownEvents.map((item) => item.sequenceNo)).toEqual([1, 2, 4])
  })

  it('rejects a response for another conversation or cursor', async () => {
    const mismatchedConversation = new IndustryEventGateway({
      async getEvents(): Promise<IndustryEventBatch> {
        return { conversationId: 'conversation-other', afterSequenceNo: 0, latestSequenceNo: 0, events: [] }
      },
    })
    await expect(mismatchedConversation.reconnect('conversation-1')).rejects.toMatchObject({ code: 'EVENT_CONVERSATION_MISMATCH' })

    const mismatchedCursor = new IndustryEventGateway({
      async getEvents(): Promise<IndustryEventBatch> {
        return { conversationId: 'conversation-1', afterSequenceNo: 5, latestSequenceNo: 5, events: [] }
      },
    })
    await expect(mismatchedCursor.reconnect('conversation-1')).rejects.toBeInstanceOf(IndustryEventGatewayError)
    await expect(mismatchedCursor.reconnect('conversation-1')).rejects.toMatchObject({ code: 'EVENT_CURSOR_MISMATCH' })
  })
})
