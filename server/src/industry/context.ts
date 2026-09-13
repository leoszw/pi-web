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

interface ProjectSelection {
  projectId: string
  lastAccessedAt: number
}

export class IndustryContextService {
  readonly #client: IndustryAgentClient
  readonly #selectedProjectBySession = new Map<string, ProjectSelection>()
  readonly #selectionTtlMs: number
  readonly #maxSelections: number

  constructor(client: IndustryAgentClient, options: { selectionTtlMs?: number; maxSelections?: number } = {}) {
    this.#client = client
    this.#selectionTtlMs = options.selectionTtlMs ?? 8 * 60 * 60 * 1000
    this.#maxSelections = options.maxSelections ?? 10_000
  }

  async getContext(principal: AuthPrincipal, requestId: string): Promise<ResolvedIndustryContext> {
    const now = Date.now()
    this.#pruneSelections(now)
    const projects = await this.#client.listAuthorizedProjects(principal)
    const scopeKey = selectionKey(principal)
    const selection = this.#selectedProjectBySession.get(scopeKey)
    const project = selection === undefined ? undefined : projects.find((item) => item.projectId === selection.projectId)
    if (selection !== undefined && project === undefined) this.#selectedProjectBySession.delete(scopeKey)
    else if (selection !== undefined) selection.lastAccessedAt = now
    return buildResolved(principal, requestId, project, projects)
  }

  async selectProject(
    principal: AuthPrincipal,
    requestId: string,
    projectId: string | null,
  ): Promise<ResolvedIndustryContext> {
    const now = Date.now()
    this.#pruneSelections(now)
    const projects = await this.#client.listAuthorizedProjects(principal)
    if (projectId === null) {
      this.#selectedProjectBySession.delete(selectionKey(principal))
      return buildResolved(principal, requestId, undefined, projects)
    }
    const project = projects.find((item) => item.projectId === projectId)
    if (project === undefined) {
      throw new IndustryContextError('INDUSTRY_PROJECT_ACCESS_DENIED', 'project is not authorized for this principal', 403)
    }
    this.#selectedProjectBySession.set(selectionKey(principal), { projectId: project.projectId, lastAccessedAt: now })
    this.#pruneSelections(now)
    return buildResolved(principal, requestId, project, projects)
  }

  #pruneSelections(now: number): void {
    for (const [key, selection] of this.#selectedProjectBySession) {
      if (now - selection.lastAccessedAt >= this.#selectionTtlMs) this.#selectedProjectBySession.delete(key)
    }
    if (this.#selectedProjectBySession.size <= this.#maxSelections) return
    const ordered = [...this.#selectedProjectBySession.entries()].sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt)
    for (let index = 0; index < ordered.length - this.#maxSelections; index += 1) {
      const entry = ordered[index]
      if (entry !== undefined) this.#selectedProjectBySession.delete(entry[0])
    }
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
