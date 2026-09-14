import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RETRIEVAL_STAGE_ORDER, type RetrievalStageSnapshot } from '../../shared/industry/eval/retrieval'
import type { RetrievalDebugResult } from '../../shared/industry/retrieval-debug'
import { RetrievalDebugView } from '../src/features/trace/RetrievalDebugPage'

function stage(stage: RetrievalStageSnapshot['stage']): RetrievalStageSnapshot {
  return {
    stage,
    candidates: stage === 'FINAL' ? [{
      entityId: '123456789012345678',
      name: '左幅路基填筑',
      rank: 1,
      sourceArm: ['exact', 'dense'],
      exactScore: 1,
      bm25Score: 0.91,
      denseScore: 0.88,
      entityAwareScore: 0.9,
      rrfScore: 0.86,
      rerankScore: 0.93,
      businessScore: 0.97,
      finalScore: 0.96,
      reason: ['chainage overlap', 'alignment exact'],
      projectId: 'project-1',
    }, {
      entityId: '223456789012345678',
      name: '右幅路基填筑',
      rank: 2,
      sourceArm: ['bm25'],
      finalScore: 0.61,
      reason: ['name lexical match', 'alignment conflict'],
      projectId: 'project-1',
      hardNegative: true,
      criticalSpecConflict: true,
    }] : [],
    ...(stage === 'HARD_FILTERS' ? { removedEntityIds: ['cross-project-001'], notes: ['trusted project hard filter applied'] } : {}),
  }
}

const result: RetrievalDebugResult = {
  traceId: 'trace-project-1-retrieval-001',
  source: 'TRACE',
  queryContext: {
    projectId: 'project-1',
    query: 'K12+300到K12+800左幅有哪些路基工程部位',
    normalizedQuery: 'k12+300到k12+800左幅有哪些路基工程部位',
    domain: 'ENGINEERING',
    chainageStart: 12300,
    chainageEnd: 12800,
    alignment: 'LEFT',
  },
  stages: RETRIEVAL_STAGE_ORDER.map(stage),
  notes: ['Single-trace debug snapshot.', 'Debug is not an evaluation run.'],
}

describe('RetrievalDebugView', () => {
  it('renders all ten retrieval stages while staying distinct from Eval semantics', () => {
    const html = renderToStaticMarkup(<RetrievalDebugView result={result} selectedStage="FINAL" />)
    for (const label of ['Semantic Parse', 'Hard Filters', 'Exact', 'BM25', 'Dense', 'Entity-aware', 'RRF', 'Reranker', 'Business Feature', 'Final']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('Single-trace troubleshooting')
    expect(html).toContain('not Dataset Eval')
    expect(html).not.toContain('Batch Run')
    expect(html).not.toContain('A/B Compare')
    expect(html).not.toContain('Release Gate')
  })

  it('shows final candidate score provenance and hard-negative flags', () => {
    const html = renderToStaticMarkup(<RetrievalDebugView result={result} selectedStage="FINAL" />)
    expect(html).toContain('123456789012345678')
    expect(html).toContain('0.960')
    expect(html).toContain('chainage overlap')
    expect(html).toContain('exact, dense')
    expect(html).toContain('Hard Negative')
    expect(html).toContain('Critical Spec Conflict')
  })

  it('shows entities removed by hard filters', () => {
    const html = renderToStaticMarkup(<RetrievalDebugView result={result} selectedStage="HARD_FILTERS" />)
    expect(html).toContain('cross-project-001')
    expect(html).toContain('trusted project hard filter applied')
  })
})
