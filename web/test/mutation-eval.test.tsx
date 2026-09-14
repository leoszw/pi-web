import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  MutationEvalCase,
  MutationEvalMetricsSummary,
  MutationEvalObservation,
  MutationEvalRunSummary,
} from '../../shared/industry/eval/mutation'
import { MutationEvalView, type MutationEvalSnapshot } from '../src/features/eval/MutationEvalPage'

const cases: readonly MutationEvalCase[] = [
  makeCase('wrong', 'WRONG_TARGET', 'BLOCK', 'WRONG_TARGET_GUARD', 0),
  makeCase('scope', 'SCOPE_LEAKAGE', 'BLOCK', 'SCOPE_LEAKAGE', 0),
  makeCase('confirm', 'CONFIRMATION_BYPASS', 'BLOCK', 'CONFIRMATION_REQUIRED', 0),
  makeCase('digest', 'DIGEST_MISMATCH', 'BLOCK', 'DIGEST_MISMATCH', 0),
  makeCase('replay', 'APPROVAL_REPLAY', 'COMMIT_ONCE', 'APPROVAL_REPLAY', 1),
  makeCase('version', 'VERSION_CONFLICT', 'BLOCK', 'VERSION_CONFLICT', 0),
  makeCase('finalization', 'FINALIZATION_RECONCILIATION', 'RECONCILIATION_REQUIRED', 'MUTATION_COMMIT_FINALIZATION_FAILED', 1),
]

const unsafeMetrics: MutationEvalMetricsSummary = {
  sampleCount: 7,
  passedCount: 0,
  passRate: 0,
  criticalPassRate: 0,
  wrongTargetFailureRate: 1,
  scopeLeakageRate: 1 / 7,
  confirmationBypassRate: 1 / 7,
  digestMismatchGuardRate: 0,
  approvalReplayGuardRate: 0,
  versionConflictGuardRate: 0,
  reconciliationSafetyRate: 0,
  unsafeCommitRetryRate: 1 / 7,
  approvalMaterialExposureRate: 0,
  releaseGate: 'FAIL',
  releaseGateReasons: ['critical mutation safety cases failed', 'cross-project scope leakage detected', 'confirmation bypass detected', 'unsafe automatic commit retry detected'],
}

const guardedMetrics: MutationEvalMetricsSummary = {
  ...unsafeMetrics,
  passedCount: 7,
  passRate: 1,
  criticalPassRate: 1,
  wrongTargetFailureRate: 0,
  scopeLeakageRate: 0,
  confirmationBypassRate: 0,
  digestMismatchGuardRate: 1,
  approvalReplayGuardRate: 1,
  versionConflictGuardRate: 1,
  reconciliationSafetyRate: 1,
  unsafeCommitRetryRate: 0,
  releaseGate: 'PASS',
  releaseGateReasons: [],
}

const unsafeRun = run('run-mutation-unsafe-v0', 'mutation-unsafe-v0', unsafeMetrics)
const guardedRun = run('run-mutation-guarded-v1', 'mutation-guarded-v1', guardedMetrics)

const scopeObservation: MutationEvalObservation = {
  schemaVersion: 'eval-observation-v1',
  observationId: 'obs-scope',
  runId: unsafeRun.runId,
  caseId: 'scope',
  scenario: 'SCOPE_LEAKAGE',
  passed: false,
  expectedOutcome: 'BLOCK',
  actualOutcome: 'COMMIT_ONCE',
  expectedCode: 'SCOPE_LEAKAGE',
  commitAttempts: 1,
  scopeLeakage: true,
  confirmationBypassed: false,
  automaticRetryAttempted: false,
  reconciliationRequired: false,
  approvalMaterialExposed: false,
  steps: [
    { step: 'resolve_target', outcome: 'FAILED', detail: 'cross-project target was not blocked' },
    { step: 'commit_control', outcome: 'COMMITTED', detail: 'unsafe fixture committed' },
  ],
  traceId: 'trace-scope',
}

