import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertMockControlPlaneEnabled,
  MockPrincipalProvider,
  parseMockPrincipal,
  validatePrincipal,
} from '../src/industry/auth'

const principal = {
  subject: 'subject-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  companyIds: ['company-1'],
  roles: ['user'],
  permissions: ['industry.read'],
  sessionId: 'session-1',
}

test('validates and clones mock principal data', async () => {
  const validated = validatePrincipal(principal)
  assert.deepEqual(validated, principal)

  const provider = new MockPrincipalProvider(validated)
  const first = await provider.getPrincipal({} as never)
  const second = await provider.getPrincipal({} as never)
  assert.deepEqual(first, principal)
  assert.notEqual(first.companyIds, second.companyIds)
})

test('control-plane mock principal configuration fails closed', () => {
  assert.throws(() => parseMockPrincipal(undefined), /required/)
  assert.throws(() => parseMockPrincipal('{'), /valid JSON/)
  assert.throws(
    () => validatePrincipal({ ...principal, tenantId: '' }),
    /tenantId must be a non-empty string/,
  )
})

test('mock control-plane authentication requires explicit development opt-in', () => {
  assert.doesNotThrow(() => assertMockControlPlaneEnabled('local', undefined))
  assert.throws(
    () => assertMockControlPlaneEnabled('control-plane', undefined),
    /PI_WEB_ALLOW_MOCK_CONTROL_PLANE=1/,
  )
  assert.throws(
    () => assertMockControlPlaneEnabled('control-plane', 'true'),
    /PI_WEB_ALLOW_MOCK_CONTROL_PLANE=1/,
  )
  assert.doesNotThrow(() => assertMockControlPlaneEnabled('control-plane', '1'))
})
