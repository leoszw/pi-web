import { createHash, randomUUID } from 'node:crypto'
import type { EvalVariantSummary } from '../../../../shared/industry/eval/common'
import type { CreateIntentDraftCaseRequest, EvalDatasetSummary, IntentDatasetDetail, IntentEvalCase, IntentName, IntentTurn } from '../../../../shared/industry/eval/datasets'
import type { ConfusionMatrix, IntentMetricsSummary, PerIntentMetric } from '../../../../shared/industry/eval/metrics'
import type {
  EvalRunSummary,
  IntentCandidate,
  IntentEvalObservation,
  IntentPlaygroundRequest,
  IntentPlaygroundResult,
  IntentRunComparison,
  StartIntentRunRequest,
} from '../../../../shared/industry/eval/runs'
import type { TrustedRequestContext } from '../context'
import { EvaluationClientError, type EvaluationClient } from './evaluation-client'

const INTENTS: readonly IntentName[] = [
  'QUERY_BOQ',
  'QUERY_ENGINEERING_POSITION',
  'QUERY_QUANTITY',
  'RAG_QA',
  'MUTATION',
  'UNKNOWN',
]

const VARIANTS: readonly EvalVariantSummary[] = [
  {
    variantId: 'intent-stable-v1',
    label: 'Stable v1',
    description: 'P1 deterministic mock baseline. Formal production metrics remain owned by pi.',
    components: {
      gitCommit: 'mock-p1',
      promptVersion: 'intent-prompt-v1',
      intentParserVersion: 'intent-parser-v1',
      modelVersion: 'mock-intent-v1',
      configFingerprint: 'mock-config-stable-v1',
    },
  },
  {
    variantId: 'intent-candidate-v2',
    label: 'Candidate v2',
    description: 'P1 deterministic mock candidate used to exercise comparison and failure drilldown.',
    components: {
      gitCommit: 'mock-p1',
      promptVersion: 'intent-prompt-v2',
      intentParserVersion: 'intent-parser-v1',
      modelVersion: 'mock-intent-v2',
      configFingerprint: 'mock-config-candidate-v2',
    },
  },
]

const REVIEWED_CASES: readonly IntentEvalCase[] = [
  makeCase('intent-001', 'K12+300到K12+800左幅有哪些清单项', 'QUERY_BOQ', ['chainage', 'boq'], 'NORMAL'),
  makeCase('intent-002', 'K12+300左幅路基有哪些工程部位', 'QUERY_ENGINEERING_POSITION', ['chainage', 'engineering'], 'NORMAL'),
  makeCase('intent-003', '这个清单项工程量是多少', 'QUERY_QUANTITY', ['quantity', 'boq'], 'HARD'),
  makeCase('intent-004', '项目规范中沉降观测有什么要求', 'RAG_QA', ['rag', 'specification'], 'NORMAL'),
  makeCase('intent-005', '把刚才那些未完成项负责人改成张三', 'MUTATION', ['mutation', 'context'], 'HARD', true),
  makeCase('intent-006', '你好', 'UNKNOWN', ['unknown'], 'NORMAL'),
  makeCase('intent-007', 'C30混凝土基础对应哪些清单', 'QUERY_BOQ', ['spec', 'boq'], 'NORMAL'),
  makeCase('intent-008', '桥梁下部结构有哪些部位', 'QUERY_ENGINEERING_POSITION', ['engineering', 'hierarchy'], 'NORMAL'),
  makeCase('intent-009', '删除刚才第二条记录', 'MUTATION', ['mutation', 'delete'], 'ADVERSARIAL', true),
  makeContextCase('intent-010', '第二个呢', 'QUERY_BOQ', 'QUERY_BOQ', ['context', 'deictic'], 'HARD'),
  makeContextCase('intent-011', '继续看这些', 'QUERY_ENGINEERING_POSITION', 'QUERY_ENGINEERING_POSITION', ['context', 'deictic'], 'HARD'),
  makeCase('intent-012', '本月累计完成数量', 'QUERY_QUANTITY', ['quantity'], 'HARD'),
  makeCase('intent-013', '合同技术条款关于压实度怎么规定', 'RAG_QA', ['rag', 'contract'], 'NORMAL'),
  makeCase('intent-014', '随便聊聊今天工作', 'UNKNOWN', ['unknown'], 'NORMAL'),
]