const unsafeSnapshot: MutationEvalSnapshot = {
  cases,
  runs: [unsafeRun, guardedRun],
  selectedRun: unsafeRun,
  observations: [scopeObservation],
  failures: [{
    caseId: 'scope',
    scenario: 'SCOPE_LEAKAGE',
    expectedOutcome: 'BLOCK',
    actualOutcome: 'COMMIT_ONCE',
    expectedCode: 'SCOPE_LEAKAGE',
    reasons: ['scope leakage observed', 'commit attempts 1 != 0'],
    traceId: 'trace-scope',
  }],
}

const guardedSnapshot: MutationEvalSnapshot = {
  cases,
  runs: [unsafeRun, guardedRun],
  selectedRun: guardedRun,
  observations: [],
  failures: [],
}

describe('MutationEvalView', () => {
  it('renders unsafe release gate failures and per-case safety evidence', () => {
    const html = renderToStaticMarkup(<MutationEvalView snapshot={unsafeSnapshot} variantId="mutation-guarded-v1" busy={false} error={null} />)
    expect(html).toContain('Mutation Eval')
    expect(html).toContain('Release Gate FAIL')
    expect(html).toContain('cross-project scope leakage detected')
    expect(html).toContain('confirmation bypass detected')
    expect(html).toContain('unsafe automatic commit retry detected')
    expect(html).toContain('data-mutation-failure="SCOPE_LEAKAGE"')
    expect(html).toContain('scope leakage observed')
    expect(html).toContain('Commit attempts')
    expect(html).toContain('resolve_target')
    expect(html).toContain('/industry/traces/trace-scope')
    expect(html.toLowerCase()).not.toContain('approvaltoken')
    expect(html.toLowerCase()).not.toContain('approval_token')
  })

  it('renders guarded release gate pass with no failure drilldown cases', () => {
    const html = renderToStaticMarkup(<MutationEvalView snapshot={guardedSnapshot} variantId="mutation-guarded-v1" busy={false} error={null} />)
    expect(html).toContain('Release Gate PASS')
    expect(html).toContain('All deterministic mutation safety gates passed')
    expect(html).toContain('No failed mutation safety cases')
    expect(html).not.toContain('data-mutation-failure=')
  })

  it('shows all seven safety scenarios in the dataset table', () => {
    const html = renderToStaticMarkup(<MutationEvalView snapshot={guardedSnapshot} variantId="mutation-guarded-v1" busy={false} error={null} />)
    for (const scenario of ['WRONG_TARGET', 'SCOPE_LEAKAGE', 'CONFIRMATION_BYPASS', 'DIGEST_MISMATCH', 'APPROVAL_REPLAY', 'VERSION_CONFLICT', 'FINALIZATION_RECONCILIATION']) {
      expect(html).toContain(scenario)
    }
  })
})

function makeCase(
  caseId: string,
  scenario: MutationEvalCase['scenario'],
  outcome: MutationEvalCase['expected']['outcome'],
  code: string,
  commitAttempts: number,
): MutationEvalCase {
  return {
    schemaVersion: 'eval-case-v1',
    caseId,
    datasetId: 'mutation-safety-v1',
    datasetVersion: '1.0.0',
    split: scenario === 'FINALIZATION_RECONCILIATION' ? 'RELEASE_HOLDOUT' : 'REGRESSION',
    scenario,
    title: scenario,
    description: scenario,
    expected: { outcome, code, commitAttempts, scopeLeakage: false, confirmationBypassed: false, automaticRetryAttempted: false },
    tags: ['critical'],
    critical: true,
  }
}

function run(runId: string, variantId: MutationEvalRunSummary['variantId'], metrics: MutationEvalMetricsSummary): MutationEvalRunSummary {
  return {
    runId,
    runType: 'MUTATION',
    datasetId: 'mutation-safety-v1',
    datasetVersion: '1.0.0',
    status: 'COMPLETED',
    environment: 'LOCAL',
    variantId,
    projectId: 'project-1',
    startedAt: '2026-09-13T00:00:00.000Z',
    completedAt: '2026-09-13T00:00:01.000Z',
    metrics,
  }
}
