import { randomUUID } from 'node:crypto'
import type {
  RetrievalCandidate,
  RetrievalComparisonType,
  RetrievalEvalCase,
  RetrievalEvalObservation,
  RetrievalLeakageReport,
  RetrievalMetricDelta,
  RetrievalMetricsSummary,
  RetrievalPlaygroundRequest,
  RetrievalPlaygroundResult,
  RetrievalRankMovement,
  RetrievalRunComparison,
  RetrievalRunSummary,
  StartRetrievalRunRequest,
} from '../../../../shared/industry/eval/retrieval'
import type { TrustedRequestContext } from '../context'
import { EvaluationClientError } from './evaluation-client'
import { MockEvaluationClient } from './mock-evaluation-client'
import {
  RETRIEVAL_CASE_FIXTURES,
  buildRetrievalLeakageFixture,
  buildRetrievalPlaygroundFixture,
} from './retrieval-fixtures'

interface StoredRetrievalRun {
  summary: RetrievalRunSummary
  observations: readonly RetrievalEvalObservation[]
}

const RUN_STORES = new WeakMap<MockEvaluationClient, Map<string, Map<string, StoredRetrievalRun>>>()
const RETRIEVAL_DATASET_ID = 'retrieval-regression-v1'
const RETRIEVAL_DATASET_VERSION = '1.0.0'
const MIN_STATISTICAL_SAMPLE = 30
const HIGH_CONFIDENCE_THRESHOLD = 0.8

const RECALL_K = [1, 5, 10, 20, 50] as const

declare module './mock-evaluation-client' {
  interface MockEvaluationClient {
    listRetrievalCases(context: TrustedRequestContext): Promise<readonly RetrievalEvalCase[]>
    playgroundRetrieval(context: TrustedRequestContext, request: RetrievalPlaygroundRequest): Promise<RetrievalPlaygroundResult>
    getRetrievalLeakageReport(context: TrustedRequestContext): Promise<RetrievalLeakageReport>
    listRetrievalRuns(context: TrustedRequestContext): Promise<readonly RetrievalRunSummary[]>
    startRetrievalRun(context: TrustedRequestContext, request: StartRetrievalRunRequest): Promise<RetrievalRunSummary>
    getRetrievalRun(context: TrustedRequestContext, runId: string): Promise<RetrievalRunSummary>
    listRetrievalObservations(context: TrustedRequestContext, runId: string): Promise<readonly RetrievalEvalObservation[]>
    compareRetrievalRuns(
      context: TrustedRequestContext,
      baselineRunId: string,
      candidateRunId: string,
      comparisonType: RetrievalComparisonType,
    ): Promise<RetrievalRunComparison>
  }
}

MockEvaluationClient.prototype.listRetrievalCases = async function listRetrievalCases(
  context: TrustedRequestContext,
): Promise<readonly RetrievalEvalCase[]> {
  return scopedCases(requireProject(context))
}

MockEvaluationClient.prototype.playgroundRetrieval = async function playgroundRetrieval(
  context: TrustedRequestContext,
  request: RetrievalPlaygroundRequest,
): Promise<RetrievalPlaygroundResult> {
  const projectId = requireProject(context)
  requireRetrievalVariant(request.variantId)
  const fixtureId = request.domain === 'ENGINEERING' ? 'retrieval-engineering-001' : 'retrieval-boq-001'
  const fixture = buildRetrievalPlaygroundFixture(fixtureId, request.variantId)
  return {
    ...fixture,
    queryContext: {
      ...fixture.queryContext,
      projectId,
      query: request.query,
      normalizedQuery: normalizeQuery(request.query),
      domain: request.domain,
    },
    stages: fixture.stages.map((stage) => ({
      ...stage,
      candidates: stage.candidates.map((candidate) => ({ ...candidate, projectId })),
    })),
  }
}

MockEvaluationClient.prototype.getRetrievalLeakageReport = async function getRetrievalLeakageReport(
  context: TrustedRequestContext,
): Promise<RetrievalLeakageReport> {
  requireProject(context)
  return structuredClone(buildRetrievalLeakageFixture())
}

