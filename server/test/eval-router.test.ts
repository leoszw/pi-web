import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextService } from '../src/industry/context'
import '../src/industry/eval/mock-evaluation-client-retrieval'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import { createIndustryRouter } from '../src/industry/router'

function principal(permissions: readonly string[]): AuthPrincipal {
  return {
    subject: 'subject-1',
    userId: 'user-1',
    tenantId: 'tenant-1',
    companyIds: ['company-1'],
    roles: ['project-user'],
    permissions,
    sessionId: 'session-eval-router',
  }
}

function makeRouter(permissions: readonly string[]) {
  const client = new MockIndustryAgentClient([
    { tenantId: 'tenant-1', projectId: 'project-1', companyId: 'company-1', name: 'Project One' },
  ])
  return createIndustryRouter({
    mode: 'control-plane',
    principalProvider: new MockPrincipalProvider(principal(permissions)),
    client,
    evaluationClient: new MockEvaluationClient(),
    contextService: new IndustryContextService(client),
    allowedOrigins: new Set(['http://127.0.0.1']),
    jsonBodyLimitBytes: 4096,
  })
}

async function withServer(
  router: ReturnType<typeof createIndustryRouter>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = http.createServer((request, response) => {
    void router(request, response).then((handled) => {
      if (!handled) {
        response.writeHead(404)
        response.end()
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.notEqual(address, null)
  try {
    await run(`http://127.0.0.1:${(address as { port: number }).port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

function jsonHeaders() {
  return { 'content-type': 'application/json', origin: 'http://127.0.0.1' }
}

async function selectProject(baseUrl: string): Promise<void> {
  const selected = await fetch(`${baseUrl}/api/industry/v1/context/project`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ projectId: 'project-1' }),
  })
  assert.equal(selected.status, 200)
}

test('eval read endpoints require eval.read', async () => {
  await withServer(makeRouter([]), async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/industry/v1/eval/datasets`)
    assert.equal(denied.status, 403)
    const body = await denied.json() as { error: { code: string } }
    assert.equal(body.error.code, 'EVAL_ACCESS_DENIED')
  })

  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/industry/v1/eval/datasets`)
    assert.equal(response.status, 200)
    const body = await response.json() as { apiVersion: string; data: Array<{ datasetId: string }> }
    assert.equal(body.apiVersion, 'eval-api-v1')
    assert.ok(body.data.some((item) => item.datasetId === 'intent-regression-v1'))
  })
})

test('intent playground rejects scope injection and uses server-selected project', async () => {
  await withServer(makeRouter(['eval.read', 'eval.playground']), async (baseUrl) => {
    await selectProject(baseUrl)

    const injected = await fetch(`${baseUrl}/api/industry/v1/eval/playground/intent`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        query: '第二个呢',
        previousTurns: [{ role: 'assistant', text: 'previous', resolvedIntent: 'QUERY_BOQ' }],
        variantId: 'intent-candidate-v2',
        projectId: 'attacker-project',
      }),
    })
    assert.equal(injected.status, 400)

    const valid = await fetch(`${baseUrl}/api/industry/v1/eval/playground/intent`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        query: '第二个呢',
        previousTurns: [{ role: 'assistant', text: 'previous', resolvedIntent: 'QUERY_BOQ' }],
        variantId: 'intent-candidate-v2',
      }),
    })
    assert.equal(valid.status, 200)
    const body = await valid.json() as { data: { primaryIntent: string; semanticFrame: { projectId: string | null } } }
    assert.equal(body.data.primaryIntent, 'QUERY_BOQ')
    assert.equal(body.data.semanticFrame.projectId, 'project-1')
  })
})

test('retrieval playground rejects scope injection and keeps hard-filtered candidates in selected project', async () => {
  await withServer(makeRouter(['eval.read', 'eval.playground']), async (baseUrl) => {
    await selectProject(baseUrl)

    const injected = await fetch(`${baseUrl}/api/industry/v1/eval/playground/retrieval`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        query: 'K12+300到K12+800左幅有哪些路基工程部位',
        domain: 'ENGINEERING',
        variantId: 'retrieval-stable-v1',
        projectId: 'attacker-project',
      }),
    })
    assert.equal(injected.status, 400)

    const valid = await fetch(`${baseUrl}/api/industry/v1/eval/playground/retrieval`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        query: 'K12+300到K12+800左幅有哪些路基工程部位',
        domain: 'ENGINEERING',
        variantId: 'retrieval-stable-v1',
      }),
    })
    assert.equal(valid.status, 200)
    const body = await valid.json() as {
      data: {
        queryContext: { projectId: string }
        stages: Array<{ stage: string; candidates: Array<{ projectId: string }> }>
      }
    }
    assert.equal(body.data.queryContext.projectId, 'project-1')
    for (const stage of body.data.stages) {
      assert.equal(stage.candidates.every((candidate) => candidate.projectId === 'project-1'), true, stage.stage)
    }
  })
})

test('retrieval cases and leakage report require eval.read and active project', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    const missingProject = await fetch(`${baseUrl}/api/industry/v1/eval/retrieval/cases`)
    assert.equal(missingProject.status, 409)
    const missingBody = await missingProject.json() as { error: { code: string } }
    assert.equal(missingBody.error.code, 'EVAL_PROJECT_REQUIRED')

    await selectProject(baseUrl)
    const cases = await fetch(`${baseUrl}/api/industry/v1/eval/retrieval/cases`)
    assert.equal(cases.status, 200)
    const casesBody = await cases.json() as { data: Array<{ domain: string; queryContext: { projectId: string } }> }
    assert.deepEqual(casesBody.data.map((item) => item.domain).sort(), ['BOQ', 'ENGINEERING'])
    assert.equal(casesBody.data.every((item) => item.queryContext.projectId === 'project-1'), true)

    const leakage = await fetch(`${baseUrl}/api/industry/v1/eval/retrieval/leakage`)
    assert.equal(leakage.status, 200)
    const leakageBody = await leakage.json() as { data: { releaseHoldoutContaminated: boolean } }
    assert.equal(leakageBody.data.releaseHoldoutContaminated, true)
  })
})

test('retrieval batch run requires eval.run and exposes metrics plus observations', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    await selectProject(baseUrl)
    const denied = await fetch(`${baseUrl}/api/industry/v1/eval/retrieval/runs`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ datasetId: 'retrieval-regression-v1', variantId: 'retrieval-candidate-v2' }),
    })
    assert.equal(denied.status, 403)
  })

  await withServer(makeRouter(['eval.read', 'eval.run']), async (baseUrl) => {
    await selectProject(baseUrl)
    const created = await fetch(`${baseUrl}/api/industry/v1/eval/retrieval/runs`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ datasetId: 'retrieval-regression-v1', variantId: 'retrieval-candidate-v2' }),
    })
    assert.equal(created.status, 201)
    const createdBody = await created.json() as {
      data: { runId: string; projectId: string; metrics: { hitAt1: number; crossProjectLeakageRate: number } }
    }
    assert.equal(createdBody.data.projectId, 'project-1')
    assert.equal(createdBody.data.metrics.hitAt1, 1)
    assert.equal(createdBody.data.metrics.crossProjectLeakageRate, 0)

    const observations = await fetch(`${baseUrl}/api/industry/v1/eval/retrieval/runs/${encodeURIComponent(createdBody.data.runId)}/observations`)
    assert.equal(observations.status, 200)
    const observationsBody = await observations.json() as {
      data: Array<{ finalCandidates: Array<{ projectId: string }>; hitAt10: boolean }>
    }
    assert.equal(observationsBody.data.length, 2)
    assert.ok(observationsBody.data.every((item) => item.hitAt10))
    assert.ok(observationsBody.data.every((item) => item.finalCandidates.every((candidate) => candidate.projectId === 'project-1')))
  })
})

test('retrieval A/B compare returns metric deltas, movement and INCONCLUSIVE small-sample stats', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    await selectProject(baseUrl)

    const invalid = await fetch(`${baseUrl}/api/industry/v1/eval/retrieval/compare`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        baselineRunId: 'run-retrieval-baseline-v1',
        candidateRunId: 'run-retrieval-candidate-v2',
        comparisonType: 'INVALID',
      }),
    })
    assert.equal(invalid.status, 400)

    const response = await fetch(`${baseUrl}/api/industry/v1/eval/retrieval/compare`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({
        baselineRunId: 'run-retrieval-baseline-v1',
        candidateRunId: 'run-retrieval-candidate-v2',
        comparisonType: 'CONFIG',
      }),
    })
    assert.equal(response.status, 200)
    const body = await response.json() as {
      data: {
        metricDeltas: Array<{ metric: string; delta: number }>
        improvedCaseIds: string[]
        rankMovements: Array<{ rankDelta?: number }>
        pairedStats: { minimumSampleWarning: boolean; conclusion: string }
        deterministicSafetyRegression: boolean
      }
    }
    assert.ok(body.data.metricDeltas.some((item) => item.metric === 'hitAt1' && item.delta > 0))
    assert.ok(body.data.improvedCaseIds.length > 0)
    assert.ok(body.data.rankMovements.some((item) => item.rankDelta !== undefined && item.rankDelta !== 0))
    assert.equal(body.data.pairedStats.minimumSampleWarning, true)
    assert.equal(body.data.pairedStats.conclusion, 'INCONCLUSIVE')
    assert.equal(body.data.deterministicSafetyRegression, false)
  })
})

test('batch run requires eval.run and exposes observations', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/industry/v1/eval/runs`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ datasetId: 'intent-regression-v1', variantId: 'intent-candidate-v2' }),
    })
    assert.equal(denied.status, 403)
  })

  await withServer(makeRouter(['eval.read', 'eval.run']), async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/industry/v1/eval/runs`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ datasetId: 'intent-regression-v1', variantId: 'intent-candidate-v2' }),
    })
    assert.equal(created.status, 201)
    const body = await created.json() as { data: { runId: string; metrics: { accuracy: { value: number } } } }
    assert.ok(body.data.metrics.accuracy.value > 0)

    const observations = await fetch(`${baseUrl}/api/industry/v1/eval/runs/${encodeURIComponent(body.data.runId)}/observations`)
    assert.equal(observations.status, 200)
    const observationBody = await observations.json() as { data: Array<{ caseId: string }> }
    assert.ok(observationBody.data.length >= 10)
  })
})

test('seeded baseline and candidate can be compared on the same dataset fingerprint', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/industry/v1/eval/compare`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ baselineRunId: 'run-intent-baseline-v1', candidateRunId: 'run-intent-candidate-v2' }),
    })
    assert.equal(response.status, 200)
    const body = await response.json() as { data: { improvedCaseIds: string[]; regressedCaseIds: string[] } }
    assert.ok(body.data.improvedCaseIds.length > 0)
    assert.deepEqual(body.data.regressedCaseIds, [])
  })
})

