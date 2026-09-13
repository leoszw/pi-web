import { createHash } from 'node:crypto'
import type {
  RetrievalCandidate,
  RetrievalEvalCase,
  RetrievalLeakageFinding,
  RetrievalLeakageReport,
  RetrievalPlaygroundResult,
  RetrievalStage,
  RetrievalStageSnapshot,
} from '../../../../shared/industry/eval/retrieval'
import { RETRIEVAL_STAGE_ORDER } from '../../../../shared/industry/eval/retrieval'

const ENGINEERING_CASE: RetrievalEvalCase = {
  schemaVersion: 'eval-case-v1',
  caseId: 'retrieval-engineering-001',
  datasetId: 'retrieval-regression-v1',
  datasetVersion: '1.0.0',
  split: 'REGRESSION',
  domain: 'ENGINEERING',
  queryContext: {
    projectId: 'project-demo-001',
    query: 'K12+300到K12+800左幅有哪些路基工程部位',
    normalizedQuery: 'K12300到K12800左幅有哪些路基工程部位',
    domain: 'ENGINEERING',
    chainageStart: 12300,
    chainageEnd: 12800,
    alignment: 'LEFT',
    category: '路基工程',
  },
  expected: {
    relevantEntityIds: ['eng-001'],
    hardNegativeEntityIds: ['eng-002', 'eng-cross-project-001'],
    expectedProjectId: 'project-demo-001',
    expectedAlignment: 'LEFT',
  },
  tags: ['chainage', 'alignment', 'hard-negative'],
  critical: true,
}

const BOQ_CASE: RetrievalEvalCase = {
  schemaVersion: 'eval-case-v1',
  caseId: 'retrieval-boq-001',
  datasetId: 'retrieval-regression-v1',
  datasetVersion: '1.0.0',
  split: 'REGRESSION',
  domain: 'BOQ',
  queryContext: {
    projectId: 'project-demo-001',
    query: 'C30混凝土基础对应哪些清单项',
    normalizedQuery: 'C30混凝土基础对应哪些清单项',
    domain: 'BOQ',
    specification: '混凝土基础',
    concreteGrade: 'C30',
  },
  expected: {
    relevantEntityIds: ['boq-001'],
    hardNegativeEntityIds: ['boq-c25-001', 'boq-c30-column-001'],
    expectedProjectId: 'project-demo-001',
  },
  tags: ['boq', 'concrete-grade', 'specification', 'hard-negative'],
  critical: true,
}

export const RETRIEVAL_CASE_FIXTURES: readonly RetrievalEvalCase[] = [ENGINEERING_CASE, BOQ_CASE]

const ENGINEERING_CANDIDATES: readonly RetrievalCandidate[] = [
  { ...candidate('eng-001', 'K12+300-K12+800 左幅路基填筑', 'project-demo-001', ['exact', 'bm25', 'dense'], ['桩号区间命中', '左幅命中', '路基类别命中']), alignment: 'LEFT' },
  { ...candidate('eng-002', 'K12+300-K12+800 右幅路基填筑', 'project-demo-001', ['bm25', 'dense'], ['桩号区间命中', '横断面方向冲突']), alignment: 'RIGHT', hardNegative: true },
  { ...candidate('eng-cross-project-001', 'K12+300-K12+800 左幅路基填筑', 'project-demo-002', ['dense'], ['文本高度相似但项目不一致']), alignment: 'LEFT', hardNegative: true },
]

const BOQ_CANDIDATES: readonly RetrievalCandidate[] = [
  candidate('boq-001', 'C30 混凝土基础', 'project-demo-001', ['exact', 'bm25', 'dense'], ['强度等级命中', '基础构件命中']),
  { ...candidate('boq-c25-001', 'C25 混凝土基础', 'project-demo-001', ['bm25', 'dense'], ['基础构件命中但强度等级冲突']), hardNegative: true, criticalSpecConflict: true },
  { ...candidate('boq-c30-column-001', 'C30 混凝土墩柱', 'project-demo-001', ['dense'], ['强度等级命中但构件类型冲突']), hardNegative: true },
]

export function buildRetrievalPlaygroundFixture(caseId: string, variantId = 'retrieval-stable-v1'): RetrievalPlaygroundResult {
  const fixture = RETRIEVAL_CASE_FIXTURES.find((item) => item.caseId === caseId)
  if (fixture === undefined) throw new Error(`unknown retrieval fixture: ${caseId}`)
  const candidates = fixture.domain === 'ENGINEERING' ? ENGINEERING_CANDIDATES : BOQ_CANDIDATES
  return {
    caseId: fixture.caseId,
    variantId,
    queryContext: structuredClone(fixture.queryContext),
    stages: RETRIEVAL_STAGE_ORDER.map((stage, index) => buildStage(stage, candidates, fixture, variantId, index)),
    traceId: `mock-retrieval-${fingerprint(`${fixture.caseId}:${variantId}`)}`,
  }
}

