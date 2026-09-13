import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextService } from '../src/industry/context'
import '../src/industry/eval/mock-evaluation-client-mutation'
import '../src/industry/eval/mock-evaluation-client-p7'
import '../src/industry/eval/mock-evaluation-client-rag'
import '../src/industry/eval/mock-evaluation-client-retrieval'
import '../src/industry/eval/mock-evaluation-client-trace'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import '../src/industry/knowledge/mock-industry-agent-client-knowledge'
import { createIndustryRouter } from '../src/industry/router'
import '../src/industry/trace/mock-industry-agent-client-retrieval-debug'

function principal(permissions: readonly string[]): AuthPrincipal {
  return { subject: 'subject-p7', userId: 'user-1', tenantId: 'tenant-1', companyIds: ['company-1'], roles: ['project-user'], permissions, sessionId: `session-p7-${permissions.join('-') || 'none'}` }
}
function makeRouter(permissions: readonly string[]) {
  const client = new MockIndustryAgentClient([
    { tenantId: 'tenant-1', projectId: 'project-1', companyId: 'company-1', name: 'Project One' },
    { tenantId: 'tenant-1', projectId: 'project-2', companyId: 'company-1', name: 'Project Two' },
  ])
  return createIndustryRouter({ mode: 'control-plane', principalProvider: new MockPrincipalProvider(principal(permissions)), client, evaluationClient: new MockEvaluationClient(), contextService: new IndustryContextService(client), allowedOrigins: new Set(['http://127.0.0.1']), jsonBodyLimitBytes: 8192 })
}
async function withServer(router: ReturnType<typeof createIndustryRouter>, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = http.createServer((request, response) => { void router(request, response).then((handled) => { if (!handled) { response.writeHead(404); response.end() } }) })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert.notEqual(address, null)
  try { await run(`http://127.0.0.1:${(address as { port: number }).port}`) } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) }
}
function headers() { return { 'content-type': 'application/json', origin: 'http://127.0.0.1' } }
async function selectProject(baseUrl: string, projectId = 'project-1'): Promise<void> {
  const response = await fetch(`${baseUrl}/api/industry/v1/context/project`, { method: 'POST', headers: headers(), body: JSON.stringify({ projectId }) })
  assert.equal(response.status, 200)
}

