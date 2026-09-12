import type { AuthorizedProject } from '../../../../shared/industry/common'
import type { AuthPrincipal } from '../auth'
import type { TrustedRequestContext } from '../context'
import type { IndustryAgentClient, IndustryAgentHealth } from './industry-agent-client'

export interface MockAuthorizedProject extends AuthorizedProject {
  tenantId: string
}

export class MockIndustryAgentClient implements IndustryAgentClient {
  readonly #projects: readonly MockAuthorizedProject[]

  constructor(projects: readonly MockAuthorizedProject[]) {
    this.#projects = projects.map((project) => ({ ...project }))
  }

  async getHealth(_context: TrustedRequestContext): Promise<IndustryAgentHealth> {
    return { status: 'ok', adapter: 'mock' }
  }

  async listAuthorizedProjects(principal: AuthPrincipal): Promise<readonly AuthorizedProject[]> {
    return this.#projects
      .filter((project) => project.tenantId === principal.tenantId && principal.companyIds.includes(project.companyId))
      .map(({ projectId, companyId, name }) => ({ projectId, companyId, name }))
  }
}

export function parseMockProjects(raw: string | undefined): readonly MockAuthorizedProject[] {
  if (raw === undefined || raw.trim() === '') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('PI_WEB_MOCK_PROJECTS_JSON must be valid JSON')
  }
  if (!Array.isArray(parsed)) throw new Error('PI_WEB_MOCK_PROJECTS_JSON must be an array')
  return parsed.map((value, index) => parseProject(value, index))
}

function parseProject(value: unknown, index: number): MockAuthorizedProject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`mock project ${index} must be an object`)
  }
  const record = value as Record<string, unknown>
  return {
    tenantId: requireString(record.tenantId, index, 'tenantId'),
    projectId: requireString(record.projectId, index, 'projectId'),
    companyId: requireString(record.companyId, index, 'companyId'),
    name: requireString(record.name, index, 'name'),
  }
}

function requireString(value: unknown, index: number, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`mock project ${index}.${field} must be a non-empty string`)
  }
  return value
}