export function buildRetrievalLeakageFixture(): RetrievalLeakageReport {
  const findings: readonly RetrievalLeakageFinding[] = [
    {
      findingId: 'leak-exact-001',
      kind: 'EXACT_DUPLICATE',
      caseIds: ['retrieval-boq-dev-exact-001', 'retrieval-boq-regression-exact-001'],
      splits: ['DEV', 'REGRESSION'],
      severity: 'WARNING',
      reason: 'query 与标注目标完全相同的样本跨 DEV/REGRESSION 重复。',
    },
    {
      findingId: 'leak-normalized-001',
      kind: 'NORMALIZED_DUPLICATE',
      caseIds: ['retrieval-engineering-001', 'retrieval-engineering-dev-copy-001'],
      splits: ['REGRESSION', 'DEV'],
      severity: 'WARNING',
      reason: '桩号表达归一化后 query 完全一致，应避免重复计入评测样本。',
    },
    {
      findingId: 'leak-near-001',
      kind: 'NEAR_DUPLICATE',
      caseIds: ['retrieval-engineering-near-001', 'retrieval-engineering-near-002'],
      splits: ['DEV', 'REGRESSION'],
      severity: 'WARNING',
      reason: '仅同义词和标点不同、工程实体完全相同，属于近重复样本。',
    },
    {
      findingId: 'leak-holdout-001',
      kind: 'SAME_SOURCE_DUPLICATE',
      caseIds: ['retrieval-boq-001', 'retrieval-boq-holdout-copy-001'],
      splits: ['REGRESSION', 'RELEASE_HOLDOUT'],
      severity: 'ERROR',
      reason: '同一来源样本跨 REGRESSION/RELEASE_HOLDOUT，release holdout 已污染。',
    },
  ]
  return {
    datasetId: 'retrieval-regression-v1',
    checkedAt: '2026-09-13T00:00:00.000Z',
    findings,
    releaseHoldoutContaminated: true,
  }
}

function buildStage(
  stage: RetrievalStage,
  base: readonly RetrievalCandidate[],
  fixture: RetrievalEvalCase,
  variantId: string,
  index: number,
): RetrievalStageSnapshot {
  if (stage === 'SEMANTIC_PARSE') return { stage, candidates: [], notes: ['展示归一化 query 与结构化工程/清单实体，不产生候选。'] }
  const scoped = base.filter((item) => item.projectId === fixture.expected.expectedProjectId)
  if (stage === 'HARD_FILTERS') {
    return {
      stage,
      candidates: scoped.map((item, rank) => ({ ...item, rank: rank + 1 })),
      removedEntityIds: base.filter((item) => item.projectId !== fixture.expected.expectedProjectId).map((item) => item.entityId),
      notes: ['项目范围在服务端上下文中确定，跨项目候选必须在 hard filters 阶段剔除，且后续阶段不得重新进入候选集。'],
    }
  }
  const candidates = scoped
    .filter((item) => stage === 'EXACT' ? item.sourceArm.includes('exact') : true)
    .map((item, rank) => scoreCandidate(item, stage, index, rank, fixture, variantId))
    .sort((a, b) => (b.finalScore ?? b.rerankScore ?? b.rrfScore ?? b.denseScore ?? b.bm25Score ?? b.exactScore ?? 0)
      - (a.finalScore ?? a.rerankScore ?? a.rrfScore ?? a.denseScore ?? a.bm25Score ?? a.exactScore ?? 0))
    .map((item, rank) => ({ ...item, rank: rank + 1 }))
  return { stage, candidates }
}

function scoreCandidate(
  candidateValue: RetrievalCandidate,
  stage: RetrievalStage,
  index: number,
  rank: number,
  fixture: RetrievalEvalCase,
  variantId: string,
): RetrievalCandidate {
  const base = Math.max(0.25, 0.96 - rank * 0.22 - index * 0.003)
  const result: RetrievalCandidate = { ...candidateValue, rank: rank + 1 }
  if (stage === 'EXACT') result.exactScore = round(base)
  if (stage === 'BM25') result.bm25Score = round(base - 0.03)
  if (stage === 'DENSE') result.denseScore = round(base - 0.01)
  if (stage === 'ENTITY_AWARE') result.entityAwareScore = round(base + (candidateValue.hardNegative ? -0.18 : 0.04))
  if (stage === 'RRF') result.rrfScore = round(base + (candidateValue.hardNegative ? -0.12 : 0.03))
  if (stage === 'RERANKER') result.rerankScore = round(base + (candidateValue.hardNegative ? -0.25 : 0.08))
  if (stage === 'BUSINESS_FEATURE') result.businessScore = round(base + (candidateValue.criticalSpecConflict ? -0.35 : candidateValue.hardNegative ? -0.12 : 0.06))
  if (stage === 'FINAL') result.finalScore = finalVariantScore(candidateValue, fixture, variantId)
  return result
}

function finalVariantScore(candidateValue: RetrievalCandidate, fixture: RetrievalEvalCase, variantId: string): number {
  const relevant = fixture.expected.relevantEntityIds.includes(candidateValue.entityId)
  if (variantId === 'retrieval-candidate-v2') {
    return relevant ? 0.97 : candidateValue.criticalSpecConflict ? 0.48 : 0.55
  }
  if (fixture.domain === 'ENGINEERING') {
    return relevant ? 0.84 : candidateValue.entityId === 'eng-002' ? 0.93 : 0.58
  }
  return relevant ? 0.83 : candidateValue.criticalSpecConflict ? 0.94 : 0.62
}

function candidate(entityId: string, name: string, projectId: string, sourceArm: readonly string[], reason: readonly string[]): RetrievalCandidate {
  return { entityId, name, rank: 1, sourceArm, reason, projectId }
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

function round(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4))
}
