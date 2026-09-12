export const INDUSTRY_API_VERSION = 'industry-api-v1' as const
export const INDUSTRY_EVENT_VERSION = 'industry-event-v1' as const
export const UI_ACTION_VERSION = 'ui-action-v1' as const

export type PiWebMode = 'local' | 'control-plane'

export interface SecretRef {
  configured: boolean
  source: 'env' | 'vault' | 'secret-manager' | 'local-file'
  reference?: string
  lastUpdatedAt?: string
}

export interface IndustryApiError {
  requestId: string
  traceId?: string
  code: string
  message: string
  retryable: boolean
  resolution?: {
    type: 'refresh' | 'reauth' | 'reselect_project' | 'open_reconciliation' | 'contact_admin'
  }
}

export interface AuthorizedProject {
  projectId: string
  companyId: string
  name: string
}

export interface IndustryRequestContextView {
  requestId: string
  userId: string
  tenantId: string
  companyId: string | null
  projectId: string | null
}
