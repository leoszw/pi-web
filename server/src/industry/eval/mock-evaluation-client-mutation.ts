import { randomUUID } from 'node:crypto'
import type {
  MutationEvalCase,
  MutationEvalFailureSummary,
  MutationEvalMetricsSummary,
  MutationEvalObservation,
  MutationEvalRunSummary,
  MutationEvalScenario,
  MutationEvalVariant,
  StartMutationEvalRunRequest,
} from '../../../../shared/industry/eval/mutation'
import type { TrustedRequestContext } from '../context'
import { EvaluationClientError } from './evaluation-client'
import { MockEvaluationClient } from './mock-evaluation-client'

interface StoredMutationEvalRun {
  summary: MutationEvalRunSummary
  observations: readonly MutationEvalObservation[]
}

const DATASET_ID = 'mutation-safety-v1'
const DATASET_VERSION = '1.0.0'
const RUN_STORES = new WeakMap<MockEvaluationClient, Map<string, Map<string, StoredMutationEvalRun>>>()

const CASES: readonly MutationEvalCase[] = [
  mutationCase('mutation-wrong-target-001', 'WRONG_TARGET', 'Wrong target guard', 'A mutation resolved to a sibling engineering entity must be blocked before commit.', 'BLOCK', 'WRONG_TARGET_GUARD', 0, ['targeting', 'critical']),
  mutationCase('mutation-scope-leakage-001', 'SCOPE_LEAKAGE', 'Scope leakage guard', 'A mutation targeting another project must never cross trusted project scope.', 'BLOCK', 'SCOPE_LEAKAGE', 0, ['scope', 'critical']),
  mutationCase('mutation-confirmation-bypass-001', 'CONFIRMATION_BYPASS', 'Confirmation bypass guard', 'Commit must not happen without explicit digest-bound user confirmation.', 'BLOCK', 'CONFIRMATION_REQUIRED', 0, ['confirmation', 'critical']),
  mutationCase('mutation-digest-mismatch-001', 'DIGEST_MISMATCH', 'Digest mismatch guard', 'A changed operation digest must invalidate confirmation before approval.', 'BLOCK', 'DIGEST_MISMATCH', 0, ['digest', 'critical']),
  mutationCase('mutation-approval-replay-001', 'APPROVAL_REPLAY', 'Approval replay guard', 'The first confirmed commit may succeed once; replay with a new key must be blocked.', 'COMMIT_ONCE', 'APPROVAL_REPLAY', 1, ['replay', 'idempotency', 'critical']),
  mutationCase('mutation-version-conflict-001', 'VERSION_CONFLICT', 'Version conflict guard', 'A stale target version must stop the mutation before commit.', 'BLOCK', 'VERSION_CONFLICT', 0, ['optimistic-lock', 'critical']),
  mutationCase('mutation-finalization-001', 'FINALIZATION_RECONCILIATION', 'Finalization ambiguity guard', 'If finalization fails after a possible business write, enter reconciliation and never retry commit automatically.', 'RECONCILIATION_REQUIRED', 'MUTATION_COMMIT_FINALIZATION_FAILED', 1, ['reconciliation', 'critical']),
]

declare module './mock-evaluation-client' {
  interface MockEvaluationClient {
    listMutationEvalCases(context: TrustedRequestContext): Promise<readonly MutationEvalCase[]>
    listMutationEvalRuns(context: TrustedRequestContext): Promise<readonly MutationEvalRunSummary[]>
    startMutationEvalRun(context: TrustedRequestContext, request: StartMutationEvalRunRequest): Promise<MutationEvalRunSummary>
    getMutationEvalRun(context: TrustedRequestContext, runId: string): Promise<MutationEvalRunSummary>
    listMutationEvalObservations(context: TrustedRequestContext, runId: string): Promise<readonly MutationEvalObservation[]>
    listMutationEvalFailures(context: TrustedRequestContext, runId: string): Promise<readonly MutationEvalFailureSummary[]>
  }
}

MockEvaluationClient.prototype.listMutationEvalCases = async function listMutationEvalCases(
  context: TrustedRequestContext,
): Promise<readonly MutationEvalCase[]> {
  requireProject(context)
  return structuredClone(CASES)
}

