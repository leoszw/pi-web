import type { AuthorizedProject, IndustryRequestContextView } from '../../../shared/industry/common'
import type { AuthPrincipal } from './auth'
import type { IndustryAgentClient } from './clients/industry-agent-client'

export interface TrustedRequestContext {
  requestId: string
  userId: string
  tenantId: string
  companyId: string | null
  projectId: string | null
  roles: readonly string[]
  permissions: readonly string[]
  sessionId: string
}

export interface ResolvedIndustryContext {
  trusted: TrustedRequestContext
  view: IndustryRequestContextView
  authorizedProjects: readonly AuthorizedProject[]
}

export class IndustryContextService {
  readonly #client: IndustryAgentClient
  readonly #selectedProjectBySession = new Map<string, string>()

  constructor(client: IndustryAgentClient) {
    this.#client = client
  }

  async getContext(principal: AuthPrincipal, requestId: string): Promise<ResolvedIndustryContext> {
    const projects = await this.#client.listAuthorizedProjects(principal)
    const scopeKey = selectionKey(principal)
    const selected = this.#selectedProjectBySession.get(scopeKey)
    const project = selected === undefined ? undefined : projects.find((item) => item.projectId === selected)
    if (selected !== undefined && project === undefined) this.#selectedProjectBySession.delete(scopeKey)
    return buildResolved(principal, requestId, project, projects)
  }

  async selectProject(
    principal: AuthPrincipal,
    requestId: string,
    projectId: string | null,
  ): Promise<ResolvedIndustryContext> {
    const projects = await this.#client.listAuthorizedProjects(principal)
    if (projectId === null) {
      this.#selectedProjectBySession.delete(selectionKey(principal))
      return buildResolved(principal, requestId, undefined, projects)
    }
    const project = projects.find((item) => item.projectId === projectId)
    if (project === undefined) {
      throw new IndustryContextError('INDUSTRY_PROJECT_ACCESS_DENIED', 'project is not authorized for this principal', 403)
    }
    this.#selectedProjectBySession.set(selectionKey(principal), project.projectId)
    return buildResolved(principal, requestId, project, projects)
  }
}

export class IndustryContextError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(code: string, message: string, statusCode: number) {
    super(message)
    this.name = 'IndustryContextError'
    this.code = code
    this.statusCode = statusCode
  }
}

function buildResolved(
  principal: AuthPrincipal,
  requestId: string,
  project: AuthorizedProject | undefined,
  projects: readonly AuthorizedProject[],
): ResolvedIndustryContext {
  const trusted: TrustedRequestContext = {
    requestId,
    userId: principal.userId,
    tenantId: principal.tenantId,
    companyId: project?.companyId ?? null,
    projectId: project?.projectId ?? null,
    roles: [...principal.roles],
    permissions: [...principal.permissions],
    sessionId: principal.sessionId,
  }
  return {
    trusted,
    view: {
      requestId,
      userId: trusted.userId,
      tenantId: trusted.tenantId,
      companyId: trusted.companyId,
      projectId: trusted.projectId,
    },
    authorizedProjects: projects.map((item) => ({ ...item })),
  }
}

function selectionKey(principal: AuthPrincipal): string {
  return `${principal.tenantId}\u0000${principal.userId}\u0000${principal.sessionId}`
}
