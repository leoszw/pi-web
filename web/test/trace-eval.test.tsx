import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type {
  TraceEvalCase,
  TraceEvalFailureSummary,
  TraceEvalObservation,
  TraceEvalRunSummary,
} from '../../shared/industry/eval/trace'
import { TraceEvalView, type TraceEvalSnapshot } from '../src/features/eval/TraceEvalPage'

const cases: readonly TraceEvalCase[] = [
  ['trace-eval-001', 'TRACE_COMPLETENESS', 'Trace completeness'],
  ['trace-eval-002', 'SEQUENCE_MONOTONIC', 'Sequence monotonicity'],
  ['trace-eval-003', 'TOKEN_ACCOUNTING', 'Token accounting'],
  ['trace-eval-004', 'TOOL_AUDIT_COMPLETENESS', 'Tool audit completeness'],
  ['trace-eval-005', 'REDACTION_LEAK', 'Redaction leak'],
  ['trace-eval-006', 'QUERY_LATENCY', 'Query latency'],
].map(([caseId, scenario, title]) => ({
  schemaVersion: 'eval-case-v1', caseId, datasetId: 'trace-safety-v1', datasetVersion: '1.0.0', split: scenario === 'QUERY_LATENCY' ? 'RELEASE_HOLDOUT' : 'REGRESSION', scenario, title, description: title, expected: scenario === 'QUERY_LATENCY' ? { mustPass: true, maxLatencyMs: 200 } : { mustPass: true }, critical: true, tags: ['trace'],
})) as readonly TraceEvalCase[]

function run(variantId: 'trace-broken-v0' | 'trace-guarded-v1'): TraceEvalRunSummary {
  const guarded = variantId === 'trace-guarded-v1'
  return {
    runId: guarded ? 'run-trace-guarded-v1' : 'run-trace-broken-v0', runType: 'TRACE', datasetId: 'trace-safety-v1', datasetVersion: '1.0.0', status: 'COMPLETED', environment: 'LOCAL', variantId, projectId: 'project-1', startedAt: '2026-09-13T00:00:00.000Z', completedAt: '2026-09-13T00:00:01.000Z',
    metrics: {
      sampleCount: 6, passedCount: guarded ? 6 : 0, passRate: guarded ? 1 : 0,
      traceCompletenessRate: guarded ? 1 : 0, sequenceMonotonicRate: guarded ? 1 : 0,
      tokenAccountingConsistencyRate: guarded ? 1 : 0, toolAuditCompletenessRate: guarded ? 1 : 0,
      redactionLeakRate: guarded ? 0 : 1 / 6, queryLatencyP95Ms: guarded ? 75 : 650,
      queryLatencyBudgetPassRate: guarded ? 1 : 0, releaseGate: guarded ? 'PASS' : 'FAIL',
      releaseGateReasons: guarded ? [] : ['trace completeness regression detected', 'trace redaction leak detected', 'query latency budget exceeded'],
    },
  }
}

function observation(testCase: TraceEvalCase, passed: boolean): TraceEvalObservation {
  return {
    schemaVersion: 'eval-observation-v1', observationId: `obs:${testCase.caseId}`, runId: passed ? 'run-trace-guarded-v1' : 'run-trace-broken-v0', caseId: testCase.caseId, scenario: testCase.scenario, passed, traceId: 'trace-project-1-retrieval-001', reasons: passed ? [] : [`${testCase.scenario} fault injected`], steps: [{ step: 'deterministic_check', outcome: passed ? 'PASS' : 'FAIL', detail: passed ? 'gate passed' : 'gate failed' }],
    ...(testCase.scenario === 'QUERY_LATENCY' ? { queryLatencyMs: passed ? 75 : 650, maxLatencyMs: 200 } : {}),
    ...(testCase.scenario === 'REDACTION_LEAK' ? { redactionLeakDetected: !passed } : {}),
  }
}

function snapshot(guarded: boolean): TraceEvalSnapshot {
  const observations = cases.map((item) => observation(item, guarded))
  const failures: readonly TraceEvalFailureSummary[] = guarded ? [] : observations.map((item) => ({ caseId: item.caseId, scenario: item.scenario, reasons: item.reasons, traceId: item.traceId }))
  const selectedRun = run(guarded ? 'trace-guarded-v1' : 'trace-broken-v0')
  return { cases, runs: [run('trace-broken-v0'), run('trace-guarded-v1')], selectedRun, observations, failures }
}

describe('TraceEvalView', () => {
  it('renders a broken release gate with observability failures and trace drilldowns', () => {
    const html = renderToStaticMarkup(<TraceEvalView snapshot={snapshot(false)} variantId="trace-broken-v0" busy={false} error={null} />)
    expect(html).toContain('Trace / Token Eval')
    expect(html).toContain('Release Gate FAIL')
    expect(html).toContain('Trace completeness')
    expect(html).toContain('Sequence monotonic')
    expect(html).toContain('Token accounting')
    expect(html).toContain('Tool audit')
    expect(html).toContain('Redaction leak')
    expect(html).toContain('650 ms')
    expect(html).toContain('Failure Drilldown')
    expect(html).toContain('/industry/traces/trace-project-1-retrieval-001')
    expect(html).toContain('deterministic_check')
  })

  it('renders a guarded PASS with no failure cases', () => {
    const html = renderToStaticMarkup(<TraceEvalView snapshot={snapshot(true)} variantId="trace-guarded-v1" busy={false} error={null} />)
    expect(html).toContain('Release Gate PASS')
    expect(html).toContain('75 ms')
    expect(html).toContain('No failed trace safety cases')
    expect(html).not.toContain('data-trace-failure=')
  })
})
