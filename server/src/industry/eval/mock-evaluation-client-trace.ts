import { randomUUID } from 'node:crypto'
import type {
  StartTraceEvalRunRequest,
  TraceEvalCase,
  TraceEvalFailureSummary,
  TraceEvalMetricsSummary,
  TraceEvalObservation,
  TraceEvalRunSummary,
  TraceEvalScenario,
  TraceEvalVariant,
} from '../../../../shared/industry/eval/trace'
import type { TrustedRequestContext } from '../context'
import { EvaluationClientError } from './evaluation-client'
import { MockEvaluationClient } from './mock-evaluation-client'

interface StoredTraceEvalRun {
  summary: TraceEvalRunSummary
  observations: readonly TraceEvalObservation[]
}

const DATASET_ID = 'trace-safety-v1'
const DATASET_VERSION = '1.0.0'
const LATENCY_BUDGET_MS = 200
const STORES = new WeakMap<MockEvaluationClient, Map<string, Map<string, StoredTraceEvalRun>>>()

const CASES: readonly TraceEvalCase[] = [
  traceCase('trace-eval-001', 'TRACE_COMPLETENESS', 'Trace completeness', 'Required request, agent, LLM/tool/retrieval spans must be represented.', ['trace', 'completeness']),
  traceCase('trace-eval-002', 'SEQUENCE_MONOTONIC', 'Sequence monotonicity', 'Timeline sequence numbers must be contiguous and monotonic.', ['trace', 'sequence']),
  traceCase('trace-eval-003', 'TOKEN_ACCOUNTING', 'Token accounting', 'Input + output tokens must equal total tokens and align with LLM calls.', ['trace', 'tokens']),
  traceCase('trace-eval-004', 'TOOL_AUDIT_COMPLETENESS', 'Tool audit completeness', 'Every executed tool call must have matching audit evidence.', ['trace', 'audit', 'tool']),
  traceCase('trace-eval-005', 'REDACTION_LEAK', 'Redaction leak', 'API keys, cookies, Authorization, Approval Tokens, and DSNs must never survive trace projection.', ['trace', 'redaction', 'security']),
  {
    ...traceCase('trace-eval-006', 'QUERY_LATENCY', 'Query latency', `Retrieval query latency must remain within ${LATENCY_BUDGET_MS} ms in the deterministic fixture.`, ['trace', 'latency']),
    split: 'RELEASE_HOLDOUT',
    expected: { mustPass: true, maxLatencyMs: LATENCY_BUDGET_MS },
  },
]

declare module './mock-evaluation-client' {
  interface MockEvaluationClient {
    listTraceEvalCases(context: TrustedRequestContext): Promise<readonly TraceEvalCase[]>
    listTraceEvalRuns(context: TrustedRequestContext): Promise<readonly TraceEvalRunSummary[]>
    startTraceEvalRun(context: TrustedRequestContext, request: StartTraceEvalRunRequest): Promise<TraceEvalRunSummary>
    getTraceEvalRun(context: TrustedRequestContext, runId: string): Promise<TraceEvalRunSummary>
    listTraceEvalObservations(context: TrustedRequestContext, runId: string): Promise<readonly TraceEvalObservation[]>
    listTraceEvalFailures(context: TrustedRequestContext, runId: string): Promise<readonly TraceEvalFailureSummary[]>
  }
}

MockEvaluationClient.prototype.listTraceEvalCases = async function listTraceEvalCases(
  context: TrustedRequestContext,
): Promise<readonly TraceEvalCase[]> {
  requireProject(context)
  return structuredClone(CASES)
}