MockEvaluationClient.prototype.listRetrievalRuns = async function listRetrievalRuns(
  context: TrustedRequestContext,
): Promise<readonly RetrievalRunSummary[]> {
  const store = runStore(this, requireProject(context))
  return [...store.values()]
    .map((item) => structuredClone(item.summary))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

MockEvaluationClient.prototype.startRetrievalRun = async function startRetrievalRun(
  context: TrustedRequestContext,
  request: StartRetrievalRunRequest,
): Promise<RetrievalRunSummary> {
  const projectId = requireProject(context)
  if (request.datasetId !== RETRIEVAL_DATASET_ID) {
    throw new EvaluationClientError('EVAL_DATASET_NOT_FOUND', 'retrieval dataset not found', 404)
  }
  requireRetrievalVariant(request.variantId)
  const store = runStore(this, projectId)
  const run = buildStoredRun(`run-retrieval-${randomUUID()}`, request.variantId, projectId)
  store.set(run.summary.runId, run)
  return structuredClone(run.summary)
}

MockEvaluationClient.prototype.getRetrievalRun = async function getRetrievalRun(
  context: TrustedRequestContext,
  runId: string,
): Promise<RetrievalRunSummary> {
  return structuredClone(retrievalRunById(runStore(this, requireProject(context)), runId).summary)
}

MockEvaluationClient.prototype.listRetrievalObservations = async function listRetrievalObservations(
  context: TrustedRequestContext,
  runId: string,
): Promise<readonly RetrievalEvalObservation[]> {
  return structuredClone(retrievalRunById(runStore(this, requireProject(context)), runId).observations)
}

MockEvaluationClient.prototype.compareRetrievalRuns = async function compareRetrievalRuns(
  context: TrustedRequestContext,
  baselineRunId: string,
  candidateRunId: string,
  comparisonType: RetrievalComparisonType,
): Promise<RetrievalRunComparison> {
  const store = runStore(this, requireProject(context))
  const baseline = retrievalRunById(store, baselineRunId)
  const candidate = retrievalRunById(store, candidateRunId)
  if (baseline.summary.datasetId !== candidate.summary.datasetId || baseline.summary.datasetVersion !== candidate.summary.datasetVersion) {
    throw new EvaluationClientError('EVAL_DATASET_MISMATCH', 'retrieval runs must use the same dataset version', 409)
  }
  if (baseline.summary.metrics === undefined || candidate.summary.metrics === undefined) {
    throw new EvaluationClientError('EVAL_RUN_INCOMPLETE', 'retrieval runs must be completed before comparison', 409)
  }

  const baselineByCase = new Map(baseline.observations.map((item) => [item.caseId, item]))
  const candidateByCase = new Map(candidate.observations.map((item) => [item.caseId, item]))
  const improved: string[] = []
  const regressed: string[] = []
  const pairedDeltas: number[] = []
  const rankMovements: RetrievalRankMovement[] = []

  for (const [caseId, baselineObservation] of baselineByCase) {
    const candidateObservation = candidateByCase.get(caseId)
    if (candidateObservation === undefined) continue
    const qualityDelta = candidateObservation.ndcgAt10 - baselineObservation.ndcgAt10
    pairedDeltas.push(qualityDelta)
    if (qualityDelta > 1e-9) improved.push(caseId)
    else if (qualityDelta < -1e-9) regressed.push(caseId)

    const entityIds = new Set([
      ...baselineObservation.finalCandidates.map((item) => item.entityId),
      ...candidateObservation.finalCandidates.map((item) => item.entityId),
    ])
    for (const entityId of entityIds) {
      const before = baselineObservation.finalCandidates.find((item) => item.entityId === entityId)
      const after = candidateObservation.finalCandidates.find((item) => item.entityId === entityId)
      const baselineRank = before?.rank
      const candidateRank = after?.rank
      const baselineScore = before?.finalScore
      const candidateScore = after?.finalScore
      rankMovements.push({
        caseId,
        entityId,
        ...(baselineRank === undefined ? {} : { baselineRank }),
        ...(candidateRank === undefined ? {} : { candidateRank }),
        ...(baselineRank === undefined || candidateRank === undefined ? {} : { rankDelta: baselineRank - candidateRank }),
        ...(baselineScore === undefined ? {} : { baselineScore }),
        ...(candidateScore === undefined ? {} : { candidateScore }),
        ...(baselineScore === undefined || candidateScore === undefined ? {} : { scoreDelta: candidateScore - baselineScore }),
      })
    }
  }

  const safetyRegressionReasons = deterministicSafetyRegressions(baseline.summary.metrics, candidate.summary.metrics)
  return {
    baselineRunId,
    candidateRunId,
    comparisonType,
    metricDeltas: metricDeltas(baseline.summary.metrics, candidate.summary.metrics),
    improvedCaseIds: improved,
    regressedCaseIds: regressed,
    rankMovements,
    pairedStats: pairedStats(pairedDeltas),
    deterministicSafetyRegression: safetyRegressionReasons.length > 0,
    safetyRegressionReasons,
  }
}

function runStore(client: MockEvaluationClient, projectId: string): Map<string, StoredRetrievalRun> {
  let projectStores = RUN_STORES.get(client)
  if (projectStores === undefined) {
    projectStores = new Map()
    RUN_STORES.set(client, projectStores)
  }
  let store = projectStores.get(projectId)
  if (store === undefined) {
    store = new Map()
    const baseline = buildStoredRun('run-retrieval-baseline-v1', 'retrieval-stable-v1', projectId)
    const candidate = buildStoredRun('run-retrieval-candidate-v2', 'retrieval-candidate-v2', projectId)
    store.set(baseline.summary.runId, baseline)
    store.set(candidate.summary.runId, candidate)
    projectStores.set(projectId, store)
  }
  return store
}

function buildStoredRun(runId: string, variantId: string, projectId: string): StoredRetrievalRun {
  const observations = scopedCases(projectId).map((testCase) => buildObservation(runId, testCase, variantId))
  const startedAt = new Date().toISOString()
  return {
    summary: {
      runId,
      runType: 'RETRIEVAL',
      datasetId: RETRIEVAL_DATASET_ID,
      datasetVersion: RETRIEVAL_DATASET_VERSION,
      status: 'COMPLETED',
      environment: 'LOCAL',
      variantId,
      projectId,
      startedAt,
      completedAt: startedAt,
      metrics: computeMetrics(observations),
    },
    observations,
  }
}

function buildObservation(runId: string, testCase: RetrievalEvalCase, variantId: string): RetrievalEvalObservation {
  const fixture = buildRetrievalPlaygroundFixture(testCase.caseId, variantId)
  const finalStage = fixture.stages.find((stage) => stage.stage === 'FINAL')
  if (finalStage === undefined) throw new Error(`retrieval fixture missing FINAL stage: ${testCase.caseId}`)
  const finalCandidates = applyVariantProfile(
    testCase,
    finalStage.candidates.map((candidate) => ({ ...candidate, projectId: testCase.expected.expectedProjectId })),
    variantId,
  )
  const relevantRanks = finalCandidates
    .filter((candidate) => testCase.expected.relevantEntityIds.includes(candidate.entityId))
    .map((candidate) => candidate.rank)
    .sort((a, b) => a - b)
  const firstRelevantRank = relevantRanks[0]
  const top = finalCandidates[0]
  const reciprocalRank = firstRelevantRank === undefined ? 0 : 1 / firstRelevantRank
  const ndcgAt10 = firstRelevantRank === undefined || firstRelevantRank > 10 ? 0 : 1 / Math.log2(firstRelevantRank + 1)
  return {
    schemaVersion: 'eval-observation-v1',
    observationId: `${runId}:${testCase.caseId}`,
    runId,
    caseId: testCase.caseId,
    domain: testCase.domain,
    query: testCase.queryContext.query,
    relevantEntityIds: [...testCase.expected.relevantEntityIds],
    finalCandidates,
    relevantRanks,
    hitAt1: firstRelevantRank === 1,
    hitAt10: firstRelevantRank !== undefined && firstRelevantRank <= 10,
    reciprocalRank,
    averagePrecision: reciprocalRank,
    ndcgAt10,
    zeroResult: finalCandidates.length === 0,
    crossProjectLeakage: finalCandidates.some((candidate) => candidate.projectId !== testCase.expected.expectedProjectId),
    crossAlignmentConflict: top !== undefined
      && testCase.expected.expectedAlignment !== undefined
      && top.alignment !== undefined
      && top.alignment !== testCase.expected.expectedAlignment
      && (top.finalScore ?? 0) >= HIGH_CONFIDENCE_THRESHOLD,
    criticalSpecConflict: top?.criticalSpecConflict === true && (top.finalScore ?? 0) >= HIGH_CONFIDENCE_THRESHOLD,
    wrongEntityHighConfidence: top !== undefined
      && !testCase.expected.relevantEntityIds.includes(top.entityId)
      && (top.finalScore ?? 0) >= HIGH_CONFIDENCE_THRESHOLD,
    traceId: `mock-retrieval-run-${testCase.caseId}-${variantId}`,
  }
}

function applyVariantProfile(
  testCase: RetrievalEvalCase,
  candidates: readonly RetrievalCandidate[],
  variantId: string,
): readonly RetrievalCandidate[] {
  const scored = candidates.map((candidate) => {
    const relevant = testCase.expected.relevantEntityIds.includes(candidate.entityId)
    let finalScore: number
    if (variantId === 'retrieval-candidate-v2') {
      finalScore = relevant ? 0.97 : candidate.criticalSpecConflict ? 0.48 : 0.55
    } else if (testCase.domain === 'ENGINEERING') {
      finalScore = relevant ? 0.84 : candidate.entityId === 'eng-002' ? 0.93 : 0.58
    } else {
      finalScore = relevant ? 0.83 : candidate.criticalSpecConflict ? 0.94 : 0.62
    }
    return { ...candidate, finalScore }
  })
  return scored
    .sort((a, b) => (b.finalScore ?? 0) - (a.finalScore ?? 0))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }))
}

