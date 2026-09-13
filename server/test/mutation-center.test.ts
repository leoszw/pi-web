import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import type { MutationAuditTrail, MutationOperation, MutationReconciliationList } from '../../shared/industry/mutation'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import type { TrustedRequestContext } from '../src/industry/context'
import { IndustryContextService } from '../src/industry/context'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import { createIndustryRouter } from '../src/industry/router'

const principal: AuthPrincipal = {
  subject: 'subject-mutation',
  userId: 'user-1',
  tenantId: 'tenant-1',
  companyIds: ['company-1'],
  roles: ['project-user'],
  permissions: ['industry.read', 'industry.mutation'],
  sessionId: 'session-mutation-center',
}

function makeRouter() {
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

function headers(extra: Record<string, string> = {}) {
  return { 'content-type': 'application/json', origin: 'http://127.0.0.1', ...extra }
}

async function selectProject(baseUrl: string, projectId = 'project-1'): Promise<void> {
  const response = await fetch(`${baseUrl}/api/industry/v1/context/project`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ projectId }),
  })
  assert.equal(response.status, 200)
}

async function listMutations(baseUrl: string): Promise<readonly MutationOperation[]> {
  const response = await fetch(`${baseUrl}/api/industry/v1/mutations`, { headers: { origin: 'http://127.0.0.1' } })
  assert.equal(response.status, 200)
  return (await response.json() as { data: { operations: readonly MutationOperation[] } }).data.operations
}

function operationByKey(operations: readonly MutationOperation[], key: string): MutationOperation {
  const operation = operations.find((item) => item.operationId.includes(`-${key}-001`))
  assert.ok(operation)
  return operation
}

async function confirm(baseUrl: string, operation: MutationOperation, key: string, digest = operation.digest): Promise<Response> {
  return fetch(`${baseUrl}/api/industry/v1/mutations/${encodeURIComponent(operation.operationId)}/confirm`, {
    method: 'POST',
    headers: headers({ 'idempotency-key': key }),
    body: JSON.stringify({ digest, explicitConfirmation: true }),
  })
}

