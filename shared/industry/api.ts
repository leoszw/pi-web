import type {
  AuthorizedProject,
  IndustryRequestContextView,
  SecretRef,
} from './common'

export interface IndustryHealthResponse {
  apiVersion: 'industry-api-v1'
  status: 'ok'
  mode: 'control-plane'
  adapter: 'mock'
  requestId: string
}

export interface IndustryContextResponse {
  apiVersion: 'industry-api-v1'
  context: IndustryRequestContextView
  authorizedProjects: readonly AuthorizedProject[]
}

export interface SelectIndustryProjectRequest {
  projectId: string | null
}

export interface RuntimeSecretStatus {
  name: string
  secret: SecretRef
}