const DRAFT_CASES: readonly IntentEvalCase[] = [
  makeCase('intent-draft-001', '清单量', 'QUERY_QUANTITY', ['quantity', 'short'], 'HARD', false, false, 'draft-label-v1'),
  makeCase('intent-draft-002', '那个呢', 'UNKNOWN', ['context', 'ambiguous'], 'ADVERSARIAL', false, false, 'draft-label-v1'),
]

interface StoredRun {
  summary: EvalRunSummary
  observations: readonly IntentEvalObservation[]
}

export class MockEvaluationClient implements EvaluationClient {
  readonly #runs = new Map<string, StoredRun>()
  readonly #draftCases: IntentEvalCase[] = DRAFT_CASES.map((item) => structuredClone(item))

  constructor() {
    const baseline = this.#buildRun('intent-regression-v1', 'intent-stable-v1', 'run-intent-baseline-v1')
    const candidate = this.#buildRun('intent-regression-v1', 'intent-candidate-v2', 'run-intent-candidate-v2')
    this.#runs.set(baseline.summary.runId, baseline)
    this.#runs.set(candidate.summary.runId, candidate)
  }

  async listVariants(_context: TrustedRequestContext): Promise<readonly EvalVariantSummary[]> {
    return structuredClone(VARIANTS)
  }