test('mutation center requires trusted project scope and never exposes approval material', async () => {
  await withServer(makeRouter(), async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/api/industry/v1/mutations`, { headers: { origin: 'http://127.0.0.1' } })
    assert.equal(missing.status, 409)
    assert.equal((await missing.json() as { error: { code: string } }).error.code, 'INDUSTRY_PROJECT_REQUIRED')

    await selectProject(baseUrl)
    const operations = await listMutations(baseUrl)
    assert.equal(operations.length, 3)
    assert.ok(operations.every((operation) => operation.projectId === 'project-1'))
    const serialized = JSON.stringify(operations).toLowerCase()
    assert.equal(serialized.includes('approvaltoken'), false)
    assert.equal(serialized.includes('approval_token'), false)
  })
})

test('confirm rejects scope/token injection and requires Idempotency-Key', async () => {
  await withServer(makeRouter(), async (baseUrl) => {
    await selectProject(baseUrl)
    const operation = operationByKey(await listMutations(baseUrl), 'safe')
    const path = `${baseUrl}/api/industry/v1/mutations/${encodeURIComponent(operation.operationId)}/confirm`

    const injected = await fetch(path, {
      method: 'POST',
      headers: headers({ 'idempotency-key': 'key-injected' }),
      body: JSON.stringify({
        digest: operation.digest,
        explicitConfirmation: true,
        projectId: 'attacker-project',
        approvalToken: 'attacker-token',
      }),
    })
    assert.equal(injected.status, 400)

    const missingKey = await fetch(path, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ digest: operation.digest, explicitConfirmation: true }),
    })
    assert.equal(missingKey.status, 400)
    assert.equal((await missingKey.json() as { error: { code: string } }).error.code, 'IDEMPOTENCY_KEY_REQUIRED')
  })
})

test('safe confirm is idempotent for the same key and blocks approval replay with a new key', async () => {
  await withServer(makeRouter(), async (baseUrl) => {
    await selectProject(baseUrl)
    const operation = operationByKey(await listMutations(baseUrl), 'safe')

    const first = await confirm(baseUrl, operation, 'confirm-safe-1')
    assert.equal(first.status, 200)
    const committed = (await first.json() as { data: MutationOperation }).data
    assert.equal(committed.status, 'COMMITTED')
    assert.equal(committed.safeToRetryCommit, false)

    const replaySameRequest = await confirm(baseUrl, operation, 'confirm-safe-1')
    assert.equal(replaySameRequest.status, 200)
    assert.equal((await replaySameRequest.json() as { data: MutationOperation }).data.status, 'COMMITTED')

    const replayNewKey = await confirm(baseUrl, operation, 'confirm-safe-2')
    assert.equal(replayNewKey.status, 409)
    assert.equal((await replayNewKey.json() as { error: { code: string } }).error.code, 'APPROVAL_REPLAY')

    const auditResponse = await fetch(`${baseUrl}/api/industry/v1/mutations/${encodeURIComponent(operation.operationId)}/audit`)
    const audit = (await auditResponse.json() as { data: MutationAuditTrail }).data
    assert.equal(audit.events.filter((event) => event.type === 'COMMIT_SUCCEEDED').length, 1)
    assert.equal(audit.events.filter((event) => event.type === 'APPROVAL_REPLAY_BLOCKED').length, 1)
    assert.equal(JSON.stringify(audit).toLowerCase().includes('approvaltoken'), false)
  })
})

test('digest mismatch and version conflict fail before commit', async () => {
  await withServer(makeRouter(), async (baseUrl) => {
    await selectProject(baseUrl)
    const operations = await listMutations(baseUrl)
    const safe = operationByKey(operations, 'safe')
    const conflict = operationByKey(operations, 'version-conflict')

    const wrongDigest = `sha256:${'0'.repeat(64)}`
    const mismatch = await confirm(baseUrl, safe, 'digest-mismatch', wrongDigest)
    assert.equal(mismatch.status, 409)
    assert.equal((await mismatch.json() as { error: { code: string } }).error.code, 'DIGEST_MISMATCH')

    const conflictResponse = await confirm(baseUrl, conflict, 'version-conflict')
    assert.equal(conflictResponse.status, 409)
    assert.equal((await conflictResponse.json() as { error: { code: string } }).error.code, 'VERSION_CONFLICT')

    const detail = await fetch(`${baseUrl}/api/industry/v1/mutations/${encodeURIComponent(conflict.operationId)}`)
    assert.equal((await detail.json() as { data: MutationOperation }).data.status, 'PENDING_CONFIRMATION')
  })
})

test('finalization failure enters reconciliation and never retries commit', async () => {
  await withServer(makeRouter(), async (baseUrl) => {
    await selectProject(baseUrl)
    const operation = operationByKey(await listMutations(baseUrl), 'finalization')

    const failed = await confirm(baseUrl, operation, 'finalization-key')
    assert.equal(failed.status, 500)
    assert.equal((await failed.json() as { error: { code: string } }).error.code, 'MUTATION_COMMIT_FINALIZATION_FAILED')

    const detailResponse = await fetch(`${baseUrl}/api/industry/v1/mutations/${encodeURIComponent(operation.operationId)}`)
    const detail = (await detailResponse.json() as { data: MutationOperation }).data
    assert.equal(detail.status, 'RECONCILIATION_REQUIRED')
    assert.equal(detail.safeToRetryCommit, false)

    const reconciliationResponse = await fetch(`${baseUrl}/api/industry/v1/mutations/reconciliation`)
    const reconciliation = (await reconciliationResponse.json() as { data: MutationReconciliationList }).data
    assert.equal(reconciliation.items.length, 1)
    assert.equal(reconciliation.items[0]?.operationId, operation.operationId)
    assert.equal(reconciliation.items[0]?.businessWriteMayHaveSucceeded, true)
    assert.equal(reconciliation.items[0]?.automaticRetryForbidden, true)

    const sameRequestAgain = await confirm(baseUrl, operation, 'finalization-key')
    assert.equal(sameRequestAgain.status, 500)
    assert.equal((await sameRequestAgain.json() as { error: { code: string } }).error.code, 'MUTATION_COMMIT_FINALIZATION_FAILED')

    const unsafeNewAttempt = await confirm(baseUrl, operation, 'finalization-new-key')
    assert.equal(unsafeNewAttempt.status, 409)
    assert.equal((await unsafeNewAttempt.json() as { error: { code: string } }).error.code, 'MUTATION_UNSAFE_RETRY_FORBIDDEN')

    const auditResponse = await fetch(`${baseUrl}/api/industry/v1/mutations/${encodeURIComponent(operation.operationId)}/audit`)
    const audit = (await auditResponse.json() as { data: MutationAuditTrail }).data
    assert.equal(audit.events.filter((event) => event.type === 'COMMIT_FINALIZATION_FAILED').length, 1)
  })
})

test('reject is terminal and another project cannot read the operation', async () => {
  const client = new MockIndustryAgentClient([])
  const projectOne: TrustedRequestContext = {
    requestId: 'request-1', userId: 'user-1', tenantId: 'tenant-1', companyId: 'company-1', projectId: 'project-1',
    roles: [], permissions: [], sessionId: 'session-1',
  }
  const projectTwo: TrustedRequestContext = { ...projectOne, projectId: 'project-2' }
  const operation = operationByKey(await client.listMutations(projectOne), 'safe')
  const rejected = await client.rejectMutation(projectOne, operation.operationId, { reason: '用户取消' }, 'request-reject')
  assert.equal(rejected.status, 'REJECTED')
  await assert.rejects(
    client.confirmMutation(projectOne, operation.operationId, { digest: operation.digest, explicitConfirmation: true }, 'after-reject', 'request-confirm'),
    hasCode('MUTATION_INVALID_STATE'),
  )
  await assert.rejects(client.getMutation(projectTwo, operation.operationId), hasCode('MUTATION_NOT_FOUND'))
})

function hasCode(code: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof Error && 'code' in error && error.code === code
}
