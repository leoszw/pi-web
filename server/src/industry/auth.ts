import type { IncomingMessage } from 'node:http'

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
  const permissions = requireStringArray(input.permissions, 'permissions')
  // Backward-compatible alias for pre-hardening fixtures/config. New control-plane
  // principals should grant industry.workspace explicitly.
  if (permissions.includes('industry.read') && !permissions.includes('industry.workspace')) permissions.push('industry.workspace')
  return {
    subject: requireString(input.subject, 'subject'),
    userId: requireString(input.userId, 'userId'),
    tenantId: requireString(input.tenantId, 'tenantId'),
    companyIds: requireStringArray(input.companyIds, 'companyIds'),
    roles: requireStringArray(input.roles, 'roles'),
    permissions,
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