MockEvaluationClient.prototype.listTraceEvalRuns = async function listTraceEvalRuns(
  context: TrustedRequestContext,
): Promise<readonly TraceEvalRunSummary[]> {
  const store = runStore(this, requireProject(context))
  return [...store.values()].map((item) => structuredClone(item.summary)).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

MockEvaluationClient.prototype.startTraceEvalRun = async function startTraceEvalRun(
  context: TrustedRequestContext,
  request: StartTraceEvalRunRequest,
): Promise<TraceEvalRunSummary> {
  const projectId = requireProject(context)
  if (request.datasetId !== DATASET_ID) throw new EvaluationClientError('EVAL_DATASET_NOT_FOUND', 'trace evaluation dataset not found', 404)
  requireVariant(request.variantId)
  const run = buildRun(`run-trace-${randomUUID()}`, request.variantId, projectId)
  runStore(this, projectId).set(run.summary.runId, run)
  return structuredClone(run.summary)
}

MockEvaluationClient.prototype.getTraceEvalRun = async function getTraceEvalRun(
  context: TrustedRequestContext,
  runId: string,
): Promise<TraceEvalRunSummary> {
  return structuredClone(runById(runStore(this, requireProject(context)), runId).summary)
}

MockEvaluationClient.prototype.listTraceEvalObservations = async function listTraceEvalObservations(
  context: TrustedRequestContext,
  runId: string,
): Promise<readonly TraceEvalObservation[]> {
  return structuredClone(runById(runStore(this, requireProject(context)), runId).observations)
}

MockEvaluationClient.prototype.listTraceEvalFailures = async function listTraceEvalFailures(
  context: TrustedRequestContext,
  runId: string,
): Promise<readonly TraceEvalFailureSummary[]> {
  return structuredClone(runById(runStore(this, requireProject(context)), runId).observations.filter((item) => !item.passed).map((item) => ({
    caseId: item.caseId,
    scenario: item.scenario,
    reasons: item.reasons,
    traceId: item.traceId,
  })))
}

function runStore(client: MockEvaluationClient, projectId: string): Map<string, StoredTraceEvalRun> {
  let projectStores = STORES.get(client)
  if (projectStores === undefined) {
    projectStores = new Map()
    STORES.set(client, projectStores)
  }
  let store = projectStores.get(projectId)
  if (store === undefined) {
    store = new Map()
    const broken = buildRun('run-trace-broken-v0', 'trace-broken-v0', projectId)
    const guarded = buildRun('run-trace-guarded-v1', 'trace-guarded-v1', projectId)
    store.set(broken.summary.runId, broken)
    store.set(guarded.summary.runId, guarded)
    projectStores.set(projectId, store)
  }
  return store
}

function buildRun(runId: string, variantId: TraceEvalVariant, projectId: string): StoredTraceEvalRun {
  const observations = CASES.map((testCase) => observationFor(runId, testCase, variantId, projectId))
  const now = new Date().toISOString()
  return {
    summary: {
      runId,
      runType: 'TRACE',
      datasetId: DATASET_ID,
      datasetVersion: DATASET_VERSION,
      status: 'COMPLETED',
      environment: 'LOCAL',
      variantId,
      projectId,
      startedAt: now,
      completedAt: now,
      metrics: metricsFor(observations),
    },
    observations,
  }
}

function observationFor(
  runId: string,
  testCase: TraceEvalCase,
  variantId: TraceEvalVariant,
  projectId: string,
): TraceEvalObservation {
  const guarded = variantId === 'trace-guarded-v1'
  const traceId = `trace-${safeId(projectId)}-retrieval-001`
  const base = {
    schemaVersion: 'eval-observation-v1' as const,
    observationId: `${runId}:${testCase.caseId}`,
    runId,
    caseId: testCase.caseId,
    scenario: testCase.scenario,
    traceId,
  }

  switch (testCase.scenario) {
    case 'TRACE_COMPLETENESS': {
      const completeness = guarded ? 1 : 0.67
      const passed = completeness === 1
      return { ...base, passed, completeness, reasons: passed ? [] : ['required retrieval/tool span is missing'], steps: [{ step: 'required_span_check', outcome: passed ? 'PASS' : 'FAIL', detail: `${Math.round(completeness * 100)}% required trace components present` }] }
    }
    case 'SEQUENCE_MONOTONIC': {
      const sequenceMonotonic = guarded
      return { ...base, passed: sequenceMonotonic, sequenceMonotonic, reasons: sequenceMonotonic ? [] : ['timeline sequence contains a gap or regression'], steps: [{ step: 'sequence_check', outcome: sequenceMonotonic ? 'PASS' : 'FAIL', detail: sequenceMonotonic ? 'sequence is contiguous and monotonic' : 'fault injection produced non-monotonic sequence' }] }
    }
    case 'TOKEN_ACCOUNTING': {
      const tokenAccountingConsistent = guarded
      return { ...base, passed: tokenAccountingConsistent, tokenAccountingConsistent, reasons: tokenAccountingConsistent ? [] : ['input + output token counts do not equal recorded total'], steps: [{ step: 'token_sum_check', outcome: tokenAccountingConsistent ? 'PASS' : 'FAIL', detail: tokenAccountingConsistent ? '428 + 96 = 524' : '428 + 96 != injected total 600' }] }
    }
    case 'TOOL_AUDIT_COMPLETENESS': {
      const toolAuditComplete = guarded
      return { ...base, passed: toolAuditComplete, toolAuditComplete, reasons: toolAuditComplete ? [] : ['executed tool call has no matching audit event'], steps: [{ step: 'tool_audit_join', outcome: toolAuditComplete ? 'PASS' : 'FAIL', detail: toolAuditComplete ? 'all tool calls have audit evidence' : 'fault injection removed one audit event' }] }
    }
    case 'REDACTION_LEAK': {
      const redactionLeakDetected = !guarded
      const passed = !redactionLeakDetected
      return { ...base, passed, redactionLeakDetected, reasons: passed ? [] : ['sensitive trace material survived redaction'], steps: [{ step: 'secret_scan', outcome: passed ? 'PASS' : 'FAIL', detail: passed ? 'no API key, cookie, Authorization, Approval Token, or DSN leak detected' : 'fault injection exposed a secret marker' }] }
    }
    case 'QUERY_LATENCY': {
      const queryLatencyMs = guarded ? 75 : 650
      const maxLatencyMs = testCase.expected.maxLatencyMs ?? LATENCY_BUDGET_MS
      const passed = queryLatencyMs <= maxLatencyMs
      return { ...base, passed, queryLatencyMs, maxLatencyMs, reasons: passed ? [] : [`query latency ${queryLatencyMs} ms exceeds ${maxLatencyMs} ms budget`], steps: [{ step: 'latency_budget_check', outcome: passed ? 'PASS' : 'FAIL', detail: `${queryLatencyMs} ms observed / ${maxLatencyMs} ms budget` }] }
    }
  }
}

function metricsFor(observations: readonly TraceEvalObservation[]): TraceEvalMetricsSummary {
  const sampleCount = observations.length
  const passedCount = observations.filter((item) => item.passed).length
  const traceCompletenessRate = scenarioPassRate(observations, 'TRACE_COMPLETENESS')
  const sequenceMonotonicRate = scenarioPassRate(observations, 'SEQUENCE_MONOTONIC')
  const tokenAccountingConsistencyRate = scenarioPassRate(observations, 'TOKEN_ACCOUNTING')
  const toolAuditCompletenessRate = scenarioPassRate(observations, 'TOOL_AUDIT_COMPLETENESS')
  const redactionLeakRate = ratio(observations.filter((item) => item.redactionLeakDetected === true).length, sampleCount)
  const latency = observations.filter((item) => item.queryLatencyMs !== undefined).map((item) => item.queryLatencyMs as number)
  const queryLatencyP95Ms = percentile95(latency)
  const queryLatencyBudgetPassRate = scenarioPassRate(observations, 'QUERY_LATENCY')
  const releaseGateReasons: string[] = []
  if (traceCompletenessRate < 1) releaseGateReasons.push('trace completeness regression detected')
  if (sequenceMonotonicRate < 1) releaseGateReasons.push('trace sequence monotonicity regression detected')
  if (tokenAccountingConsistencyRate < 1) releaseGateReasons.push('token accounting inconsistency detected')
  if (toolAuditCompletenessRate < 1) releaseGateReasons.push('tool audit completeness regression detected')
  if (redactionLeakRate > 0) releaseGateReasons.push('trace redaction leak detected')
  if (queryLatencyBudgetPassRate < 1) releaseGateReasons.push('query latency budget exceeded')
  return {
    sampleCount,
    passedCount,
    passRate: ratio(passedCount, sampleCount),
    traceCompletenessRate,
    sequenceMonotonicRate,
    tokenAccountingConsistencyRate,
    toolAuditCompletenessRate,
    redactionLeakRate,
    queryLatencyP95Ms,
    queryLatencyBudgetPassRate,
    releaseGate: releaseGateReasons.length === 0 ? 'PASS' : 'FAIL',
    releaseGateReasons,
  }
}

function traceCase(caseId: string, scenario: TraceEvalScenario, title: string, description: string, tags: readonly string[]): TraceEvalCase {
  return {
    schemaVersion: 'eval-case-v1',
    caseId,
    datasetId: DATASET_ID,
    datasetVersion: DATASET_VERSION,
    split: 'REGRESSION',
    scenario,
    title,
    description,
    expected: { mustPass: true },
    critical: true,
    tags,
  }
}

function scenarioPassRate(observations: readonly TraceEvalObservation[], scenario: TraceEvalScenario): number {
  const scoped = observations.filter((item) => item.scenario === scenario)
  return ratio(scoped.filter((item) => item.passed).length, scoped.length)
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[index] ?? 0
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

function runById(store: Map<string, StoredTraceEvalRun>, runId: string): StoredTraceEvalRun {
  const run = store.get(runId)
  if (run === undefined) throw new EvaluationClientError('EVAL_RUN_NOT_FOUND', 'trace evaluation run not found', 404)
  return run
}

function requireVariant(value: string): asserts value is TraceEvalVariant {
  if (value !== 'trace-broken-v0' && value !== 'trace-guarded-v1') {
    throw new EvaluationClientError('EVAL_VARIANT_NOT_FOUND', 'trace evaluation variant not found', 404)
  }
}

function safeId(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/gu, '-').slice(0, 48)
  return normalized === '' ? 'project' : normalized
}

function requireProject(context: TrustedRequestContext): string {
  if (context.projectId === null) throw new EvaluationClientError('EVAL_PROJECT_REQUIRED', 'select an active project before using trace evaluation', 409)
  return context.projectId
}
