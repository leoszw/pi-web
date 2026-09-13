import assert from 'node:assert/strict'
import test from 'node:test'
import { RETRIEVAL_STAGE_ORDER } from '../../shared/industry/eval/retrieval'
import {
  RETRIEVAL_CASE_FIXTURES,
  buildRetrievalLeakageFixture,
  buildRetrievalPlaygroundFixture,
} from '../src/industry/eval/retrieval-fixtures'

test('retrieval fixtures cover engineering and BOQ domains', () => {
  assert.deepEqual(RETRIEVAL_CASE_FIXTURES.map((item) => item.domain).sort(), ['BOQ', 'ENGINEERING'])
  for (const fixture of RETRIEVAL_CASE_FIXTURES) {
    assert.equal(fixture.expected.relevantEntityIds.length > 0, true)
    assert.equal(fixture.expected.hardNegativeEntityIds.length > 0, true)
  }
})

test('playground fixture exposes every required retrieval stage in order', () => {
  const result = buildRetrievalPlaygroundFixture('retrieval-engineering-001')
  assert.deepEqual(result.stages.map((stage) => stage.stage), RETRIEVAL_STAGE_ORDER)
  assert.equal(result.queryContext.chainageStart, 12300)
  assert.equal(result.queryContext.chainageEnd, 12800)
})

test('hard filters remove cross-project candidates permanently before ranking', () => {
  const result = buildRetrievalPlaygroundFixture('retrieval-engineering-001')
  const hardFilters = result.stages.find((stage) => stage.stage === 'HARD_FILTERS')
  assert.ok(hardFilters)
  assert.deepEqual(hardFilters.removedEntityIds, ['eng-cross-project-001'])
  for (const stage of result.stages.filter((item) => item.stage !== 'SEMANTIC_PARSE')) {
    assert.equal(stage.candidates.some((candidate) => candidate.projectId !== 'project-demo-001'), false, `${stage.stage} reintroduced cross-project data`)
  }
})

test('final stage keeps hard negatives inspectable with explicit scores and reasons', () => {
  const result = buildRetrievalPlaygroundFixture('retrieval-boq-001')
  const finalStage = result.stages.find((stage) => stage.stage === 'FINAL')
  assert.ok(finalStage)
  const negative = finalStage.candidates.find((candidate) => candidate.entityId === 'boq-c25-001')
  assert.ok(negative)
  assert.equal(negative.hardNegative, true)
  assert.equal(negative.criticalSpecConflict, true)
  assert.equal(typeof negative.finalScore, 'number')
  assert.equal(negative.reason.length > 0, true)
})

test('leakage fixture flags release holdout contamination deterministically', () => {
  const report = buildRetrievalLeakageFixture()
  assert.equal(report.releaseHoldoutContaminated, true)
  assert.equal(report.findings.some((finding) => finding.splits.includes('RELEASE_HOLDOUT') && finding.severity === 'ERROR'), true)
})
