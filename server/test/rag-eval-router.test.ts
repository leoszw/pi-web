import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextService } from '../src/industry/context'
import '../src/industry/eval/mock-evaluation-client-mutation'
import '../src/industry/eval/mock-evaluation-client-rag'
import '../src/industry/eval/mock-evaluation-client-retrieval'
import '../src/industry/eval/mock-evaluation-client-trace'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import '../src/industry/knowledge/mock-industry-agent-client-knowledge'
import { createIndustryRouter } from '../src/industry/router'
import '../src/industry/trace/mock-industry-agent-client-retrieval-debug'

function principal(permissions: readonly string[]): AuthPrincipal {
  return {
    subject: 'subject-rag-eval',
    userId: 'user-1',
    tenantId: 'tenant-1',
    companyIds: ['company-1'],
    roles: ['project-user'],
    permissions,
    sessionId: `session-rag-${permissions.join('-') || 'none'}`,
  }
}

function makeRouter(permissions: readonly string[]) {
  const client = new MockIndustryAgentClient([
    { tenantId: 'tenant-1', projectId: 'project-1', companyId: 'company-1', name: 'Project One' },
    { tenantId: 'tenant-1', projectId: 'project-2', companyId: 'company-1', name: 'Project Two' },
  ])
  return createIndustryRouter({
    mode: 'control-plane',
    principalProvider: new MockPrincipalProvider(principal(permissions)),
    client,
    evaluationClient: new MockEvaluationClient(),
    contextService: new IndustryContextService(client),
    allowedOrigins: new Set(['http://127.0.0.1']),
    jsonBodyLimitBytes: 8192,
  })
}

async function withServer(router: ReturnType<typeof createIndustryRouter>, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = http.createServer((request, response) => {
    void router(request, response).then((handled) => {
      if (!handled) { response.writeHead(404); response.end() }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.notEqual(address, null)
  try { await run(`http://127.0.0.1:${(address as { port: number }).port}`) }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
}

function jsonHeaders() { return { 'content-type': 'application/json', origin: 'http://127.0.0.1' } }

async function selectProject(baseUrl: string, projectId = 'project-1'): Promise<void> {
  const response = await fetch(`${baseUrl}/api/industry/v1/context/project`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ projectId }) })
  assert.equal(response.status, 200)
}

test('RAG eval read requires eval.read and active project', async () => {
  await withServer(makeRouter([]), async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/api/industry/v1/eval/rag/cases`)
    assert.equal(denied.status, 403)
  })
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/api/industry/v1/eval/rag/cases`)
    assert.equal(missing.status, 409)
    await selectProject(baseUrl)
    const cases = await fetch(`${baseUrl}/api/industry/v1/eval/rag/cases`)
    assert.equal(cases.status, 200)
    const body = await cases.json() as { data: Array<{ caseId: string; split: string; expectedEvidence: unknown[] }> }
    assert.equal(body.data.length, 4)
    assert.ok(body.data.some((item) => item.split === 'RELEASE_HOLDOUT'))
  })
})

test('RAG eval run rejects scope injection and requires eval.run', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    await selectProject(baseUrl)
    const denied = await fetch(`${baseUrl}/api/industry/v1/eval/rag/runs`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ datasetId: 'rag-safety-v1', variantId: 'rag-guarded-v1' }) })
    assert.equal(denied.status, 403)
  })
  await withServer(makeRouter(['eval.read', 'eval.run']), async (baseUrl) => {
    await selectProject(baseUrl)
    const injected = await fetch(`${baseUrl}/api/industry/v1/eval/rag/runs`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ datasetId: 'rag-safety-v1', variantId: 'rag-guarded-v1', projectId: 'project-2' }) })
    assert.equal(injected.status, 400)
  })
})

