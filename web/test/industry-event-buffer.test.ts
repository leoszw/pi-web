import { describe, expect, it } from 'vitest'
import type { IndustryEventEnvelope } from '../../shared/industry/conversation'
import { IndustryEventBuffer } from '../src/features/industry-workspace/event-buffer'

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

describe('IndustryEventBuffer', () => {
  it('advances reconnect cursor monotonically and deduplicates replayed event ids', () => {
    const buffer = new IndustryEventBuffer()
    const first = buffer.apply([
      event(1, 'event-1', 'conversation.created'),
      event(2, 'event-2', 'message.user.accepted'),
      event(3, 'event-3', 'message.assistant.completed'),
    ])
    expect(first.lastSequenceNo).toBe(3)
    expect(first.applied.map((item) => item.sequenceNo)).toEqual([1, 2, 3])
    expect(buffer.afterSequenceNo).toBe(3)

    const replay = buffer.apply([
      event(2, 'event-2', 'message.user.accepted'),
      event(3, 'event-3', 'message.assistant.completed'),
      event(4, 'event-4', 'conversation.aborted'),
    ])
    expect(replay.duplicateEventIds).toEqual(['event-2', 'event-3'])
    expect(replay.applied.map((item) => item.sequenceNo)).toEqual([4])
    expect(buffer.afterSequenceNo).toBe(4)
  })

  it('safely ignores unknown events while still advancing the cursor', () => {
    const buffer = new IndustryEventBuffer()
    const result = buffer.apply([
      event(1, 'event-1', 'conversation.created'),
      event(2, 'event-unknown', 'future.event.not-yet-supported'),
      event(3, 'event-3', 'message.assistant.completed'),
    ])
    expect(result.ignoredUnknown.map((item) => item.eventId)).toEqual(['event-unknown'])
    expect(result.applied.map((item) => item.sequenceNo)).toEqual([1, 3])
    expect(buffer.afterSequenceNo).toBe(3)
    expect(buffer.knownEvents.map((item) => item.sequenceNo)).toEqual([1, 3])
  })

  it('stops at a sequence gap so reconnect can refill missing events', () => {
    const buffer = new IndustryEventBuffer()
    const result = buffer.apply([
      event(1, 'event-1', 'conversation.created'),
      event(3, 'event-3', 'message.assistant.completed'),
    ])
    expect(result.gapAtSequenceNo).toBe(2)
    expect(result.lastSequenceNo).toBe(1)
    expect(buffer.afterSequenceNo).toBe(1)
    expect(buffer.knownEvents.map((item) => item.sequenceNo)).toEqual([1])
  })
})
