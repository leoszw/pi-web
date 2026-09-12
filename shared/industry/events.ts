export interface IndustryEventEnvelope<T = unknown> {
  schemaVersion: 'industry-event-v1'
  eventId: string
  sequenceNo: number
  traceId: string
  requestId: string
  conversationId?: string
  type: string
  timestamp: string
  payload: T
}