test('guarded RAG run passes retrieval answer citation and deterministic ACL gates', async () => {
  await withServer(makeRouter(['eval.read', 'eval.run']), async (baseUrl) => {
    await selectProject(baseUrl)
    const created = await fetch(`${baseUrl}/api/industry/v1/eval/rag/runs`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ datasetId: 'rag-safety-v1', variantId: 'rag-guarded-v1' }) })
    assert.equal(created.status, 201)
    const body = await created.json() as { data: { runId: string; projectId: string; metrics: Record<string, number | string | string[]> } }
    assert.equal(body.data.projectId, 'project-1')
    assert.equal(body.data.metrics.releaseGate, 'PASS')
    assert.equal(body.data.metrics.aclLeakageRate, 0)
    assert.equal(body.data.metrics.recallAt3, 1)
    assert.equal(body.data.metrics.groundedness, 1)
    assert.equal(body.data.metrics.citationCorrectness, 1)
    assert.equal(body.data.metrics.citationCompleteness, 1)
    assert.equal(body.data.metrics.unsupportedClaimRate, 0)
    assert.equal(body.data.metrics.insufficientEvidenceCorrectness, 1)

    const observations = await fetch(`${baseUrl}/api/industry/v1/eval/rag/runs/${encodeURIComponent(body.data.runId)}/observations`)
    assert.equal(observations.status, 200)
    const observationBody = await observations.json() as { data: Array<{ passed: boolean; retrievedChunks: Array<{ projectId: string; aclAllowed: boolean }>; claims: unknown[] }> }
    assert.equal(observationBody.data.length, 4)
    assert.ok(observationBody.data.every((item) => item.passed))
    assert.ok(observationBody.data.every((item) => item.retrievedChunks.every((chunk) => chunk.projectId === 'project-1' && chunk.aclAllowed)))
  })
})

test('broken RAG run exposes deterministic safety failures and uses evidence-specific metric denominators', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    await selectProject(baseUrl)
    const run = await fetch(`${baseUrl}/api/industry/v1/eval/rag/runs/run-rag-broken-v0`)
    assert.equal(run.status, 200)
    const runBody = await run.json() as { data: { metrics: { releaseGate: string; recallAt3: number; insufficientEvidenceCorrectness: number; aclLeakageRate: number; unsupportedClaimRate: number; duplicateRate: number } } }
    assert.equal(runBody.data.metrics.releaseGate, 'FAIL')
    assert.equal(runBody.data.metrics.recallAt3, 0.5, 'Recall@3 must use only evidence-bearing cases')
    assert.equal(runBody.data.metrics.insufficientEvidenceCorrectness, 0, 'insufficient-evidence correctness must use only no-evidence cases')
    assert.ok(runBody.data.metrics.aclLeakageRate > 0)
    assert.ok(runBody.data.metrics.unsupportedClaimRate > 0)
    assert.ok(runBody.data.metrics.duplicateRate > 0)

    const failures = await fetch(`${baseUrl}/api/industry/v1/eval/rag/runs/run-rag-broken-v0/failures`)
    const failureBody = await failures.json() as { data: Array<{ caseId: string; aclLeakage: boolean; reasons: string[] }> }
    assert.equal(failureBody.data.length, 4)
    assert.ok(failureBody.data.some((item) => item.caseId === 'rag-004' && item.aclLeakage))

    const observations = await fetch(`${baseUrl}/api/industry/v1/eval/rag/runs/run-rag-broken-v0/observations`)
    const observationBody = await observations.json() as { data: Array<{ caseId: string; expectedEvidence: unknown[]; retrievedChunks: unknown[]; answer: string; claims: unknown[]; traceId: string }> }
    const citationCase = observationBody.data.find((item) => item.caseId === 'rag-002')
    assert.ok(citationCase !== undefined)
    assert.ok(citationCase.expectedEvidence.length > 0)
    assert.ok(citationCase.retrievedChunks.length > 0)
    assert.ok(citationCase.answer.length > 0)
    assert.ok(citationCase.claims.length > 0)
    assert.match(citationCase.traceId, /^trace-rag-project-1-/u)
  })
})

test('seeded RAG runs are scoped to the active project', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    await selectProject(baseUrl, 'project-2')
    const run = await fetch(`${baseUrl}/api/industry/v1/eval/rag/runs/run-rag-guarded-v1`)
    const body = await run.json() as { data: { projectId: string } }
    assert.equal(body.data.projectId, 'project-2')
    const observations = await fetch(`${baseUrl}/api/industry/v1/eval/rag/runs/run-rag-guarded-v1/observations`)
    const observationBody = await observations.json() as { data: Array<{ retrievedChunks: Array<{ projectId: string }> }> }
    assert.ok(observationBody.data.every((item) => item.retrievedChunks.every((chunk) => chunk.projectId === 'project-2')))
  })
})
