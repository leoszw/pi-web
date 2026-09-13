import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextService } from '../src/industry/context'
import '../src/industry/eval/mock-evaluation-client-mutation'
import '../src/industry/eval/mock-evaluation-client-retrieval'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import { createIndustryRouter } from '../src/industry/router'

function principal(permissions: readonly string[]): AuthPrincipal {
  return {
    subject: 'subject-mutation-eval',
    userId: 'user-1',
    tenantId: 'tenant-1',
    companyIds: ['company-1'],
    roles: ['project-user'],
    permissions,
    sessionId: 'session-mutation-eval',
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

async function withServer(router: ReturnType<typeof createIndustryRouter>, run: (baseUrl: string) => Promise<void>): Promise<void> {
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

function headers() {
  return { 'content-type': 'application/json', origin: 'http://127.0.0.1' }
}

async function selectProject(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/industry/v1/context/project`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ projectId: 'project-1' }),
  })
  assert.equal(response.status, 200)
}

test('mutation eval read routes require eval.read and active project', async () => {
  await withServer(makeRouter([]), async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/industry/v1/eval/mutation/cases`)
    assert.equal(denied.status, 403)
  })

  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/api/industry/v1/eval/mutation/cases`)
    assert.equal(missing.status, 409)
    assert.equal((await missing.json() as { error: { code: string } }).error.code, 'EVAL_PROJECT_REQUIRED')

    await selectProject(baseUrl)
    const response = await fetch(`${baseUrl}/api/industry/v1/eval/mutation/cases`)
    assert.equal(response.status, 200)
    const body = await response.json() as { data: Array<{ scenario: string; critical: boolean }> }
    assert.equal(body.data.length, 7)
    assert.ok(body.data.every((item) => item.critical))
  })
})

test('mutation eval batch run requires eval.run and rejects request scope injection', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    await selectProject(baseUrl)
    const denied = await fetch(`${baseUrl}/api/industry/v1/eval/mutation/runs`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ datasetId: 'mutation-safety-v1', variantId: 'mutation-guarded-v1' }),
    })
    assert.equal(denied.status, 403)
  })

  await withServer(makeRouter(['eval.read', 'eval.run']), async (baseUrl) => {
    await selectProject(baseUrl)
    const injected = await fetch(`${baseUrl}/api/industry/v1/eval/mutation/runs`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ datasetId: 'mutation-safety-v1', variantId: 'mutation-guarded-v1', projectId: 'attacker-project' }),
    })
    assert.equal(injected.status, 400)

    const invalidVariant = await fetch(`${baseUrl}/api/industry/v1/eval/mutation/runs`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ datasetId: 'mutation-safety-v1', variantId: 'mutation-anything' }),
    })
    assert.equal(invalidVariant.status, 400)
  })
})

test('guarded mutation eval run passes release gate and exposes zero failures', async () => {
  await withServer(makeRouter(['eval.read', 'eval.run']), async (baseUrl) => {
    await selectProject(baseUrl)
    const created = await fetch(`${baseUrl}/api/industry/v1/eval/mutation/runs`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ datasetId: 'mutation-safety-v1', variantId: 'mutation-guarded-v1' }),
    })
    assert.equal(created.status, 201)
    const run = (await created.json() as { data: { runId: string; projectId: string; metrics: { releaseGate: string; criticalPassRate: number; scopeLeakageRate: number } } }).data
    assert.equal(run.projectId, 'project-1')
    assert.equal(run.metrics.releaseGate, 'PASS')
    assert.equal(run.metrics.criticalPassRate, 1)
    assert.equal(run.metrics.scopeLeakageRate, 0)

    const observations = await fetch(`${baseUrl}/api/industry/v1/eval/mutation/runs/${encodeURIComponent(run.runId)}/observations`)
    const observationBody = await observations.json() as { data: Array<{ passed: boolean; approvalMaterialExposed: boolean }> }
    assert.equal(observationBody.data.length, 7)
    assert.ok(observationBody.data.every((item) => item.passed && !item.approvalMaterialExposed))

    const failures = await fetch(`${baseUrl}/api/industry/v1/eval/mutation/runs/${encodeURIComponent(run.runId)}/failures`)
    assert.equal(failures.status, 200)
    assert.deepEqual((await failures.json() as { data: unknown[] }).data, [])
  })
})

test('unsafe mutation eval seeded run exposes scope, bypass and unsafe retry failures', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    await selectProject(baseUrl)
    const runResponse = await fetch(`${baseUrl}/api/industry/v1/eval/mutation/runs/run-mutation-unsafe-v0`)
    assert.equal(runResponse.status, 200)
    const run = (await runResponse.json() as { data: { metrics: { releaseGate: string; scopeLeakageRate: number; confirmationBypassRate: number; unsafeCommitRetryRate: number } } }).data
    assert.equal(run.metrics.releaseGate, 'FAIL')
    assert.ok(run.metrics.scopeLeakageRate > 0)
    assert.ok(run.metrics.confirmationBypassRate > 0)
    assert.ok(run.metrics.unsafeCommitRetryRate > 0)

    const failures = await fetch(`${baseUrl}/api/industry/v1/eval/mutation/runs/run-mutation-unsafe-v0/failures`)
    const body = await failures.json() as { data: Array<{ scenario: string; reasons: string[] }> }
    assert.ok(body.data.some((item) => item.scenario === 'SCOPE_LEAKAGE' && item.reasons.includes('scope leakage observed')))
    assert.ok(body.data.some((item) => item.scenario === 'CONFIRMATION_BYPASS' && item.reasons.includes('confirmation bypass observed')))
    assert.ok(body.data.some((item) => item.scenario === 'FINALIZATION_RECONCILIATION' && item.reasons.includes('unsafe automatic retry attempted')))
  })
})
