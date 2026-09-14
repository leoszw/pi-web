import assert from 'node:assert/strict'
import test from 'node:test'
import type { TrustedRequestContext } from '../src/industry/context'
import '../src/industry/eval/mock-evaluation-client-retrieval'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'

const context: TrustedRequestContext = {
  requestId: 'request-retrieval-safety',
  userId: 'user-1',
  tenantId: 'tenant-1',
  companyId: 'company-1',
  projectId: 'project-1',
  roles: ['project-user'],
  permissions: ['eval.read'],
  sessionId: 'session-retrieval-safety',
}

test('safety regression remains deterministic even when statistical comparison is inconclusive', async () => {
  const client = new MockEvaluationClient()
  const comparison = await client.compareRetrievalRuns(
    context,
    'run-retrieval-candidate-v2',
    'run-retrieval-baseline-v1',
    'CONFIG',
  )

  assert.equal(comparison.pairedStats.minimumSampleWarning, true)
  assert.equal(comparison.pairedStats.conclusion, 'INCONCLUSIVE')
  assert.equal(comparison.deterministicSafetyRegression, true)
  assert.ok(comparison.safetyRegressionReasons.includes('crossAlignmentConflictRate increased'))
  assert.ok(comparison.safetyRegressionReasons.includes('criticalSpecConflictRate increased'))
  assert.ok(comparison.safetyRegressionReasons.includes('wrongEntityHighConfidenceRate increased'))
})
