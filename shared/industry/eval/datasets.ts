import type { EvalDatasetStatus, EvalDifficulty, EvalDomain, EvalTagSummary } from './common'

export type IntentName =
  | 'QUERY_BOQ'
  | 'QUERY_ENGINEERING_POSITION'
  | 'QUERY_QUANTITY'
  | 'RAG_QA'
  | 'MUTATION'
  | 'UNKNOWN'

export interface EvalDatasetSummary {
  datasetId: string
  name: string
  domain: EvalDomain
  version: string
  status: EvalDatasetStatus
  caseCount: number
  fingerprint: string
  tags: readonly EvalTagSummary[]
  source: 'CURATED' | 'PRODUCTION_REVIEW' | 'SYNTHETIC' | 'IMPORT'
  createdAt: string
  reviewedAt?: string
}

export interface IntentTurn {
  role: 'user' | 'assistant'
  text: string
  resolvedIntent?: IntentName
}

export interface IntentEvalExpected {
  primaryIntent: IntentName
  acceptableIntents: readonly IntentName[]
  mustNot: readonly IntentName[]
}

export interface IntentLabelHistoryEntry {
  labelVersion: string
  primaryIntent: IntentName
  changedAt: string
  changedBy: string
}

export interface IntentEvalCase {
  schemaVersion: 'eval-case-v1'
  caseId: string
  datasetId: string
  domain: 'INTENT'
  query: string
  previousTurns: readonly IntentTurn[]
  expected: IntentEvalExpected
  tags: readonly string[]
  difficulty: EvalDifficulty
  critical: boolean
  labelVersion: string
  reviewed: boolean
  labelHistory: readonly IntentLabelHistoryEntry[]
  notes?: string
}

export interface IntentDatasetDetail extends EvalDatasetSummary {
  domain: 'INTENT'
  description: string
  split: 'DEV' | 'REGRESSION' | 'RELEASE_HOLDOUT'
}

export interface CreateIntentDraftCaseRequest {
  query: string
  previousTurns: readonly IntentTurn[]
  expected: IntentEvalExpected
  tags: readonly string[]
  difficulty: EvalDifficulty
  critical: boolean
  notes?: string
}
