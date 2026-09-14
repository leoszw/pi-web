export const EVAL_API_VERSION = 'eval-api-v1' as const
export const EVAL_EVENT_VERSION = 'eval-event-v1' as const
export const EVAL_CASE_VERSION = 'eval-case-v1' as const
export const EVAL_OBSERVATION_VERSION = 'eval-observation-v1' as const

export type EvalDomain =
  | 'INTENT'
  | 'NORMALIZATION'
  | 'ENTITY'
  | 'ENGINEERING_RETRIEVAL'
  | 'BOQ_RETRIEVAL'
  | 'RAG_RETRIEVAL'
  | 'RAG_ANSWER'
  | 'TOOL_SELECTION'
  | 'TOOL_ARGUMENT'
  | 'MEMORY'
  | 'MUTATION'
  | 'MULTIMODAL'
  | 'AGENT_LOOP'
  | 'REPORT'
  | 'SANDBOX'
  | 'TRACE_TOKEN'
  | 'E2E'

export type EvalDatasetStatus = 'DRAFT' | 'REVIEWED' | 'BASELINE_READY' | 'ARCHIVED'
export type EvalDifficulty = 'NORMAL' | 'HARD' | 'ADVERSARIAL'
export type EvalRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'INVALID'
export type EvalEnvironment = 'LOCAL' | 'CI' | 'STAGING'

export interface ComponentVersionSnapshot {
  gitCommit: string
  promptVersion: string
  intentParserVersion: string
  modelVersion: string
  configFingerprint: string
}

export interface EvalVariantSummary {
  variantId: string
  label: string
  description: string
  components: ComponentVersionSnapshot
}

export interface EvalTagSummary {
  tag: string
  count: number
}
