export const KNOWLEDGE_API_VERSION = 'knowledge-api-v1' as const

export type KnowledgeVisibility = 'PROJECT' | 'COMPANY' | 'RESTRICTED'

export type KnowledgeIngestionStatus =
  | 'RECEIVED'
  | 'VALIDATING'
  | 'STORED'
  | 'PARSING'
  | 'EXTRACTING'
  | 'CHUNKING'
  | 'ENRICHING'
  | 'EMBEDDING'
  | 'INDEXING'
  | 'QUALITY_VALIDATING'
  | 'READY'
  | 'FAILED'

export interface KnowledgeUploadOptions {
  industries: readonly string[]
  companies: readonly { companyId: string; label: string }[]
  projects: readonly { projectId: string; label: string }[]
  departments: readonly string[]
  visibilities: readonly KnowledgeVisibility[]
  users: readonly { userId: string; label: string }[]
  roles: readonly string[]
  securityTags: readonly string[]
}

export interface KnowledgeAcl {
  visibility: KnowledgeVisibility
  aclUsers: readonly string[]
  aclRoles: readonly string[]
  securityTags: readonly string[]
}

export interface KnowledgeDocument {
  documentId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  industry: string
  companyId: string
  projectId: string
  department: string
  acl: KnowledgeAcl
  sourceVersion: string
  ingestionId: string
  ingestionStatus: KnowledgeIngestionStatus
  chunkCount: number
  createdAt: string
  updatedAt: string
}

export interface KnowledgeUploadRequest {
  fileName: string
  mimeType: string
  sizeBytes: number
  industry: string
  companyId: string
  projectId: string
  department: string
  visibility: KnowledgeVisibility
  aclUsers: readonly string[]
  aclRoles: readonly string[]
  securityTags: readonly string[]
}

export interface KnowledgeChunk {
  chunkId: string
  documentId: string
  ordinal: number
  text: string
  parentContext: string
  page: number
  section: string
  sourceVersion: string
  projectId: string
  securityTags: readonly string[]
}

export interface KnowledgeIngestionStep {
  status: KnowledgeIngestionStatus
  timestamp: string
  detail: string
}

export interface KnowledgeIngestion {
  ingestionId: string
  documentId: string
  projectId: string
  status: KnowledgeIngestionStatus
  sourceVersion: string
  steps: readonly KnowledgeIngestionStep[]
  startedAt: string
  completedAt?: string
  failureCode?: string
  failureMessage?: string
}