  async listDatasets(_context: TrustedRequestContext): Promise<readonly EvalDatasetSummary[]> {
    return structuredClone(this.#datasets().map(({ description: _description, split: _split, ...summary }) => summary))
  }

  async getDataset(_context: TrustedRequestContext, datasetId: string): Promise<IntentDatasetDetail> {
    return structuredClone(this.#datasetById(datasetId))
  }

  async listCases(_context: TrustedRequestContext, datasetId: string): Promise<readonly IntentEvalCase[]> {
    return structuredClone(this.#casesForDataset(datasetId))
  }

  async createDraftCase(
    context: TrustedRequestContext,
    datasetId: string,
    request: CreateIntentDraftCaseRequest,
  ): Promise<IntentEvalCase> {
    const dataset = this.#datasetById(datasetId)
    if (dataset.status !== 'DRAFT') {
      throw new EvaluationClientError('EVAL_DATASET_NOT_EDITABLE', 'only DRAFT datasets can receive new cases', 409)
    }
    const caseId = `intent-draft-${randomUUID()}`
    const labelVersion = `draft-label-${Date.now()}`
    const created: IntentEvalCase = {
      schemaVersion: 'eval-case-v1',
      caseId,
      datasetId,
      domain: 'INTENT',
      query: request.query,
      previousTurns: structuredClone(request.previousTurns),
      expected: structuredClone(request.expected),
      tags: [...new Set(request.tags)],
      difficulty: request.difficulty,
      critical: request.critical,
      labelVersion,
      reviewed: false,
      labelHistory: [{
        labelVersion,
        primaryIntent: request.expected.primaryIntent,
        changedAt: new Date().toISOString(),
        changedBy: context.userId,
      }],
      ...(request.notes === undefined ? {} : { notes: request.notes }),
    }
    this.#draftCases.push(created)
    return structuredClone(created)
  }

  async playgroundIntent(context: TrustedRequestContext, request: IntentPlaygroundRequest): Promise<IntentPlaygroundResult> {
    const variant = variantById(request.variantId)
    const prediction = classifyIntent(request.query, request.previousTurns, request.variantId)
    return {
      primaryIntent: prediction.primaryIntent,
      candidates: prediction.candidates,
      confidence: prediction.confidence,
      semanticFrame: {
        normalizedQuery: request.query.trim().replace(/\s+/g, ' '),
        projectId: context.projectId,
        contextDependent: isContextDependent(request.query, request.previousTurns),
        tokens: tokenize(request.query),
      },
      variantId: variant.variantId,
      components: structuredClone(variant.components),
      traceId: `mock-trace-${randomUUID()}`,
    }
  }

  async listRuns(_context: TrustedRequestContext): Promise<readonly EvalRunSummary[]> {
    return [...this.#runs.values()]
      .map((stored) => structuredClone(stored.summary))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  async startIntentRun(_context: TrustedRequestContext, request: StartIntentRunRequest): Promise<EvalRunSummary> {
    const dataset = this.#datasetById(request.datasetId)
    if (dataset.status === 'ARCHIVED') throw new EvaluationClientError('EVAL_DATASET_ARCHIVED', 'dataset is archived', 409)
    variantById(request.variantId)
    const stored = this.#buildRun(request.datasetId, request.variantId, `run-${randomUUID()}`)
    this.#runs.set(stored.summary.runId, stored)
    return structuredClone(stored.summary)
  }

  async getRun(_context: TrustedRequestContext, runId: string): Promise<EvalRunSummary> {
    return structuredClone(runById(this.#runs, runId).summary)
  }

  async listObservations(_context: TrustedRequestContext, runId: string): Promise<readonly IntentEvalObservation[]> {
    return structuredClone(runById(this.#runs, runId).observations)
  }

  async compareRuns(
    _context: TrustedRequestContext,
    baselineRunId: string,
    candidateRunId: string,
  ): Promise<IntentRunComparison> {
    const baseline = runById(this.#runs, baselineRunId)
    const candidate = runById(this.#runs, candidateRunId)
    if (baseline.summary.datasetFingerprint !== candidate.summary.datasetFingerprint) {
      throw new EvaluationClientError('EVAL_DATASET_MISMATCH', 'runs must use the same dataset fingerprint', 409)
    }
    if (baseline.summary.metrics === undefined || candidate.summary.metrics === undefined) {
      throw new EvaluationClientError('EVAL_RUN_INCOMPLETE', 'runs must be completed before comparison', 409)
    }
    const baselineByCase = new Map(baseline.observations.map((item) => [item.caseId, item]))
    const candidateByCase = new Map(candidate.observations.map((item) => [item.caseId, item]))
    const improved: string[] = []
    const regressed: string[] = []
    let unchanged = 0
    for (const [caseId, base] of baselineByCase) {
      const next = candidateByCase.get(caseId)
      if (next === undefined) continue
      if (!base.passed && next.passed) improved.push(caseId)
      else if (base.passed && !next.passed) regressed.push(caseId)
      else unchanged += 1
    }
    return {
      baselineRunId,
      candidateRunId,
      metricDeltas: [
        metricDelta('accuracy', baseline.summary.metrics.accuracy.value, candidate.summary.metrics.accuracy.value),
        metricDelta('macroF1', baseline.summary.metrics.macroF1.value, candidate.summary.metrics.macroF1.value),
        metricDelta('wrongMutationIntentRate', baseline.summary.metrics.wrongMutationIntentRate.value, candidate.summary.metrics.wrongMutationIntentRate.value),
        metricDelta('hardCaseAccuracy', baseline.summary.metrics.hardCaseAccuracy.value, candidate.summary.metrics.hardCaseAccuracy.value),
      ],
      improvedCaseIds: improved,
      regressedCaseIds: regressed,
      unchangedCaseCount: unchanged,
    }
  }

  #buildRun(datasetId: string, variantId: string, runId: string): StoredRun {
    const dataset = this.#datasetById(datasetId)
    const variant = variantById(variantId)
    const cases = this.#casesForDataset(datasetId)
    const observations = cases.map((testCase) => observationFor(runId, testCase, variantId))
    const startedAt = new Date().toISOString()
    const summary: EvalRunSummary = {
      runId,
      runType: 'INTENT',
      datasetId,
      datasetVersion: dataset.version,
      datasetFingerprint: dataset.fingerprint,
      status: 'COMPLETED',
      environment: 'LOCAL',
      variantId,
      components: structuredClone(variant.components),
      startedAt,
      completedAt: startedAt,
      metrics: computeMetrics(observations),
    }
    return { summary, observations }
  }

  #datasets(): readonly IntentDatasetDetail[] {
    return [
      makeDataset('intent-regression-v1', 'Intent Regression v1', 'REGRESSION', 'REVIEWED', REVIEWED_CASES, 'Reviewed intent regression fixture for P1.'),
      makeDataset('intent-draft-v1', 'Intent Draft v1', 'DEV', 'DRAFT', this.#draftCases, 'Unreviewed draft fixture. It cannot become an accepted baseline.'),
    ]
  }

  #datasetById(datasetId: string): IntentDatasetDetail {
    const dataset = this.#datasets().find((item) => item.datasetId === datasetId)
    if (dataset === undefined) throw new EvaluationClientError('EVAL_DATASET_NOT_FOUND', 'dataset not found', 404)
    return dataset
  }

  #casesForDataset(datasetId: string): readonly IntentEvalCase[] {
    if (datasetId === 'intent-regression-v1') return REVIEWED_CASES
    if (datasetId === 'intent-draft-v1') return this.#draftCases
    throw new EvaluationClientError('EVAL_DATASET_NOT_FOUND', 'dataset not found', 404)
  }
}

function variantById(variantId: string): EvalVariantSummary {
  const variant = VARIANTS.find((item) => item.variantId === variantId)
  if (variant === undefined) throw new EvaluationClientError('EVAL_VARIANT_NOT_FOUND', 'evaluation variant not found', 404)
  return variant
}

function runById(runs: ReadonlyMap<string, StoredRun>, runId: string): StoredRun {
  const run = runs.get(runId)
  if (run === undefined) throw new EvaluationClientError('EVAL_RUN_NOT_FOUND', 'evaluation run not found', 404)
  return run
}

function observationFor(runId: string, testCase: IntentEvalCase, variantId: string): IntentEvalObservation {
  const prediction = classifyIntent(testCase.query, testCase.previousTurns, variantId)
  const passed = testCase.expected.acceptableIntents.includes(prediction.primaryIntent)
    && !testCase.expected.mustNot.includes(prediction.primaryIntent)
  return {
    schemaVersion: 'eval-observation-v1',
    observationId: `${runId}:${testCase.caseId}`,
    runId,
    caseId: testCase.caseId,
    query: testCase.query,
    expectedIntent: testCase.expected.primaryIntent,
    actualIntent: prediction.primaryIntent,
    confidence: prediction.confidence,
    candidates: prediction.candidates,
    passed,
    critical: testCase.critical,
    difficulty: testCase.difficulty,
    tags: [...testCase.tags],
    traceId: `mock-trace-${testCase.caseId}-${variantId}`,
  }
}

function classifyIntent(query: string, previousTurns: readonly IntentTurn[], variantId: string): {
  primaryIntent: IntentName
  confidence: number
  candidates: readonly IntentCandidate[]
} {
  const normalized = query.trim().toLowerCase()
  const previousIntent = [...previousTurns].reverse().find((turn) => turn.resolvedIntent !== undefined)?.resolvedIntent
  let primary: IntentName

  if (isDeictic(normalized) && previousIntent !== undefined) primary = previousIntent
  else if (/(改成|修改|删除|新增|负责人)/u.test(normalized)) primary = 'MUTATION'
  else if (/(规范|条款|规定|要求)/u.test(normalized)) primary = 'RAG_QA'
  else if (/(工程量|数量|累计完成)/u.test(normalized)) {
    primary = variantId === 'intent-stable-v1' ? 'QUERY_BOQ' : 'QUERY_QUANTITY'
  } else if (/(清单|c\d+|φ\d+|混凝土)/u.test(normalized)) primary = 'QUERY_BOQ'
  else if (/(k\d+|工程部位|部位|路基|桥梁|结构)/u.test(normalized)) primary = 'QUERY_ENGINEERING_POSITION'
  else primary = 'UNKNOWN'

  const confidence = previousIntent !== undefined && isDeictic(normalized) ? 0.84 : primary === 'UNKNOWN' ? 0.61 : 0.92
  const candidates = candidateList(primary, confidence)
  return { primaryIntent: primary, confidence, candidates }
}

function candidateList(primary: IntentName, confidence: number): readonly IntentCandidate[] {
  const fallback = INTENTS.filter((intent) => intent !== primary).slice(0, 2)
  return [
    { intent: primary, confidence },
    { intent: fallback[0] ?? 'UNKNOWN', confidence: Math.max(0.01, 1 - confidence - 0.03) },
    { intent: fallback[1] ?? 'UNKNOWN', confidence: 0.03 },
  ]
}

function isDeictic(query: string): boolean {
  return /(第二个|这些|那些|刚才|继续|那个)/u.test(query)
}

function isContextDependent(query: string, previousTurns: readonly IntentTurn[]): boolean {
  return previousTurns.length > 0 && isDeictic(query)
}

function tokenize(query: string): readonly string[] {
  return query.trim().split(/\s+|(?=[，。；、])/u).map((item) => item.trim()).filter((item) => item.length > 0).slice(0, 20)
}

function computeMetrics(observations: readonly IntentEvalObservation[]): IntentMetricsSummary {
  const sampleCount = observations.length
  const correct = observations.filter((item) => item.passed).length
  const hard = observations.filter((item) => item.difficulty !== 'NORMAL')
  const context = observations.filter((item) => item.tags.includes('context'))
  const wrongMutation = observations.filter((item) => item.actualIntent === 'MUTATION' && item.expectedIntent !== 'MUTATION').length
  const confusion = computeConfusion(observations)
  const perIntent = computePerIntent(observations)
  const macroF1 = perIntent.length === 0 ? 0 : average(perIntent.map((item) => item.f1))
  const accuracy = ratio(correct, sampleCount)
  return {
    accuracy: { value: accuracy, sampleCount },
    macroF1: { value: macroF1, sampleCount },
    microF1: { value: accuracy, sampleCount },
    topKRecall: {
      value: ratio(observations.filter((item) => item.candidates.some((candidate) => candidate.intent === item.expectedIntent)).length, sampleCount),
      sampleCount,
    },
    wrongMutationIntentRate: { value: ratio(wrongMutation, sampleCount), sampleCount },
    hardCaseAccuracy: { value: ratio(hard.filter((item) => item.passed).length, hard.length), sampleCount: hard.length },
    contextDependentAccuracy: { value: ratio(context.filter((item) => item.passed).length, context.length), sampleCount: context.length },
    perIntent,
    confusionMatrix: confusion,
  }
}

function computePerIntent(observations: readonly IntentEvalObservation[]): readonly PerIntentMetric[] {
  return INTENTS.map((intent) => {
    const expected = observations.filter((item) => item.expectedIntent === intent)
    const predicted = observations.filter((item) => item.actualIntent === intent)
    const truePositive = observations.filter((item) => item.expectedIntent === intent && item.actualIntent === intent).length
    const precision = ratio(truePositive, predicted.length)
    const recall = ratio(truePositive, expected.length)
    return {
      intent,
      precision,
      recall,
      f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall),
      sampleCount: expected.length,
    }
  }).filter((item) => item.sampleCount > 0)
}

function computeConfusion(observations: readonly IntentEvalObservation[]): ConfusionMatrix {
  const rows = INTENTS.map((expected) => INTENTS.map((actual) => observations.filter(
    (item) => item.expectedIntent === expected && item.actualIntent === actual,
  ).length))
  return { labels: INTENTS, rows }
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function metricDelta(metric: string, baseline: number, candidate: number) {
  return { metric, baseline, candidate, delta: candidate - baseline }
}

function makeCase(
  caseId: string,
  query: string,
  expected: IntentName,
  tags: readonly string[],
  difficulty: 'NORMAL' | 'HARD' | 'ADVERSARIAL',
  critical = false,
  reviewed = true,
  labelVersion = 'label-v1',
): IntentEvalCase {
  return {
    schemaVersion: 'eval-case-v1',
    caseId,
    datasetId: reviewed ? 'intent-regression-v1' : 'intent-draft-v1',
    domain: 'INTENT',
    query,
    previousTurns: [],
    expected: { primaryIntent: expected, acceptableIntents: [expected], mustNot: expected === 'MUTATION' ? [] : ['MUTATION'] },
    tags: [...tags],
    difficulty,
    critical,
    labelVersion,
    reviewed,
    labelHistory: [{
      labelVersion,
      primaryIntent: expected,
      changedAt: '2026-09-12T00:00:00.000Z',
      changedBy: 'fixture',
    }],
  }
}

function makeContextCase(
  caseId: string,
  query: string,
  expected: IntentName,
  previousResolvedIntent: IntentName,
  tags: readonly string[],
  difficulty: 'NORMAL' | 'HARD' | 'ADVERSARIAL',
): IntentEvalCase {
  return {
    ...makeCase(caseId, query, expected, tags, difficulty),
    previousTurns: [{ role: 'assistant', text: 'previous result', resolvedIntent: previousResolvedIntent }],
  }
}

function makeDataset(
  datasetId: string,
  name: string,
  split: 'DEV' | 'REGRESSION' | 'RELEASE_HOLDOUT',
  status: 'DRAFT' | 'REVIEWED',
  cases: readonly IntentEvalCase[],
  description: string,
): IntentDatasetDetail {
  const fingerprint = createHash('sha256').update(JSON.stringify(cases)).digest('hex')
  const tagCounts = new Map<string, number>()
  for (const testCase of cases) {
    for (const tag of testCase.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  return {
    datasetId,
    name,
    domain: 'INTENT',
    version: '1.0.0',
    status,
    caseCount: cases.length,
    fingerprint,
    tags: [...tagCounts.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => a.tag.localeCompare(b.tag)),
    source: 'CURATED',
    createdAt: '2026-09-12T00:00:00.000Z',
    ...(status === 'REVIEWED' ? { reviewedAt: '2026-09-12T00:00:00.000Z' } : {}),
    description,
    split,
  }
}