test('saving a playground result requires dataset edit permission and remains Draft', async () => {
  const body = {
    query: '这些工程量呢',
    previousTurns: [],
    expected: { primaryIntent: 'QUERY_QUANTITY', acceptableIntents: ['QUERY_QUANTITY'], mustNot: ['MUTATION'] },
    tags: ['playground'],
    difficulty: 'HARD',
    critical: false,
    notes: 'human-labelled from playground',
  }

  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/industry/v1/eval/datasets/intent-draft-v1/cases`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    })
    assert.equal(denied.status, 403)
  })

  await withServer(makeRouter(['eval.read', 'eval.dataset.edit']), async (baseUrl) => {
    const created = await fetch(`${baseUrl}/api/industry/v1/eval/datasets/intent-draft-v1/cases`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    })
    assert.equal(created.status, 201)
    const payload = await created.json() as { data: { reviewed: boolean; datasetId: string; labelVersion: string } }
    assert.equal(payload.data.reviewed, false)
    assert.equal(payload.data.datasetId, 'intent-draft-v1')
    assert.match(payload.data.labelVersion, /^draft-label-/u)

    const reviewed = await fetch(`${baseUrl}/api/industry/v1/eval/datasets/intent-regression-v1/cases`, {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(body),
    })
    assert.equal(reviewed.status, 409)
  })
})
