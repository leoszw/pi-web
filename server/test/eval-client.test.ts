import assert from 'node:assert/strict'
import test from 'node:test'
import type { TrustedRequestContext } from '../src/industry/context'
import '../src/industry/eval/mock-evaluation-client-retrieval'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'

const context: TrustedRequestContext = {
  requestId: 'request-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  projectId: 'project-1',
  roles: ['project-user'],
  permissions: ['eval.read', 'eval.playground', 'eval.run'],
  sessionId: 'session-1',
}

test('mock eval client exposes reviewed and draft datasets without promoting draft labels', async () => {
  const client = new MockEvaluationClient()
  const datasets = await client.listDatasets(context)
  const reviewed = datasets.find((item) => item.datasetId === 'intent-regression-v1')
  const draft = datasets.find((item) => item.datasetId === 'intent-draft-v1')
  assert.equal(reviewed?.status, 'REVIEWED')
  assert.equal(draft?.status, 'DRAFT')
  const draftCases = await client.listCases(context, 'intent-draft-v1')
  assert.ok(draftCases.every((item) => item.reviewed === false))
})

test('intent playground uses server context project and context-dependent intent', async () => {
  const client = new MockEvaluationClient()
  const result = await client.playgroundIntent(context, {
    query: '第二个呢',
    previousTurns: [{ role: 'assistant', text: 'previous result', resolvedIntent: 'QUERY_BOQ' }],
    variantId: 'intent-candidate-v2',
  })
  assert.equal(result.primaryIntent, 'QUERY_BOQ')
  assert.equal(result.semanticFrame.projectId, 'project-1')
  assert.equal(result.semanticFrame.contextDependent, true)
})

test('retrieval playground uses trusted project context and keeps all candidates scoped', async () => {
  const client = new MockEvaluationClient()
  const result = await client.playgroundRetrieval(context, {
    query: 'K12+300到K12+800左幅有哪些路基工程部位',
    domain: 'ENGINEERING',
    variantId: 'retrieval-stable-v1',
  })
  assert.equal(result.queryContext.projectId, 'project-1')
  assert.equal(result.stages.length, 10)
  for (const stage of result.stages) {
    assert.equal(stage.candidates.every((candidate) => candidate.projectId === 'project-1'), true, stage.stage)
  }
})

test('retrieval evaluation requires active project context', async () => {
  const client = new MockEvaluationClient()
  const withoutProject: TrustedRequestContext = { ...context, projectId: null }
  await assert.rejects(
    client.playgroundRetrieval(withoutProject, {
      query: 'C30混凝土基础对应哪些清单项',
      domain: 'BOQ',
      variantId: 'retrieval-stable-v1',
    }),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'EVAL_PROJECT_REQUIRED',
  )
})

test('retrieval leakage report preserves deterministic holdout contamination finding', async () => {
  const client = new MockEvaluationClient()
  const report = await client.getRetrievalLeakageReport(context)
  assert.equal(report.releaseHoldoutContaminated, true)
  assert.equal(report.findings.some((finding) => finding.severity === 'ERROR'), true)
})

test('candidate run improves quantity cases and comparison records the delta', async () => {
  const client = new MockEvaluationClient()
  const baseline = await client.getRun(context, 'run-intent-baseline-v1')
  const candidate = await client.getRun(context, 'run-intent-candidate-v2')
  assert.ok((candidate.metrics?.accuracy.value ?? 0) > (baseline.metrics?.accuracy.value ?? 0))

  const comparison = await client.compareRuns(context, baseline.runId, candidate.runId)
  assert.ok(comparison.improvedCaseIds.length > 0)
  assert.deepEqual(comparison.regressedCaseIds, [])
  assert.ok(comparison.metricDeltas.some((item) => item.metric === 'accuracy' && item.delta > 0))
})

test('wrong mutation intent rate remains zero for both seeded runs', async () => {
  const client = new MockEvaluationClient()
  for (const runId of ['run-intent-baseline-v1', 'run-intent-candidate-v2']) {
    const run = await client.getRun(context, runId)
    assert.equal(run.metrics?.wrongMutationIntentRate.value, 0)
  }
})

test('playground cases can only be saved as unreviewed Draft cases', async () => {
  const client = new MockEvaluationClient()
  const before = await client.listCases(context, 'intent-draft-v1')
  const created = await client.createDraftCase(context, 'intent-draft-v1', {
    query: '这些工程量呢',
    previousTurns: [],
    expected: {
      primaryIntent: 'QUERY_QUANTITY',
      acceptableIntents: ['QUERY_QUANTITY'],
      mustNot: ['MUTATION'],
    },
    tags: ['playground'],
    difficulty: 'HARD',
    critical: false,
    notes: 'human-labelled draft',
  })
  assert.equal(created.reviewed, false)
  assert.equal(created.datasetId, 'intent-draft-v1')
  assert.equal(created.labelHistory.at(-1)?.changedBy, 'user-1')
  const after = await client.listCases(context, 'intent-draft-v1')
  assert.equal(after.length, before.length + 1)

  await assert.rejects(
    client.createDraftCase(context, 'intent-regression-v1', {
      query: 'must not edit reviewed dataset',
      previousTurns: [],
      expected: { primaryIntent: 'UNKNOWN', acceptableIntents: ['UNKNOWN'], mustNot: [] },
      tags: [],
      difficulty: 'NORMAL',
      critical: false,
    }),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'EVAL_DATASET_NOT_EDITABLE',
  )
})
