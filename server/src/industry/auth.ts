import type { IncomingMessage } from 'node:http'
import type { PiWebMode } from '../../../shared/industry/common'

export interface AuthPrincipal {
  subject: string
  userId: string
  tenantId: string
  companyIds: readonly string[]
  roles: readonly string[]
  permissions: readonly string[]
  sessionId: string
}

export interface PrincipalProvider {
  getPrincipal(request: IncomingMessage): Promise<AuthPrincipal>
}

export class MockPrincipalProvider implements PrincipalProvider {
  readonly #principal: AuthPrincipal

  constructor(principal: AuthPrincipal) {
    this.#principal = validatePrincipal(principal)
  }

  async getPrincipal(_request: IncomingMessage): Promise<AuthPrincipal> {
    return structuredClone(this.#principal)
  }
}

/**
 * The current control-plane PrincipalProvider is deterministic/mock-backed and
 * must never be mistaken for production authentication. Require an explicit
 * development opt-in so PI_WEB_MODE=control-plane fails closed by default until
 * a real OIDC/SSO or trusted-upstream PrincipalProvider is wired in.
 */
export function assertMockControlPlaneEnabled(mode: PiWebMode, raw: string | undefined): void {
  if (mode !== 'control-plane') return
  if (raw === '1') return
  throw new Error(
    'PI_WEB_MODE=control-plane currently uses mock authentication and is disabled by default; '
      + 'set PI_WEB_ALLOW_MOCK_CONTROL_PLANE=1 only for trusted development/test environments',
  )
}

export function parseMockPrincipal(raw: string | undefined): AuthPrincipal {
  if (raw === undefined || raw.trim() === '') {
    throw new Error('PI_WEB_MOCK_PRINCIPAL_JSON is required in control-plane mode')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('PI_WEB_MOCK_PRINCIPAL_JSON must be valid JSON')
  }
  return validatePrincipal(parsed)
}

export function validatePrincipal(input: unknown): AuthPrincipal {
  if (!isRecord(input)) throw new Error('principal must be an object')
  return {
    subject: requireString(input.subject, 'subject'),
    userId: requireString(input.userId, 'userId'),
    tenantId: requireString(input.tenantId, 'tenantId'),
    companyIds: requireStringArray(input.companyIds, 'companyIds'),
    roles: requireStringArray(input.roles, 'roles'),
    permissions: requireStringArray(input.permissions, 'permissions'),
    sessionId: requireString(input.sessionId, 'sessionId'),
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`principal.${field} must be a non-empty string`)
  return value
}

function requireStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`principal.${field} must be an array of non-empty strings`)
  }
  return [...value]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
