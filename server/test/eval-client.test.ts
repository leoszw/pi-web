import assert from 'node:assert/strict'
import test from 'node:test'
import type { TrustedRequestContext } from '../src/industry/context'
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
