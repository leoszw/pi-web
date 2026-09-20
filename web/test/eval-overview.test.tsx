import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { EvalOverviewSnapshot } from '../src/features/eval/EvalOverviewPage'
import { EvalOverviewView } from '../src/features/eval/EvalOverviewPage'

const snapshot: EvalOverviewSnapshot = {
  datasets: [{ datasetId: 'intent-regression-v1', name: 'Intent Regression v1', domain: 'INTENT', version: '1.0.0', status: 'REVIEWED', caseCount: 14, fingerprint: '1234567890abcdef', tags: [{ tag: 'context', count: 2 }], source: 'CURATED', createdAt: '2026-09-12T00:00:00.000Z', reviewedAt: '2026-09-12T00:00:00.000Z' }],
  runs: [{ runId: 'run-1', runType: 'INTENT', datasetId: 'intent-regression-v1', datasetVersion: '1.0.0', datasetFingerprint: '1234567890abcdef', status: 'COMPLETED', environment: 'LOCAL', variantId: 'intent-candidate-v2', components: { gitCommit: 'mock-p1', promptVersion: 'intent-prompt-v2', intentParserVersion: 'intent-parser-v1', modelVersion: 'mock-intent-v2', configFingerprint: 'mock-config-v2' }, startedAt: '2026-09-12T00:00:00.000Z', completedAt: '2026-09-12T00:00:01.000Z' }],
  variants: [{ variantId: 'intent-candidate-v2', label: 'Candidate v2', description: 'fixture', components: { gitCommit: 'mock-p1', promptVersion: 'intent-prompt-v2', intentParserVersion: 'intent-parser-v1', modelVersion: 'mock-intent-v2', configFingerprint: 'mock-config-v2' } }],
}

describe('EvalOverviewView', () => {
  it('renders P12 online quality alongside the governed P11 benchmark and specialist labs', () => {
    const html = renderToStaticMarkup(<EvalOverviewView snapshot={snapshot} />)
    expect(html).toContain('评测工作台 · P12')
    expect(html).toContain('Intent Regression v1')
    expect(html).toContain('脱敏追踪')
    expect(html).toContain('不进行自动 Golden 晋升')
    for (const path of ['/industry/eval/benchmark','/industry/quality','/industry/eval/intent','/industry/eval/playground/retrieval','/industry/eval/mutation','/industry/eval/trace','/industry/eval/rag','/industry/eval/normalization','/industry/eval/entity','/industry/eval/tool','/industry/eval/memory','/industry/eval/multimodal','/industry/eval/agent-loop','/industry/eval/report','/industry/eval/sandbox']) expect(html).toContain(path)
    expect(html).toContain('P11 Golden / 硬语料库')
    expect(html).toContain('P12 在线质量指标')
  })
})