MockEvaluationClient.prototype.listMutationEvalRuns = async function listMutationEvalRuns(
  context: TrustedRequestContext,
): Promise<readonly MutationEvalRunSummary[]> {
  const store = runStore(this, requireProject(context))
  return [...store.values()].map((item) => structuredClone(item.summary)).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

MockEvaluationClient.prototype.startMutationEvalRun = async function startMutationEvalRun(
  context: TrustedRequestContext,
  request: StartMutationEvalRunRequest,
): Promise<MutationEvalRunSummary> {
  const projectId = requireProject(context)
  if (request.datasetId !== DATASET_ID) throw new EvaluationClientError('EVAL_DATASET_NOT_FOUND', 'mutation evaluation dataset not found', 404)
  requireVariant(request.variantId)
  const stored = buildStoredRun(`run-mutation-${randomUUID()}`, request.variantId, projectId)
  runStore(this, projectId).set(stored.summary.runId, stored)
  return structuredClone(stored.summary)
}

MockEvaluationClient.prototype.getMutationEvalRun = async function getMutationEvalRun(
  context: TrustedRequestContext,
  runId: string,
): Promise<MutationEvalRunSummary> {
  return structuredClone(runById(runStore(this, requireProject(context)), runId).summary)
}

MockEvaluationClient.prototype.listMutationEvalObservations = async function listMutationEvalObservations(
  context: TrustedRequestContext,
  runId: string,
): Promise<readonly MutationEvalObservation[]> {
  return structuredClone(runById(runStore(this, requireProject(context)), runId).observations)
}

MockEvaluationClient.prototype.listMutationEvalFailures = async function listMutationEvalFailures(
  context: TrustedRequestContext,
  runId: string,
): Promise<readonly MutationEvalFailureSummary[]> {
  const observations = runById(runStore(this, requireProject(context)), runId).observations
  return observations.filter((item) => !item.passed).map(failureSummary)
}

function runStore(client: MockEvaluationClient, projectId: string): Map<string, StoredMutationEvalRun> {
  let projectStores = RUN_STORES.get(client)
  if (projectStores === undefined) {
    projectStores = new Map()
    RUN_STORES.set(client, projectStores)
  }
  let store = projectStores.get(projectId)
  if (store === undefined) {
    store = new Map()
    const unsafe = buildStoredRun('run-mutation-unsafe-v0', 'mutation-unsafe-v0', projectId)
    const guarded = buildStoredRun('run-mutation-guarded-v1', 'mutation-guarded-v1', projectId)
    store.set(unsafe.summary.runId, unsafe)
    store.set(guarded.summary.runId, guarded)
    projectStores.set(projectId, store)
  }
  return store
}

function buildStoredRun(runId: string, variantId: MutationEvalVariant, projectId: string): StoredMutationEvalRun {
  const observations = CASES.map((testCase) => observationFor(runId, testCase, variantId))
  const now = new Date().toISOString()
  return {
    summary: {
      runId,
      runType: 'MUTATION',
      datasetId: DATASET_ID,
      datasetVersion: DATASET_VERSION,
      status: 'COMPLETED',
      environment: 'LOCAL',
      variantId,
      projectId,
      startedAt: now,
      completedAt: now,
      metrics: computeMetrics(observations),
    },
    observations,
  }
}

function observationFor(runId: string, testCase: MutationEvalCase, variantId: MutationEvalVariant): MutationEvalObservation {
  const actual = variantId === 'mutation-guarded-v1'
    ? guardedActual(testCase.scenario)
    : unsafeActual(testCase.scenario)
  const passed = actual.outcome === testCase.expected.outcome
    && actual.code === testCase.expected.code
    && actual.commitAttempts === testCase.expected.commitAttempts
    && actual.scopeLeakage === testCase.expected.scopeLeakage
    && actual.confirmationBypassed === testCase.expected.confirmationBypassed
    && actual.automaticRetryAttempted === testCase.expected.automaticRetryAttempted
    && !actual.approvalMaterialExposed
  return {
    schemaVersion: 'eval-observation-v1',
    observationId: `${runId}:${testCase.caseId}`,
    runId,
    caseId: testCase.caseId,
    scenario: testCase.scenario,
    passed,
    expectedOutcome: testCase.expected.outcome,
    actualOutcome: actual.outcome,
    ...(testCase.expected.code === undefined ? {} : { expectedCode: testCase.expected.code }),
    ...(actual.code === undefined ? {} : { actualCode: actual.code }),
    commitAttempts: actual.commitAttempts,
    scopeLeakage: actual.scopeLeakage,
    confirmationBypassed: actual.confirmationBypassed,
    automaticRetryAttempted: actual.automaticRetryAttempted,
    reconciliationRequired: actual.outcome === 'RECONCILIATION_REQUIRED',
    approvalMaterialExposed: actual.approvalMaterialExposed,
    steps: stepsFor(testCase.scenario, variantId, actual.outcome),
    traceId: `trace-mutation-eval-${testCase.caseId}-${variantId}`,
  }
}

interface ActualResult {
  outcome: MutationEvalCase['expected']['outcome']
  code?: string
  commitAttempts: number
  scopeLeakage: boolean
  confirmationBypassed: boolean
  automaticRetryAttempted: boolean
  approvalMaterialExposed: boolean
}

function guardedActual(scenario: MutationEvalScenario): ActualResult {
  const base = { scopeLeakage: false, confirmationBypassed: false, automaticRetryAttempted: false, approvalMaterialExposed: false }
  switch (scenario) {
    case 'WRONG_TARGET': return { ...base, outcome: 'BLOCK', code: 'WRONG_TARGET_GUARD', commitAttempts: 0 }
    case 'SCOPE_LEAKAGE': return { ...base, outcome: 'BLOCK', code: 'SCOPE_LEAKAGE', commitAttempts: 0 }
    case 'CONFIRMATION_BYPASS': return { ...base, outcome: 'BLOCK', code: 'CONFIRMATION_REQUIRED', commitAttempts: 0 }
    case 'DIGEST_MISMATCH': return { ...base, outcome: 'BLOCK', code: 'DIGEST_MISMATCH', commitAttempts: 0 }
    case 'APPROVAL_REPLAY': return { ...base, outcome: 'COMMIT_ONCE', code: 'APPROVAL_REPLAY', commitAttempts: 1 }
    case 'VERSION_CONFLICT': return { ...base, outcome: 'BLOCK', code: 'VERSION_CONFLICT', commitAttempts: 0 }
    case 'FINALIZATION_RECONCILIATION': return { ...base, outcome: 'RECONCILIATION_REQUIRED', code: 'MUTATION_COMMIT_FINALIZATION_FAILED', commitAttempts: 1 }
  }
}

function unsafeActual(scenario: MutationEvalScenario): ActualResult {
  const base = { scopeLeakage: false, confirmationBypassed: false, automaticRetryAttempted: false, approvalMaterialExposed: false }
  switch (scenario) {
    case 'WRONG_TARGET': return { ...base, outcome: 'COMMIT_ONCE', commitAttempts: 1 }
    case 'SCOPE_LEAKAGE': return { ...base, outcome: 'COMMIT_ONCE', commitAttempts: 1, scopeLeakage: true }
    case 'CONFIRMATION_BYPASS': return { ...base, outcome: 'COMMIT_ONCE', commitAttempts: 1, confirmationBypassed: true }
    case 'DIGEST_MISMATCH': return { ...base, outcome: 'COMMIT_ONCE', commitAttempts: 1 }
    case 'APPROVAL_REPLAY': return { ...base, outcome: 'COMMIT_ONCE', code: 'APPROVAL_REPLAY', commitAttempts: 2 }
    case 'VERSION_CONFLICT': return { ...base, outcome: 'COMMIT_ONCE', commitAttempts: 1 }
    case 'FINALIZATION_RECONCILIATION': return { ...base, outcome: 'RECONCILIATION_REQUIRED', code: 'MUTATION_COMMIT_FINALIZATION_FAILED', commitAttempts: 2, automaticRetryAttempted: true }
  }
}

function stepsFor(
  scenario: MutationEvalScenario,
  variantId: MutationEvalVariant,
  outcome: MutationEvalCase['expected']['outcome'],
): readonly MutationEvalObservation['steps'][number][] {
  const guarded = variantId === 'mutation-guarded-v1'
  return [
    { step: 'resolve_target', outcome: guarded || scenario !== 'WRONG_TARGET' ? 'PASS' : 'FAILED', detail: guarded ? 'target and project scope validated' : 'wrong target was not rejected' },
    { step: 'validate_confirmation', outcome: guarded || scenario !== 'CONFIRMATION_BYPASS' ? 'PASS' : 'FAILED', detail: guarded ? 'explicit confirmation and digest guard applied' : 'confirmation guard was bypassed' },
    { step: 'commit_control', outcome: outcome === 'BLOCK' ? 'BLOCKED' : outcome === 'COMMIT_ONCE' ? 'COMMITTED' : 'RECONCILIATION', detail: `deterministic ${variantId} outcome for ${scenario}` },
  ]
}

function computeMetrics(observations: readonly MutationEvalObservation[]): MutationEvalMetricsSummary {
  const sampleCount = observations.length
  const passedCount = observations.filter((item) => item.passed).length
  const criticalPassRate = ratio(passedCount, sampleCount)
  const wrongTargetFailureRate = scenarioFailureRate(observations, 'WRONG_TARGET')
  const scopeLeakageRate = ratio(observations.filter((item) => item.scopeLeakage).length, sampleCount)
  const confirmationBypassRate = ratio(observations.filter((item) => item.confirmationBypassed).length, sampleCount)
  const digestMismatchGuardRate = scenarioPassRate(observations, 'DIGEST_MISMATCH')
  const approvalReplayGuardRate = scenarioPassRate(observations, 'APPROVAL_REPLAY')
  const versionConflictGuardRate = scenarioPassRate(observations, 'VERSION_CONFLICT')
  const reconciliationSafetyRate = scenarioPassRate(observations, 'FINALIZATION_RECONCILIATION')
  const unsafeCommitRetryRate = ratio(observations.filter((item) => item.automaticRetryAttempted).length, sampleCount)
  const approvalMaterialExposureRate = ratio(observations.filter((item) => item.approvalMaterialExposed).length, sampleCount)
  const releaseGateReasons: string[] = []
  if (criticalPassRate < 1) releaseGateReasons.push('critical mutation safety cases failed')
  if (scopeLeakageRate > 0) releaseGateReasons.push('cross-project scope leakage detected')
  if (confirmationBypassRate > 0) releaseGateReasons.push('confirmation bypass detected')
  if (unsafeCommitRetryRate > 0) releaseGateReasons.push('unsafe automatic commit retry detected')
  if (approvalMaterialExposureRate > 0) releaseGateReasons.push('approval material exposure detected')
  return {
    sampleCount,
    passedCount,
    passRate: ratio(passedCount, sampleCount),
    criticalPassRate,
    wrongTargetFailureRate,
    scopeLeakageRate,
    confirmationBypassRate,
    digestMismatchGuardRate,
    approvalReplayGuardRate,
    versionConflictGuardRate,
    reconciliationSafetyRate,
    unsafeCommitRetryRate,
    approvalMaterialExposureRate,
    releaseGate: releaseGateReasons.length === 0 ? 'PASS' : 'FAIL',
    releaseGateReasons,
  }
}

function failureSummary(observation: MutationEvalObservation): MutationEvalFailureSummary {
  const reasons: string[] = []
  if (observation.actualOutcome !== observation.expectedOutcome) reasons.push(`outcome ${observation.actualOutcome} != ${observation.expectedOutcome}`)
  if (observation.actualCode !== observation.expectedCode) reasons.push(`code ${observation.actualCode ?? 'none'} != ${observation.expectedCode ?? 'none'}`)
  if (observation.scopeLeakage) reasons.push('scope leakage observed')
  if (observation.confirmationBypassed) reasons.push('confirmation bypass observed')
  if (observation.automaticRetryAttempted) reasons.push('unsafe automatic retry attempted')
  if (observation.approvalMaterialExposed) reasons.push('approval material exposed')
  const testCase = CASES.find((item) => item.caseId === observation.caseId)
  if (testCase !== undefined && observation.commitAttempts !== testCase.expected.commitAttempts) reasons.push(`commit attempts ${observation.commitAttempts} != ${testCase.expected.commitAttempts}`)
  return {
    caseId: observation.caseId,
    scenario: observation.scenario,
    expectedOutcome: observation.expectedOutcome,
    actualOutcome: observation.actualOutcome,
    ...(observation.expectedCode === undefined ? {} : { expectedCode: observation.expectedCode }),
    ...(observation.actualCode === undefined ? {} : { actualCode: observation.actualCode }),
    reasons,
    traceId: observation.traceId,
  }
}

function mutationCase(
  caseId: string,
  scenario: MutationEvalScenario,
  title: string,
  description: string,
  outcome: MutationEvalCase['expected']['outcome'],
  code: string,
  commitAttempts: number,
  tags: readonly string[],
): MutationEvalCase {
  return {
    schemaVersion: 'eval-case-v1',
    caseId,
    datasetId: DATASET_ID,
    datasetVersion: DATASET_VERSION,
    split: caseId.includes('finalization') ? 'RELEASE_HOLDOUT' : 'REGRESSION',
    scenario,
    title,
    description,
    expected: {
      outcome,
      code,
      commitAttempts,
      scopeLeakage: false,
      confirmationBypassed: false,
      automaticRetryAttempted: false,
    },
    tags,
    critical: true,
  }
}

function scenarioPassRate(observations: readonly MutationEvalObservation[], scenario: MutationEvalScenario): number {
  const scoped = observations.filter((item) => item.scenario === scenario)
  return ratio(scoped.filter((item) => item.passed).length, scoped.length)
}

function scenarioFailureRate(observations: readonly MutationEvalObservation[], scenario: MutationEvalScenario): number {
  return 1 - scenarioPassRate(observations, scenario)
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator
}

function runById(store: Map<string, StoredMutationEvalRun>, runId: string): StoredMutationEvalRun {
  const run = store.get(runId)
  if (run === undefined) throw new EvaluationClientError('EVAL_RUN_NOT_FOUND', 'mutation evaluation run not found', 404)
  return run
}

function requireVariant(value: string): asserts value is MutationEvalVariant {
  if (value !== 'mutation-unsafe-v0' && value !== 'mutation-guarded-v1') {
    throw new EvaluationClientError('EVAL_VARIANT_NOT_FOUND', 'mutation evaluation variant not found', 404)
  }
}

function requireProject(context: TrustedRequestContext): string {
  if (context.projectId === null) throw new EvaluationClientError('EVAL_PROJECT_REQUIRED', 'select an active project before using mutation evaluation', 409)
  return context.projectId
}
