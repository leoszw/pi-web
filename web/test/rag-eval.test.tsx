import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { RagEvalMetricsSummary, RagEvalObservation } from '../../shared/industry/eval/rag'
import { RagEvalView, type RagEvalSnapshot } from '../src/features/eval/RagEvalPage'

const brokenMetrics: RagEvalMetricsSummary = {
  sampleCount: 4, passedCount: 0, passRate: 0, recallAt1: 0.25, recallAt3: 0.5, recallAt5: 0.5, mrr: 0.3, ndcgAt5: 0.4,
  documentHitRate: 0.5, chunkHitRate: 0.5, duplicateRate: 0.1, aclLeakageRate: 0.25, groundedness: 0.2,
  citationCorrectness: 0.25, citationCompleteness: 0.5, answerRelevance: 0.25, unsupportedClaimRate: 0.75,
  insufficientEvidenceCorrectness: 0.5, releaseGate: 'FAIL', releaseGateReasons: ['ACL leakage detected', 'unsupported claims detected'],
}

const guardedMetrics: RagEvalMetricsSummary = { ...brokenMetrics, passedCount: 4, passRate: 1, recallAt1: 1, recallAt3: 1, recallAt5: 1, mrr: 1, ndcgAt5: 1, documentHitRate: 1, chunkHitRate: 1, duplicateRate: 0, aclLeakageRate: 0, groundedness: 1, citationCorrectness: 1, citationCompleteness: 1, answerRelevance: 1, unsupportedClaimRate: 0, insufficientEvidenceCorrectness: 1, releaseGate: 'PASS', releaseGateReasons: [] }

const observation: RagEvalObservation = {
  schemaVersion: 'eval-observation-v1', observationId: 'obs-1', runId: 'run-rag-broken-v0', caseId: 'rag-002',
  question: '合同对沉降观测如何规定？',
  expectedEvidence: [{ documentId: 'knowledge-project-1-contract-001', chunkId: 'knowledge-project-1-contract-001:chunk-2', page: 22, section: '沉降观测', sourceVersion: 'source-v1' }],
  retrievedChunks: [{ documentId: 'knowledge-project-1-contract-001', chunkId: 'knowledge-project-1-contract-001:chunk-1', rank: 1, score: 0.88, text: '压实度条款', parentContext: '合同技术条款.pdf > 压实度要求', page: 18, section: '压实度要求', sourceVersion: 'source-v1', projectId: 'project-1', aclAllowed: true }],
  answer: '合同要求每天固定观测三次沉降。', claims: [{ claimId: 'claim-1', text: '每天固定观测三次沉降。', citationChunkIds: ['knowledge-project-1-contract-001:chunk-1'], supported: false }],
  recallAt1: 0, recallAt3: 0, recallAt5: 0, reciprocalRank: 0, ndcgAt5: 0, documentHit: true, chunkHit: false, duplicateRate: 0,
  aclLeakage: false, groundedness: 0, citationCorrectness: 0, citationCompleteness: 0, answerRelevance: 0, unsupportedClaimRate: 1,
  insufficientEvidenceCorrect: true, passed: false, failureReasons: ['citation quality regression detected'], traceId: 'trace-rag-project-1-rag-002-rag-broken-v0',
}

const cases = [{ schemaVersion: 'eval-case-v1' as const, caseId: 'rag-002', datasetId: 'rag-safety-v1', datasetVersion: '1.0.0', split: 'REGRESSION' as const, question: observation.question, expectedEvidence: observation.expectedEvidence, expectedInsufficientEvidence: false, tags: ['citation'], critical: true }]

function snapshot(metrics: RagEvalMetricsSummary, failures = true): RagEvalSnapshot {
  return {
    cases,
    runs: [{ runId: metrics.releaseGate === 'PASS' ? 'run-rag-guarded-v1' : 'run-rag-broken-v0', runType: 'RAG', datasetId: 'rag-safety-v1', datasetVersion: '1.0.0', status: 'COMPLETED', environment: 'LOCAL', variantId: metrics.releaseGate === 'PASS' ? 'rag-guarded-v1' : 'rag-broken-v0', projectId: 'project-1', startedAt: '2026-09-13T07:00:00.000Z', completedAt: '2026-09-13T07:00:00.000Z', metrics }],
    selectedRun: { runId: metrics.releaseGate === 'PASS' ? 'run-rag-guarded-v1' : 'run-rag-broken-v0', runType: 'RAG', datasetId: 'rag-safety-v1', datasetVersion: '1.0.0', status: 'COMPLETED', environment: 'LOCAL', variantId: metrics.releaseGate === 'PASS' ? 'rag-guarded-v1' : 'rag-broken-v0', projectId: 'project-1', startedAt: '2026-09-13T07:00:00.000Z', completedAt: '2026-09-13T07:00:00.000Z', metrics },
    observations: [observation],
    failures: failures ? [{ caseId: 'rag-002', question: observation.question, reasons: observation.failureReasons, aclLeakage: false, unsupportedClaimRate: 1, traceId: observation.traceId }] : [],
    selectedCaseId: 'rag-002',
  }
}

describe('RagEvalView', () => {
  it('renders broken release gate and Citation Inspector evidence chain', () => {
    const html = renderToStaticMarkup(<RagEvalView snapshot={snapshot(brokenMetrics)} variantId="rag-broken-v0" busy={false} error={null} />)
    expect(html).toContain('发布门禁 未通过')
    expect(html).toContain('ACL 泄露')
    expect(html).toContain('不支持断言')
    expect(html).toContain('引用检查器')
    expect(html).toContain('期望证据')
    expect(html).toContain('已检索分块')
    expect(html).toContain('父上下文')
    expect(html).toContain('断言 → 引用')
    expect(html).toContain('第22页')
    expect(html).toContain('source-v1')
  })

  it('renders guarded release gate with no failures', () => {
    const html = renderToStaticMarkup(<RagEvalView snapshot={snapshot(guardedMetrics, false)} variantId="rag-guarded-v1" busy={false} error={null} />)
    expect(html).toContain('发布门禁 通过')
    expect(html).toContain('没有失败的 RAG 用例')
  })
})