function computeMetrics(observations: readonly RetrievalEvalObservation[]): RetrievalMetricsSummary {
  const sampleCount = observations.length
  return {
    recallAtK: RECALL_K.map((k) => ({
      k,
      value: average(observations.map((item) => recallForObservation(item, k))),
    })),
    hitAt1: ratio(observations.filter((item) => item.hitAt1).length, sampleCount),
    mrr: average(observations.map((item) => item.reciprocalRank)),
    map: average(observations.map((item) => item.averagePrecision)),
    ndcgAt10: average(observations.map((item) => item.ndcgAt10)),
    zeroResultRate: ratio(observations.filter((item) => item.zeroResult).length, sampleCount),
    crossProjectLeakageRate: ratio(observations.filter((item) => item.crossProjectLeakage).length, sampleCount),
    crossAlignmentConflictRate: ratio(observations.filter((item) => item.crossAlignmentConflict).length, sampleCount),
    criticalSpecConflictRate: ratio(observations.filter((item) => item.criticalSpecConflict).length, sampleCount),
    wrongEntityHighConfidenceRate: ratio(observations.filter((item) => item.wrongEntityHighConfidence).length, sampleCount),
  }
}

function recallForObservation(observation: RetrievalEvalObservation, k: number): number {
  if (observation.relevantEntityIds.length === 0) return 1
  const found = observation.finalCandidates
    .filter((candidate) => candidate.rank <= k && observation.relevantEntityIds.includes(candidate.entityId))
    .length
  return found / observation.relevantEntityIds.length
}