test('P7 read requires eval.read and active project', async () => {
  await withServer(makeRouter([]), async (baseUrl) => assert.equal((await fetch(`${baseUrl}/api/industry/v1/eval/p7/normalization/cases`)).status, 403))
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/industry/v1/eval/p7/normalization/cases`)).status, 409)
    await selectProject(baseUrl)
    assert.equal((await fetch(`${baseUrl}/api/industry/v1/eval/p7/normalization/cases`)).status, 200)
  })
})

test('P7 datasets cover normalization entity tool and memory requirements', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    await selectProject(baseUrl)
    const normalization = await (await fetch(`${baseUrl}/api/industry/v1/eval/p7/normalization/cases`)).json() as { data: Array<{ category: string }> }
    assert.deepEqual(new Set(normalization.data.map((item) => item.category)), new Set(['CHAINAGE','RANGE','ALIGNMENT','SIDE','UNIT','BOQ_CODE','DATE','SPECIFICATION','ABBREVIATION']))
    const entity = await (await fetch(`${baseUrl}/api/industry/v1/eval/p7/entity/cases`)).json() as { data: unknown[] }
    assert.equal(entity.data.length, 5)
    const tool = await (await fetch(`${baseUrl}/api/industry/v1/eval/p7/tool/cases`)).json() as { data: unknown[] }
    assert.equal(tool.data.length, 7)
    const memory = await (await fetch(`${baseUrl}/api/industry/v1/eval/p7/memory/cases`)).json() as { data: Array<{ utterance: string }> }
    for (const phrase of ['这些','那些','刚才那些','第二个','只看未完成的','继续','把这些导出来']) assert.ok(memory.data.some((item) => item.utterance === phrase))
  })
})

test('guarded P7 seeded runs pass all four release gates', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    await selectProject(baseUrl)
    for (const domain of ['normalization','entity','tool','memory']) {
      const run = await fetch(`${baseUrl}/api/industry/v1/eval/p7/runs/run-p7-${domain}-guarded-v1`)
      assert.equal(run.status, 200)
      const body = await run.json() as { data: { metrics: { releaseGate: string; passRate: number } } }
      assert.equal(body.data.metrics.releaseGate, 'PASS')
      assert.equal(body.data.metrics.passRate, 1)
      const failures = await (await fetch(`${baseUrl}/api/industry/v1/eval/p7/runs/run-p7-${domain}-guarded-v1/failures`)).json() as { data: unknown[] }
      assert.equal(failures.data.length, 0)
    }
  })
})

test('broken P7 runs expose stage and safety failures deterministically', async () => {
  await withServer(makeRouter(['eval.read']), async (baseUrl) => {
    await selectProject(baseUrl)
    const entity = await (await fetch(`${baseUrl}/api/industry/v1/eval/p7/runs/run-p7-entity-broken-v0/failures`)).json() as { data: Array<{ failureStage: string }> }
    assert.deepEqual(new Set(entity.data.map((item) => item.failureStage)), new Set(['MENTION','CANDIDATE_GENERATION','RANKING','SCOPE','AMBIGUITY']))
    const tool = await (await fetch(`${baseUrl}/api/industry/v1/eval/p7/runs/run-p7-tool-broken-v0`)).json() as { data: { metrics: { releaseGate: string; toolScopeInjectionBlockedRate: number; toolMissingRequiredRate: number; toolUnknownArgumentRate: number; toolUnnecessaryToolRate: number; toolSequenceAccuracy: number } } }
    assert.equal(tool.data.metrics.releaseGate, 'FAIL')
    assert.ok(tool.data.metrics.toolScopeInjectionBlockedRate < 1)
    assert.ok(tool.data.metrics.toolMissingRequiredRate > 0)
    assert.ok(tool.data.metrics.toolUnknownArgumentRate > 0)
    assert.ok(tool.data.metrics.toolUnnecessaryToolRate > 0)
    assert.ok(tool.data.metrics.toolSequenceAccuracy < 1)
    const memory = await (await fetch(`${baseUrl}/api/industry/v1/eval/p7/runs/run-p7-memory-broken-v0`)).json() as { data: { metrics: { memoryProjectIsolationRate: number; memoryTtlPolicyRate: number; memorySourcePolicyRate: number } } }
    assert.ok(memory.data.metrics.memoryProjectIsolationRate < 1)
    assert.ok(memory.data.metrics.memoryTtlPolicyRate < 1)
    assert.ok(memory.data.metrics.memorySourcePolicyRate < 1)
  })
})

test('P7 run creation rejects browser scope injection', async () => {
  await withServer(makeRouter(['eval.read', 'eval.run']), async (baseUrl) => {
    await selectProject(baseUrl)
    const injected = await fetch(`${baseUrl}/api/industry/v1/eval/p7/tool/runs`, { method: 'POST', headers: headers(), body: JSON.stringify({ datasetId: 'tool-safety-v1', variantId: 'p7-guarded-v1', projectId: 'project-2' }) })
    assert.equal(injected.status, 400)
  })
})

test('Trace Add to Eval creates only an unreviewed draft and requires both permissions', async () => {
  await withServer(makeRouter(['eval.dataset.edit']), async (baseUrl) => {
    await selectProject(baseUrl)
    const denied = await fetch(`${baseUrl}/api/industry/v1/eval/p7/drafts/from-trace`, { method: 'POST', headers: headers(), body: JSON.stringify({ traceId: 'trace-project-1-retrieval-001', targetDomain: 'ENTITY' }) })
    assert.equal(denied.status, 403)
  })
  await withServer(makeRouter(['eval.read', 'eval.dataset.edit', 'trace.read.basic']), async (baseUrl) => {
    await selectProject(baseUrl)
    const created = await fetch(`${baseUrl}/api/industry/v1/eval/p7/drafts/from-trace`, { method: 'POST', headers: headers(), body: JSON.stringify({ traceId: 'trace-project-1-retrieval-001', targetDomain: 'ENTITY' }) })
    assert.equal(created.status, 201)
    const body = await created.json() as { data: { status: string; reviewed: boolean; projectId: string; sourceTraceId: string } }
    assert.equal(body.data.status, 'DRAFT')
    assert.equal(body.data.reviewed, false)
    assert.equal(body.data.projectId, 'project-1')
    assert.equal(body.data.sourceTraceId, 'trace-project-1-retrieval-001')
    const drafts = await (await fetch(`${baseUrl}/api/industry/v1/eval/p7/drafts`)).json() as { data: Array<{ status: string; reviewed: boolean }> }
    assert.equal(drafts.data.length, 1)
    assert.ok(drafts.data.every((item) => item.status === 'DRAFT' && item.reviewed === false))
    const promote = await fetch(`${baseUrl}/api/industry/v1/eval/p7/drafts/${encodeURIComponent('draft-1')}/promote`, { method: 'POST', headers: headers(), body: '{}' })
    assert.equal(promote.status, 404)
  })
})

test('Trace draft cannot reach a trace from another active project', async () => {
  await withServer(makeRouter(['eval.dataset.edit', 'trace.read.basic']), async (baseUrl) => {
    await selectProject(baseUrl, 'project-2')
    const response = await fetch(`${baseUrl}/api/industry/v1/eval/p7/drafts/from-trace`, { method: 'POST', headers: headers(), body: JSON.stringify({ traceId: 'trace-project-1-retrieval-001', targetDomain: 'MEMORY' }) })
    assert.equal(response.status, 404)
  })
})
