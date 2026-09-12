import type { AuthorizedProject } from '../../../../shared/industry/common'
import type { AuthPrincipal } from '../auth'
import type { TrustedRequestContext } from '../context'

export interface IndustryAgentHealth {
  status: 'ok'
  adapter: 'mock'
}

export interface IndustryAgentClient {
  getHealth(context: TrustedRequestContext): Promise<IndustryAgentHealth>
  listAuthorizedProjects(principal: AuthPrincipal): Promise<readonly AuthorizedProject[]>
}