function metricDeltas(baseline: RetrievalMetricsSummary, candidate: RetrievalMetricsSummary): readonly RetrievalMetricDelta[] {
  const deltas: RetrievalMetricDelta[] = []
  for (const k of RECALL_K) {
    const before = baseline.recallAtK.find((item) => item.k === k)?.value ?? 0
    const after = candidate.recallAtK.find((item) => item.k === k)?.value ?? 0
    deltas.push({ metric: `recallAt${k}`, baseline: before, candidate: after, delta: after - before })
  }
  for (const metric of [
    'hitAt1',
    'mrr',
    'map',
    'ndcgAt10',
    'zeroResultRate',
    'crossProjectLeakageRate',
    'crossAlignmentConflictRate',
    'criticalSpecConflictRate',
    'wrongEntityHighConfidenceRate',
  ] as const) {
    deltas.push({ metric, baseline: baseline[metric], candidate: candidate[metric], delta: candidate[metric] - baseline[metric] })
  }
  return deltas
}

function deterministicSafetyRegressions(
  baseline: RetrievalMetricsSummary,
  candidate: RetrievalMetricsSummary,
): readonly string[] {
  const reasons: string[] = []
  for (const metric of [
    'crossProjectLeakageRate',
    'crossAlignmentConflictRate',
    'criticalSpecConflictRate',
    'wrongEntityHighConfidenceRate',
  ] as const) {
    if (candidate[metric] > baseline[metric] + 1e-12) reasons.push(`${metric} increased`)
  }
  return reasons
}

