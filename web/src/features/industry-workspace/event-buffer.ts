import type { IndustryEventEnvelope } from '../../../../shared/industry/conversation'

const KNOWN_EVENT_TYPES = new Set([
  'conversation.created',
  'message.user.accepted',
  'message.assistant.completed',
  'ui.action.presented',
  'ui.action.interaction.accepted',
  'conversation.aborted',
])

export interface IndustryEventApplyResult {
  applied: readonly IndustryEventEnvelope[]
  ignoredUnknown: readonly IndustryEventEnvelope[]
  duplicateEventIds: readonly string[]
  gapAtSequenceNo?: number
  lastSequenceNo: number
}

export class IndustryEventBuffer {
  readonly #seenEventIds = new Set<string>()
  readonly #knownEvents: IndustryEventEnvelope[] = []
  #lastSequenceNo = 0

  get afterSequenceNo(): number {
    return this.#lastSequenceNo
  }

  get knownEvents(): readonly IndustryEventEnvelope[] {
    return structuredClone(this.#knownEvents)
  }

  apply(events: readonly IndustryEventEnvelope[]): IndustryEventApplyResult {
    const applied: IndustryEventEnvelope[] = []
    const ignoredUnknown: IndustryEventEnvelope[] = []
    const duplicateEventIds: string[] = []
    const ordered = [...events].sort((a, b) => a.sequenceNo - b.sequenceNo)

    for (const event of ordered) {
      if (this.#seenEventIds.has(event.eventId)) {
        duplicateEventIds.push(event.eventId)
        continue
      }
      if (event.sequenceNo <= this.#lastSequenceNo) {
        this.#seenEventIds.add(event.eventId)
        continue
      }
      if (event.sequenceNo !== this.#lastSequenceNo + 1) {
        return {
          applied,
          ignoredUnknown,
          duplicateEventIds,
          gapAtSequenceNo: this.#lastSequenceNo + 1,
          lastSequenceNo: this.#lastSequenceNo,
        }
      }

      this.#seenEventIds.add(event.eventId)
      this.#lastSequenceNo = event.sequenceNo
      if (!KNOWN_EVENT_TYPES.has(event.type)) {
        ignoredUnknown.push(structuredClone(event))
        continue
      }
      const cloned = structuredClone(event)
      this.#knownEvents.push(cloned)
      applied.push(cloned)
    }

    return {
      applied,
      ignoredUnknown,
      duplicateEventIds,
      lastSequenceNo: this.#lastSequenceNo,
    }
  }
}
