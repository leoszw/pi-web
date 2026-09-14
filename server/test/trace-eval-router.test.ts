import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextService } from '../src/industry/context'
import '../src/industry/eval/mock-evaluation-client-mutation'
import '../src/industry/eval/mock-evaluation-client-retrieval'
import '../src/industry/eval/mock-evaluation-client-trace'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import { createIndustryRouter } from '../src/industry/router'
import '../src/industry/trace/mock-industry-agent-client-retrieval-debug'

function makeRouter(permissions: readonly string[]) {
  const principal: AuthPrincipal = {
    subject: 'subject-trace-eval',
    userId: 'user-1',
    tenantId: 'tenant-1',
    companyIds: ['company-1'],
    roles: ['project-user'],
    permissions,
    sessionId: `trace-eval-${permissions.join('-')}`,
  }
  const client = new MockIndustryAgentClient([
    { tenantId: 'tenant-1', projectId: 'project-1', companyId: 'company-1', name: 'Project One' },
    { tenantId: 'tenant-1', projectId: 'project-2', companyId: 'company-1', name: 'Project Two' },
  ])
  return createIndustryRouter({
    mode: 'control-plane',
    principalProvider: new MockPrincipalProvider(principal),
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

async function selectProject(baseUrl: string, projectId = 'project-1'): Promise<void> {
  const response = await fetch(`${baseUrl}/api/industry/v1/context/project`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ projectId }),
  })
  assert.equal(response.status, 200)
}

test('Trace Eval read endpoints require eval.read and an active project', async () => {
  await withServer(makeRouter([]), async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/industry/v1/eval/trace/cases`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(denied.status, 403)
    assert.equal((await denied.json() as { error: { code: string } }).error.code, 'EVAL_ACCESS_DENIED')
  })

  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/api/industry/v1/eval/trace/cases`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(missing.status, 409)
    assert.equal((await missing.json() as { error: { code: string } }).error.code, 'EVAL_PROJECT_REQUIRED')
    await selectProject(baseUrl)
    const response = await fetch(`${baseUrl}/api/industry/v1/eval/trace/cases`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(response.status, 200)
    const cases = (await response.json() as { data: Array<{ scenario: string }> }).data
    assert.equal(cases.length, 6)
    assert.deepEqual(cases.map((item) => item.scenario).sort(), [
      'QUERY_LATENCY', 'REDACTION_LEAK', 'SEQUENCE_MONOTONIC', 'TOKEN_ACCOUNTING', 'TOOL_AUDIT_COMPLETENESS', 'TRACE_COMPLETENESS',
    ])
  })
})

test('Trace Eval run creation requires eval.run and rejects trusted-scope injection', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    await selectProject(baseUrl)
    const denied = await fetch(`${baseUrl}/api/industry/v1/eval/trace/runs`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ datasetId: 'trace-safety-v1', variantId: 'trace-guarded-v1' }),
    })
    assert.equal(denied.status, 403)
  })

  await withServer(makeRouter(['eval.read', 'eval.run']), async (baseUrl) => {
    await selectProject(baseUrl)
    const injected = await fetch(`${baseUrl}/api/industry/v1/eval/trace/runs`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ datasetId: 'trace-safety-v1', variantId: 'trace-guarded-v1', projectId: 'attacker-project' }),
    })
    assert.equal(injected.status, 400)
  })
})

test('guarded Trace Eval passes all deterministic trace safety gates', async () => {
  await withServer(makeRouter(['eval.read', 'eval.run']), async (baseUrl) => {
    await selectProject(baseUrl)
    const created = await fetch(`${baseUrl}/api/industry/v1/eval/trace/runs`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ datasetId: 'trace-safety-v1', variantId: 'trace-guarded-v1' }),
    })
    assert.equal(created.status, 201)
    const run = (await created.json() as { data: { runId: string; projectId: string; metrics: Record<string, number | string | string[]> } }).data
    assert.equal(run.projectId, 'project-1')
    assert.equal(run.metrics.releaseGate, 'PASS')
    assert.equal(run.metrics.passRate, 1)
    assert.equal(run.metrics.redactionLeakRate, 0)
    assert.equal(run.metrics.queryLatencyP95Ms, 75)
    assert.deepEqual(run.metrics.releaseGateReasons, [])

    const observationsResponse = await fetch(`${baseUrl}/api/industry/v1/eval/trace/runs/${encodeURIComponent(run.runId)}/observations`, { headers: { origin: 'http://127.0.0.1' } })
    const observations = (await observationsResponse.json() as { data: Array<{ passed: boolean; traceId: string }> }).data
    assert.equal(observations.length, 6)
    assert.ok(observations.every((item) => item.passed))
    assert.ok(observations.every((item) => item.traceId === 'trace-project-1-retrieval-001'))
  })
})

test('broken Trace Eval exposes all six deterministic failure drilldowns', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    await selectProject(baseUrl)
    const runResponse = await fetch(`${baseUrl}/api/industry/v1/eval/trace/runs/run-trace-broken-v0`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(runResponse.status, 200)
    const run = (await runResponse.json() as { data: { metrics: { releaseGate: string; passedCount: number; redactionLeakRate: number; queryLatencyP95Ms: number; releaseGateReasons: string[] } } }).data
    assert.equal(run.metrics.releaseGate, 'FAIL')
    assert.equal(run.metrics.passedCount, 0)
    assert.ok(run.metrics.redactionLeakRate > 0)
    assert.equal(run.metrics.queryLatencyP95Ms, 650)
    assert.equal(run.metrics.releaseGateReasons.length, 6)

    const failureResponse = await fetch(`${baseUrl}/api/industry/v1/eval/trace/runs/run-trace-broken-v0/failures`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(failureResponse.status, 200)
    const failures = (await failureResponse.json() as { data: Array<{ scenario: string; reasons: string[]; traceId: string }> }).data
    assert.equal(failures.length, 6)
    assert.ok(failures.every((item) => item.reasons.length > 0))
    assert.ok(failures.every((item) => item.traceId === 'trace-project-1-retrieval-001'))
  })
})

test('Trace Eval seeded run stores remain isolated by trusted project', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    await selectProject(baseUrl, 'project-2')
    const response = await fetch(`${baseUrl}/api/industry/v1/eval/trace/runs/run-trace-guarded-v1`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(response.status, 200)
    const run = (await response.json() as { data: { projectId: string } }).data
    assert.equal(run.projectId, 'project-2')
    const observations = await fetch(`${baseUrl}/api/industry/v1/eval/trace/runs/run-trace-guarded-v1/observations`, { headers: { origin: 'http://127.0.0.1' } })
    const body = (await observations.json() as { data: Array<{ traceId: string }> }).data
    assert.ok(body.every((item) => item.traceId === 'trace-project-2-retrieval-001'))
  })
})