function pairedStats(deltas: readonly number[]) {
  const wins = deltas.filter((value) => value > 1e-9).length
  const losses = deltas.filter((value) => value < -1e-9).length
  const ties = deltas.length - wins - losses
  const minimumSampleWarning = deltas.length < MIN_STATISTICAL_SAMPLE
  const ci = bootstrap95Ci(deltas)
  let conclusion: 'IMPROVED' | 'REGRESSED' | 'NO_MATERIAL_CHANGE' | 'INCONCLUSIVE'
  if (minimumSampleWarning || ci === undefined) conclusion = 'INCONCLUSIVE'
  else if (ci[0] > 0) conclusion = 'IMPROVED'
  else if (ci[1] < 0) conclusion = 'REGRESSED'
  else conclusion = 'NO_MATERIAL_CHANGE'
  return {
    wins,
    losses,
    ties,
    sampleSize: deltas.length,
    ...(ci === undefined ? {} : { bootstrap95Ci: ci }),
    minimumSampleWarning,
    conclusion,
  }
}

function bootstrap95Ci(values: readonly number[]): readonly [number, number] | undefined {
  if (values.length === 0) return undefined
  const means: number[] = []
  let seed = 0x5f3759df
  for (let iteration = 0; iteration < 400; iteration += 1) {
    let total = 0
    for (let index = 0; index < values.length; index += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      total += values[seed % values.length] ?? 0
    }
    means.push(total / values.length)
  }
  means.sort((a, b) => a - b)
  return [quantile(means, 0.025), quantile(means, 0.975)]
}

function quantile(sorted: readonly number[], q: number): number {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))
  return sorted[index] ?? 0
}

function scopedCases(projectId: string): readonly RetrievalEvalCase[] {
  return RETRIEVAL_CASE_FIXTURES.map((item) => ({
    ...structuredClone(item),
    queryContext: { ...structuredClone(item.queryContext), projectId },
    expected: { ...structuredClone(item.expected), expectedProjectId: projectId },
  }))
}

function retrievalRunById(store: ReadonlyMap<string, StoredRetrievalRun>, runId: string): StoredRetrievalRun {
  const run = store.get(runId)
  if (run === undefined) throw new EvaluationClientError('EVAL_RUN_NOT_FOUND', 'retrieval evaluation run not found', 404)
  return run
}

function requireProject(context: TrustedRequestContext): string {
  if (context.projectId === null) {
    throw new EvaluationClientError('EVAL_PROJECT_REQUIRED', 'active project is required for retrieval evaluation', 409)
  }
  return context.projectId
}

function requireRetrievalVariant(variantId: string): void {
  if (variantId === 'retrieval-stable-v1' || variantId === 'retrieval-candidate-v2') return
  throw new EvaluationClientError('EVAL_VARIANT_NOT_FOUND', 'retrieval evaluation variant not found', 404)
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/gu, ' ')
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}
