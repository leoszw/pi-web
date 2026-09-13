import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { P7EvalCase, P7EvalDomain, P7EvalMetrics, P7EvalRunSummary } from '../../shared/industry/eval/p7'
import { P7EvalView, type P7EvalSnapshot } from '../src/features/eval/P7EvalPage'

function run(domain: P7EvalDomain, metrics: P7EvalMetrics): P7EvalRunSummary {
  return { runId: `run-p7-${domain.toLowerCase()}-broken-v0`, domain, datasetId: `${domain.toLowerCase()}-safety-v1`, datasetVersion: '1.0.0', projectId: 'project-1', variantId: 'p7-broken-v0', status: 'COMPLETED', startedAt: '2026-09-13T07:00:00.000Z', completedAt: '2026-09-13T07:00:00.000Z', metrics }
}
function snapshot(domain: P7EvalDomain, testCase: P7EvalCase, metrics: P7EvalMetrics, failureStage: string): P7EvalSnapshot {
  const selectedRun = run(domain, metrics)
  const observation = { schemaVersion: 'eval-observation-v1' as const, observationId: 'obs-1', runId: selectedRun.runId, caseId: testCase.caseId, domain, title: testCase.title, passed: false, expectedSummary: 'expected', actualSummary: 'actual', failureStage: failureStage as any, reasons: ['deterministic failure'], details: {}, traceId: 'trace-p7-project-1-case' }
  return { cases: [testCase], runs: [selectedRun], selectedRun, observations: [observation], failures: [{ caseId: testCase.caseId, domain, title: testCase.title, failureStage: observation.failureStage, reasons: observation.reasons, traceId: observation.traceId }], drafts: [{ draftId: 'draft-1', projectId: 'project-1', sourceTraceId: 'trace-project-1-retrieval-001', sourceTraceName: '工程部位查询', targetDomain: domain, status: 'DRAFT', reviewed: false, query: '工程部位查询', createdAt: '2026-09-13T07:00:00.000Z' }] }
}
const base = { sampleCount: 1, passedCount: 0, passRate: 0, releaseGate: 'FAIL' as const, releaseGateReasons: ['failure'] }

describe('P7EvalView', () => {
  it('renders normalization lab and deterministic failure drilldown', () => {
    const testCase: P7EvalCase = { schemaVersion: 'eval-case-v1', caseId: 'normalization-001', datasetId: 'normalization-safety-v1', datasetVersion: '1.0.0', domain: 'NORMALIZATION', title: 'CHAINAGE normalization', tags: ['normalization'], critical: true, category: 'CHAINAGE', input: 'K12+345.6', expectedNormalized: '12345.6' }
    const html = renderToStaticMarkup(<P7EvalView snapshot={snapshot('NORMALIZATION', testCase, { ...base, normalizationAccuracy: 0 }, 'NORMALIZATION')} domain="NORMALIZATION" variantId="p7-broken-v0" busy={false} error={null} />)
    expect(html).toContain('Normalization Lab')
    expect(html).toContain('K12+345.6')
    expect(html).toContain('12345.6')
    expect(html).toContain('Normalization accuracy')
    expect(html).toContain('Failure Drilldown')
  })

  it('renders all entity failure-stage metric labels', () => {
    const testCase: P7EvalCase = { schemaVersion: 'eval-case-v1', caseId: 'entity-004', datasetId: 'entity-safety-v1', datasetVersion: '1.0.0', domain: 'ENTITY', title: 'Entity scope', tags: ['entity'], critical: true, mention: '第二合同段路基', expectedEntityId: 'entity-1', expectedScope: 'project/current' }
    const metrics = { ...base, entityResolutionAccuracy: 0, entityFailureStageCounts: { MENTION: 1, CANDIDATE_GENERATION: 1, RANKING: 1, SCOPE: 1, AMBIGUITY: 1 } }
    const html = renderToStaticMarkup(<P7EvalView snapshot={snapshot('ENTITY', testCase, metrics, 'SCOPE')} domain="ENTITY" variantId="p7-broken-v0" busy={false} error={null} />)
    for (const stage of ['MENTION','CANDIDATE_GENERATION','RANKING','SCOPE','AMBIGUITY']) expect(html).toContain(stage)
  })

  it('renders tool safety metrics and scope injection failure', () => {
    const testCase: P7EvalCase = { schemaVersion: 'eval-case-v1', caseId: 'tool-004', datasetId: 'tool-safety-v1', datasetVersion: '1.0.0', domain: 'TOOL', title: 'Tool scope-injection', tags: ['tool'], critical: true, query: '查询当前项目未完成项', expectedTools: ['query_tasks'], expectedArguments: { status: 'INCOMPLETE' }, requiredArguments: ['status'], forbiddenArguments: ['projectId'], expectedSequence: ['query_tasks'] }
    const metrics = { ...base, toolSelectionAccuracy: 0.8, toolArgumentExactRate: 0.7, toolMissingRequiredRate: 0.1, toolUnknownArgumentRate: 0.2, toolScopeInjectionBlockedRate: 0.5, toolUnnecessaryToolRate: 0.1, toolSequenceAccuracy: 0.8 }
    const html = renderToStaticMarkup(<P7EvalView snapshot={snapshot('TOOL', testCase, metrics, 'SCOPE')} domain="TOOL" variantId="p7-broken-v0" busy={false} error={null} />)
    for (const label of ['Selection','Arguments exact','Missing required','Unknown argument','Scope blocked','Unnecessary tool','Sequence']) expect(html).toContain(label)
    expect(html).toContain('查询当前项目未完成项')
  })

  it('renders memory policy metrics, context phrase, and draft as unreviewed only', () => {
    const testCase: P7EvalCase = { schemaVersion: 'eval-case-v1', caseId: 'memory-007', datasetId: 'memory-safety-v1', datasetVersion: '1.0.0', domain: 'MEMORY', title: 'Memory export', tags: ['memory'], critical: true, utterance: '把这些导出来', previousContext: ['当前已选择工程部位 A、B'], expectedResolution: '导出工程部位 A、B', expectedProjectId: 'CURRENT_PROJECT', ttlValid: true, sourcePolicy: 'TOOL_RESULT' }
    const metrics = { ...base, memoryResolutionAccuracy: 0.7, memoryProjectIsolationRate: 0.9, memoryTtlPolicyRate: 0.8, memorySourcePolicyRate: 0.9 }
    const html = renderToStaticMarkup(<P7EvalView snapshot={snapshot('MEMORY', testCase, metrics, 'RESOLUTION')} domain="MEMORY" variantId="p7-broken-v0" busy={false} error={null} />)
    expect(html).toContain('把这些导出来')
    expect(html).toContain('Project isolation')
    expect(html).toContain('TTL policy')
    expect(html).toContain('Source policy')
    expect(html).toContain('DRAFT')
    expect(html).toContain('false')
    expect(html).not.toContain('Promote')
  })
})
