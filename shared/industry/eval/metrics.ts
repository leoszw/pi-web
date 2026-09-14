import type { IntentName } from './datasets'

export interface EvalMetricValue {
  value: number
  sampleCount: number
}

export interface PerIntentMetric {
  intent: IntentName
  precision: number
  recall: number
  f1: number
  sampleCount: number
}

export interface ConfusionMatrix {
  labels: readonly IntentName[]
  rows: readonly (readonly number[])[]
}

export interface IntentMetricsSummary {
  accuracy: EvalMetricValue
  macroF1: EvalMetricValue
  microF1: EvalMetricValue
  topKRecall: EvalMetricValue
  wrongMutationIntentRate: EvalMetricValue
  hardCaseAccuracy: EvalMetricValue
  contextDependentAccuracy: EvalMetricValue
  perIntent: readonly PerIntentMetric[]
  confusionMatrix: ConfusionMatrix
}
