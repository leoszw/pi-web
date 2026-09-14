import type { RetrievalQueryContext, RetrievalStageSnapshot } from './eval/retrieval'

export interface RetrievalDebugResult {
  traceId: string
  source: 'TRACE'
  queryContext: RetrievalQueryContext
  stages: readonly RetrievalStageSnapshot[]
  notes: readonly string[]
}
