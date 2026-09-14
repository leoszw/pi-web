import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RetrievalRunSnapshot } from '../src/features/eval/RetrievalRunPage'
import { RetrievalRunView } from '../src/features/eval/RetrievalRunPage'

const snapshot: RetrievalRunSnapshot = {
  run: {
    runId: 'run-retrieval-baseline-v1',
    runType: 'RETRIEVAL',
    datasetId: 'retrieval-regression-v1',
    datasetVersion: '1.0.0',
    status: 'COMPLETED',
    environment: 'LOCAL',
    variantId: 'retrieval-stable-v1',
    projectId: 'project-1',
    startedAt: '2026-09-13T00:00:00.000Z',
    completedAt: '2026-09-13T00:00:01.000Z',
    metrics: {
      recallAtK: [
        { k: 1, value: 0 },
        { k: 5, value: 1 },
        { k: 10, value: 1 },
        { k: 20, value: 1 },
        { k: 50, value: 1 },
      ],
      hitAt1: 0,
      mrr: 0.5,
      map: 0.5,
      ndcgAt10: 0.6309,
      zeroResultRate: 0,
      crossProjectLeakageRate: 0,
      crossAlignmentConflictRate: 1,
      criticalSpecConflictRate: 0,
      wrongEntityHighConfidenceRate: 1,
    },
  },
  observations: [{
    schemaVersion: 'eval-observation-v1',
    observationId: 'obs-1',
    runId: 'run-retrieval-baseline-v1',
    caseId: 'retrieval-engineering-001',
    domain: 'ENGINEERING',
    query: 'K12+300到K12+800左幅有哪些路基工程部位',
    relevantEntityIds: ['eng-001'],
    finalCandidates: [{
      entityId: 'eng-002',
      name: 'K12+300-K12+800 右幅路基填筑',
      rank: 1,
      sourceArm: ['bm25', 'dense'],
      finalScore: 0.93,
      reason: ['桩号区间命中', '横断面方向冲突'],
      projectId: 'project-1',
      alignment: 'RIGHT',
      hardNegative: true,
    }, {
      entityId: 'eng-001',
      name: 'K12+300-K12+800 左幅路基填筑',
      rank: 2,
      sourceArm: ['exact', 'bm25', 'dense'],
      finalScore: 0.84,
      reason: ['桩号区间命中', '左幅命中'],
      projectId: 'project-1',
      alignment: 'LEFT',
    }],
    relevantRanks: [2],
    hitAt1: false,
    hitAt10: true,
    reciprocalRank: 0.5,
    averagePrecision: 0.5,
    ndcgAt10: 0.6309,
    zeroResult: false,
    crossProjectLeakage: false,
    crossAlignmentConflict: true,
    criticalSpecConflict: false,
    wrongEntityHighConfidence: true,
    traceId: 'mock-trace-engineering-001',
  }],
}

describe('RetrievalRunView', () => {
  it('renders failed cases and deterministic safety flags', () => {
    const html = renderToStaticMarkup(
      <RetrievalRunView snapshot={snapshot} selectedCaseId="retrieval-engineering-001" />,
    )
    expect(html).toContain('Retrieval Failure Analysis')
    expect(html).toContain('1 failures')
    expect(html).toContain('Cross-alignment')
    expect(html).toContain('Wrong entity HC')
    expect(html).toContain('FAILURE')
  })

  it('drills into final candidates, relevant rank and trace', () => {
    const html = renderToStaticMarkup(
      <RetrievalRunView snapshot={snapshot} selectedCaseId="retrieval-engineering-001" />,
    )
    expect(html).toContain('Case Drilldown · retrieval-engineering-001')
    expect(html).toContain('eng-002')
    expect(html).toContain('eng-001')
    expect(html).toContain('mock-trace-engineering-001')
    expect(html).toContain('横断面方向冲突')
  })
})
