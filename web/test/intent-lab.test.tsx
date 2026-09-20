import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { IntentEvalCase } from '../../shared/industry/eval/datasets'
import type { IntentLabSnapshot } from '../src/features/eval/IntentLabPage'
import { IntentLabPage, PlaygroundResult } from '../src/features/eval/IntentLabPage'

const testCase: IntentEvalCase = {
  schemaVersion: 'eval-case-v1',
  caseId: 'intent-001',
  datasetId: 'intent-regression-v1',
  domain: 'INTENT',
  query: 'K12+300到K12+800左幅有哪些清单项',
  previousTurns: [],
  expected: {
    primaryIntent: 'QUERY_BOQ',
    acceptableIntents: ['QUERY_BOQ'],
    mustNot: ['MUTATION'],
  },
  tags: ['chainage', 'boq'],
  difficulty: 'NORMAL',
  critical: false,
  labelVersion: 'label-v1',
  reviewed: true,
  labelHistory: [{
    labelVersion: 'label-v1',
    primaryIntent: 'QUERY_BOQ',
    changedAt: '2026-09-12T00:00:00.000Z',
    changedBy: 'fixture',
  }],
}

const snapshot: IntentLabSnapshot = {
  datasets: [{
    datasetId: 'intent-regression-v1',
    name: 'Intent Regression v1',
    domain: 'INTENT',
    version: '1.0.0',
    status: 'REVIEWED',
    caseCount: 1,
    fingerprint: 'abcdef1234567890',
    tags: [{ tag: 'boq', count: 1 }],
    source: 'CURATED',
    createdAt: '2026-09-12T00:00:00.000Z',
    reviewedAt: '2026-09-12T00:00:00.000Z',
  }, {
    datasetId: 'intent-draft-v1',
    name: 'Intent Draft v1',
    domain: 'INTENT',
    version: '1.0.0',
    status: 'DRAFT',
    caseCount: 2,
    fingerprint: 'draft1234567890',
    tags: [],
    source: 'CURATED',
    createdAt: '2026-09-12T00:00:00.000Z',
  }],
  variants: [{
    variantId: 'intent-candidate-v2',
    label: 'Candidate v2',
    description: 'fixture',
    components: {
      gitCommit: 'mock-p1',
      promptVersion: 'intent-prompt-v2',
      intentParserVersion: 'intent-parser-v1',
      modelVersion: 'mock-intent-v2',
      configFingerprint: 'mock-config-v2',
    },
  }],
  runs: [],
}

describe('IntentLabPage', () => {
  it('renders case governance, playground and draft-only guidance', () => {
    const html = renderToStaticMarkup(<IntentLabPage initialSnapshot={snapshot} initialCases={[testCase]} />)
    expect(html).toContain('意图评测 · P1')
    expect(html).toContain('数据集用例')
    expect(html).toContain('intent-001')
    expect(html).toContain('label-v1')
    expect(html).toContain('意图试验场')
    expect(html).toContain('DRAFT 数据集在开发中可见，但尚未达到基线就绪状态')
  })

  it('renders playground result with server-derived project context', () => {
    const html = renderToStaticMarkup(<PlaygroundResult result={{
      primaryIntent: 'QUERY_BOQ',
      candidates: [{ intent: 'QUERY_BOQ', confidence: 0.9 }, { intent: 'UNKNOWN', confidence: 0.1 }],
      confidence: 0.9,
      semanticFrame: {
        normalizedQuery: '第二个呢',
        projectId: 'project-1',
        contextDependent: true,
        tokens: ['第二个呢'],
      },
      variantId: 'intent-candidate-v2',
      components: {
        gitCommit: 'mock-p1',
        promptVersion: 'intent-prompt-v2',
        intentParserVersion: 'intent-parser-v1',
        modelVersion: 'mock-intent-v2',
        configFingerprint: 'mock-config-v2',
      },
      traceId: 'mock-trace-1',
    }} />)
    expect(html).toContain('QUERY_BOQ')
    expect(html).toContain('project-1')
    expect(html).toContain('mock-trace-1')
  })
})
