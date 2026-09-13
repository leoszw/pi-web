import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RETRIEVAL_STAGE_ORDER, type RetrievalPlaygroundResult } from '../../shared/industry/eval/retrieval'
import { RetrievalLabView, type RetrievalLabSnapshot } from '../src/features/eval/RetrievalLabPage'

const result: RetrievalPlaygroundResult = {
  caseId: 'retrieval-boq-001',
  variantId: 'retrieval-stable-v1',
  queryContext: {
    projectId: 'project-1',
    query: 'C30混凝土基础对应哪些清单项',
    normalizedQuery: 'C30混凝土基础对应哪些清单项',
    domain: 'BOQ',
    specification: '混凝土基础',
    concreteGrade: 'C30',
  },
  stages: RETRIEVAL_STAGE_ORDER.map((stage) => ({
    stage,
    candidates: stage === 'SEMANTIC_PARSE' ? [] : [{
      entityId: stage === 'FINAL' ? 'boq-c25-001' : `entity-${stage}`,
      name: stage === 'FINAL' ? 'C25 混凝土基础' : `Candidate ${stage}`,
      rank: 1,
      sourceArm: ['bm25', 'dense'],
      exactScore: stage === 'EXACT' ? 0.95 : undefined,
      bm25Score: stage === 'BM25' ? 0.88 : undefined,
      denseScore: stage === 'DENSE' ? 0.91 : undefined,
      rrfScore: stage === 'RRF' ? 0.9 : undefined,
      rerankScore: stage === 'RERANKER' ? 0.93 : undefined,
      businessScore: stage === 'BUSINESS_FEATURE' ? 0.4 : undefined,
      finalScore: stage === 'FINAL' ? 0.31 : undefined,
      reason: stage === 'FINAL' ? ['基础构件命中但强度等级冲突'] : ['fixture reason'],
      projectId: 'project-1',
      hardNegative: stage === 'FINAL',
      criticalSpecConflict: stage === 'FINAL',
    }],
    ...(stage === 'HARD_FILTERS' ? { removedEntityIds: ['cross-project-001'] } : {}),
  })),
  traceId: 'mock-retrieval-trace-1',
}

const snapshot: RetrievalLabSnapshot = {
  cases: [{
    schemaVersion: 'eval-case-v1',
    caseId: 'retrieval-boq-001',
    datasetId: 'retrieval-regression-v1',
    datasetVersion: '1.0.0',
    split: 'REGRESSION',
    domain: 'BOQ',
    queryContext: result.queryContext,
    expected: {
      relevantEntityIds: ['boq-001'],
      hardNegativeEntityIds: ['boq-c25-001'],
      expectedProjectId: 'project-1',
    },
    tags: ['boq', 'hard-negative'],
    critical: true,
  }],
  leakageReport: {
    datasetId: 'retrieval-regression-v1',
    checkedAt: '2026-09-13T00:00:00.000Z',
    releaseHoldoutContaminated: true,
    findings: [{
      findingId: 'leak-1',
      kind: 'SAME_SOURCE_DUPLICATE',
      caseIds: ['retrieval-boq-001', 'holdout-copy'],
      splits: ['REGRESSION', 'RELEASE_HOLDOUT'],
      severity: 'ERROR',
      reason: 'release holdout fixture contamination',
    }],
  },
  result,
}

describe('RetrievalLabView', () => {
  it('renders every required retrieval stage instead of only final results', () => {
    const html = renderToStaticMarkup(
      <RetrievalLabView
        snapshot={snapshot}
        domain="BOQ"
        selectedCaseId="retrieval-boq-001"
        query="C30混凝土基础对应哪些清单项"
        variantId="retrieval-stable-v1"
        selectedStage="FINAL"
        running={false}
        error={null}
      />,
    )

    for (const label of ['Semantic Parse', 'Hard Filters', 'Exact', 'BM25', 'Dense', 'Entity-aware', 'RRF', 'Reranker', 'Business Feature', 'Final']) {
      expect(html).toContain(label)
    }
  })

  it('highlights hard negatives, critical specification conflicts and leakage', () => {
    const html = renderToStaticMarkup(
      <RetrievalLabView
        snapshot={snapshot}
        domain="BOQ"
        selectedCaseId="retrieval-boq-001"
        query="C30混凝土基础对应哪些清单项"
        variantId="retrieval-stable-v1"
        selectedStage="FINAL"
        running={false}
        error={null}
      />,
    )

    expect(html).toContain('Hard Negative')
    expect(html).toContain('Critical Spec Conflict')
    expect(html).toContain('基础构件命中但强度等级冲突')
    expect(html).toContain('RELEASE_HOLDOUT contaminated')
    expect(html).toContain('SAME_SOURCE_DUPLICATE')
  })

  it('shows hard-filter removals in the selected stage drilldown', () => {
    const html = renderToStaticMarkup(
      <RetrievalLabView
        snapshot={snapshot}
        domain="BOQ"
        selectedCaseId="retrieval-boq-001"
        query="C30混凝土基础对应哪些清单项"
        variantId="retrieval-stable-v1"
        selectedStage="HARD_FILTERS"
        running={false}
        error={null}
      />,
    )

    expect(html).toContain('Removed by hard filters')
    expect(html).toContain('cross-project-001')
  })
})
