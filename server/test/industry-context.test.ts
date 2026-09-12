import assert from 'node:assert/strict'
import test from 'node:test'
import type { AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextError, IndustryContextService } from '../src/industry/context'

const principal: AuthPrincipal = {
  subject: 'subject-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  companyIds: ['company-1'],
  roles: ['project-user'],
  permissions: ['industry.read'],
  sessionId: 'session-1',
}

test('server context only exposes projects authorized by principal company membership', async () => {
  const client = new MockIndustryAgentClient([
    { tenantId: 'tenant-1', projectId: 'project-1', companyId: 'company-1', name: 'Allowed' },
    { tenantId: 'tenant-1', projectId: 'project-2', companyId: 'company-2', name: 'Denied' },
    { tenantId: 'tenant-2', projectId: 'project-3', companyId: 'company-1', name: 'Wrong tenant' },
  ])
  const service = new IndustryContextService(client)

  const initial = await service.getContext(principal, 'request-1')
  assert.equal(initial.view.projectId, null)
  assert.equal(initial.view.tenantId, 'tenant-1')
  assert.equal('roles' in initial.view, false)
  assert.equal('permissions' in initial.view, false)
  assert.deepEqual(initial.authorizedProjects.map((item) => item.projectId), ['project-1'])

  const selected = await service.selectProject(principal, 'request-2', 'project-1')
  assert.equal(selected.view.projectId, 'project-1')
  assert.equal(selected.view.companyId, 'company-1')

  const carried = await service.getContext(principal, 'request-3')
  assert.equal(carried.view.projectId, 'project-1')
})

test('rejects unauthorized project selection', async () => {
  const service = new IndustryContextService(new MockIndustryAgentClient([
    { tenantId: 'tenant-1', projectId: 'project-2', companyId: 'company-2', name: 'Denied' },
  ]))

  await assert.rejects(
    () => service.selectProject(principal, 'request-4', 'project-2'),
    (error: unknown) => error instanceof IndustryContextError && error.code === 'INDUSTRY_PROJECT_ACCESS_DENIED',
  )
})
