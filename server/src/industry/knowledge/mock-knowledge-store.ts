import { randomUUID } from 'node:crypto'
import type {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeIngestion,
  KnowledgeIngestionStatus,
  KnowledgeUploadOptions,
  KnowledgeUploadRequest,
  KnowledgeVisibility,
} from '../../../../shared/industry/knowledge'
import { IndustryAgentClientError } from '../clients/industry-agent-client'
import type { TrustedRequestContext } from '../context'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const INGESTION_PIPELINE: readonly KnowledgeIngestionStatus[] = [
  'RECEIVED', 'VALIDATING', 'STORED', 'PARSING', 'EXTRACTING', 'CHUNKING',
  'ENRICHING', 'EMBEDDING', 'INDEXING', 'QUALITY_VALIDATING', 'READY',
]

interface StoredDocument {
  document: KnowledgeDocument
  chunks: readonly KnowledgeChunk[]
}

export class MockKnowledgeStore {
  readonly #documents = new Map<string, Map<string, StoredDocument>>()
  readonly #ingestions = new Map<string, Map<string, KnowledgeIngestion>>()

  options(context: TrustedRequestContext): KnowledgeUploadOptions {
    const projectId = requireProject(context)
    const companyId = requireCompany(context)
    return {
      industries: ['ENGINEERING_CONSTRUCTION'],
      companies: [{ companyId, label: `Company ${companyId}` }],
      projects: [{ projectId, label: `Project ${projectId}` }],
      departments: ['工程部', '合约部', '质量部', '安全部'],
      visibilities: ['PROJECT', 'COMPANY', 'RESTRICTED'],
      users: [{ userId: context.userId, label: context.userId }],
      roles: [...new Set(context.roles)],
      securityTags: ['GENERAL', 'CONTRACT', 'TECHNICAL', 'QUALITY', 'SAFETY'],
    }
  }

  list(context: TrustedRequestContext): readonly KnowledgeDocument[] {
    const projectId = requireProject(context)
    const companyId = requireCompany(context)
    return [...this.#projectDocuments(projectId, companyId).values()]
      .filter((item) => canRead(item.document, context))
      .map((item) => structuredClone(item.document))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  get(context: TrustedRequestContext, documentId: string): KnowledgeDocument {
    return structuredClone(this.#requireReadableDocument(context, documentId).document)
  }

  chunks(context: TrustedRequestContext, documentId: string): readonly KnowledgeChunk[] {
    return structuredClone(this.#requireReadableDocument(context, documentId).chunks)
  }

  ingestion(context: TrustedRequestContext, ingestionId: string): KnowledgeIngestion {
    const projectId = requireProject(context)
    const ingestion = this.#projectIngestions(projectId).get(ingestionId)
    if (ingestion === undefined) throw new IndustryAgentClientError('KNOWLEDGE_INGESTION_NOT_FOUND', 'knowledge ingestion not found', 404)
    this.#requireReadableDocument(context, ingestion.documentId)
    return structuredClone(ingestion)
  }

  upload(context: TrustedRequestContext, request: KnowledgeUploadRequest): KnowledgeDocument {
    const projectId = requireProject(context)
    this.#validateUpload(context, request)
    const now = new Date().toISOString()
    const documentId = `knowledge-${randomUUID()}`
    const ingestionId = `ingestion-${randomUUID()}`
    const sourceVersion = 'source-v1'
    const chunks = chunksFor(documentId, projectId, sourceVersion, request.fileName, request.securityTags)
    const ingestion = buildReadyIngestion(ingestionId, documentId, projectId, sourceVersion, now)
    const document: KnowledgeDocument = {
      documentId,
      fileName: request.fileName,
      mimeType: request.mimeType,
      sizeBytes: request.sizeBytes,
      industry: request.industry,
      companyId: request.companyId,
      projectId: request.projectId,
      department: request.department,
      acl: {
        visibility: request.visibility,
        aclUsers: unique(request.aclUsers),
        aclRoles: unique(request.aclRoles),
        securityTags: unique(request.securityTags),
      },
      sourceVersion,
      ingestionId,
      ingestionStatus: 'READY',
      chunkCount: chunks.length,
      createdAt: now,
      updatedAt: now,
    }
    this.#projectDocuments(projectId, request.companyId).set(documentId, { document, chunks })
    this.#projectIngestions(projectId).set(ingestionId, ingestion)
    return structuredClone(document)
  }

  reingest(context: TrustedRequestContext, documentId: string): KnowledgeDocument {
    const stored = this.#requireReadableDocument(context, documentId)
    const projectId = requireProject(context)
    const nextVersion = incrementVersion(stored.document.sourceVersion)
    const now = new Date().toISOString()
    const ingestionId = `ingestion-${randomUUID()}`
    const chunks = chunksFor(
      stored.document.documentId,
      projectId,
      nextVersion,
      stored.document.fileName,
      stored.document.acl.securityTags,
    )
    const ingestion = buildReadyIngestion(ingestionId, documentId, projectId, nextVersion, now)
    stored.document = {
      ...stored.document,
      sourceVersion: nextVersion,
      ingestionId,
      ingestionStatus: 'READY',
      chunkCount: chunks.length,
      updatedAt: now,
    }
    stored.chunks = chunks
    this.#projectIngestions(projectId).set(ingestionId, ingestion)
    return structuredClone(stored.document)
  }

  #projectDocuments(projectId: string, companyId: string): Map<string, StoredDocument> {
    let store = this.#documents.get(projectId)
    if (store === undefined) {
      store = seedDocuments(projectId, companyId)
      this.#documents.set(projectId, store)
      const ingestions = this.#projectIngestions(projectId)
      for (const item of store.values()) {
        ingestions.set(item.document.ingestionId, buildReadyIngestion(
          item.document.ingestionId,
          item.document.documentId,
          projectId,
          item.document.sourceVersion,
          item.document.createdAt,
        ))
      }
    }
    return store
  }

  #projectIngestions(projectId: string): Map<string, KnowledgeIngestion> {
    let store = this.#ingestions.get(projectId)
    if (store === undefined) {
      store = new Map()
      this.#ingestions.set(projectId, store)
    }
    return store
  }

  #requireReadableDocument(context: TrustedRequestContext, documentId: string): StoredDocument {
    const projectId = requireProject(context)
    const companyId = requireCompany(context)
    const stored = this.#projectDocuments(projectId, companyId).get(documentId)
    if (stored === undefined || !canRead(stored.document, context)) {
      throw new IndustryAgentClientError('KNOWLEDGE_DOCUMENT_NOT_FOUND', 'knowledge document not found', 404)
    }
    return stored
  }

  #validateUpload(context: TrustedRequestContext, request: KnowledgeUploadRequest): void {
    const options = this.options(context)
    if (request.sizeBytes <= 0 || request.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new IndustryAgentClientError('KNOWLEDGE_UPLOAD_SIZE_INVALID', `mock upload size must be between 1 and ${MAX_UPLOAD_BYTES} bytes`, 413)
    }
    if (!['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(request.mimeType)) {
      throw new IndustryAgentClientError('KNOWLEDGE_MIME_NOT_ALLOWED', 'mock knowledge upload mime type is not allowed', 415)
    }
    if (!options.industries.includes(request.industry)
      || !options.companies.some((item) => item.companyId === request.companyId)
      || !options.projects.some((item) => item.projectId === request.projectId)
      || !options.departments.includes(request.department)
      || !options.visibilities.includes(request.visibility)
      || request.aclUsers.some((value) => !options.users.some((item) => item.userId === value))
      || request.aclRoles.some((value) => !options.roles.includes(value))
      || request.securityTags.some((value) => !options.securityTags.includes(value))) {
      throw new IndustryAgentClientError('KNOWLEDGE_SCOPE_NOT_ALLOWED', 'knowledge scope or ACL value is outside the server-authorized options', 403)
    }
    if (request.visibility === 'RESTRICTED' && request.aclUsers.length === 0 && request.aclRoles.length === 0) {
      throw new IndustryAgentClientError('KNOWLEDGE_ACL_REQUIRED', 'restricted knowledge requires at least one authorized user or role', 400)
    }
  }
}

function seedDocuments(projectId: string, companyId: string): Map<string, StoredDocument> {
  const createdAt = '2026-09-13T07:00:00.000Z'
  const rows: StoredDocument[] = [
    seedDocument(projectId, companyId, 'spec-001', '路基工程技术规范.pdf', '工程部', 'PROJECT', [], [], ['TECHNICAL'], createdAt),
    seedDocument(projectId, companyId, 'contract-001', '合同技术条款.pdf', '合约部', 'RESTRICTED', [], ['project-user'], ['CONTRACT'], '2026-09-13T06:55:00.000Z'),
  ]
  return new Map(rows.map((item) => [item.document.documentId, item]))
}

function seedDocument(
  projectId: string,
  companyId: string,
  idSuffix: string,
  fileName: string,
  department: string,
  visibility: KnowledgeVisibility,
  aclUsers: readonly string[],
  aclRoles: readonly string[],
  securityTags: readonly string[],
  createdAt: string,
): StoredDocument {
  const documentId = `knowledge-${safeId(projectId)}-${idSuffix}`
  const sourceVersion = 'source-v1'
  const chunks = chunksFor(documentId, projectId, sourceVersion, fileName, securityTags)
  return {
    document: {
      documentId,
      fileName,
      mimeType: 'application/pdf',
      sizeBytes: 204800,
      industry: 'ENGINEERING_CONSTRUCTION',
      companyId,
      projectId,
      department,
      acl: { visibility, aclUsers, aclRoles, securityTags },
      sourceVersion,
      ingestionId: `ingestion-${safeId(projectId)}-${idSuffix}`,
      ingestionStatus: 'READY',
      chunkCount: chunks.length,
      createdAt,
      updatedAt: createdAt,
    },
    chunks,
  }
}

function chunksFor(
  documentId: string,
  projectId: string,
  sourceVersion: string,
  fileName: string,
  securityTags: readonly string[],
): readonly KnowledgeChunk[] {
  const isContract = fileName.includes('合同')
  const rows = isContract
    ? [
        ['压实度要求', '路基填筑压实度检测频率与验收标准按合同技术条款执行。', 18],
        ['沉降观测', '高填方及软土地基应按规定设置沉降观测点并记录稳定趋势。', 22],
      ] as const
    : [
        ['路基填筑', '路基填筑应分层施工，分层厚度、含水率和压实度应满足技术规范。', 12],
        ['质量验收', '每一填筑层完成后应进行压实度检测，合格后方可进入下一层。', 13],
      ] as const
  return rows.map(([section, text, page], index) => ({
    chunkId: `${documentId}:chunk-${index + 1}`,
    documentId,
    ordinal: index + 1,
    text,
    parentContext: `${fileName} > ${section}`,
    page,
    section,
    sourceVersion,
    projectId,
    securityTags: [...securityTags],
  }))
}

function buildReadyIngestion(
  ingestionId: string,
  documentId: string,
  projectId: string,
  sourceVersion: string,
  startedAt: string,
): KnowledgeIngestion {
  const base = Date.parse(startedAt)
  const steps = INGESTION_PIPELINE.map((status, index) => ({
    status,
    timestamp: new Date(base + index * 25).toISOString(),
    detail: status === 'READY' ? 'mock ingestion is ready for deterministic retrieval' : `mock ${status.toLowerCase()} completed`,
  }))
  return {
    ingestionId,
    documentId,
    projectId,
    status: 'READY',
    sourceVersion,
    steps,
    startedAt,
    completedAt: steps.at(-1)?.timestamp,
  }
}

function canRead(document: KnowledgeDocument, context: TrustedRequestContext): boolean {
  if (document.projectId !== context.projectId) return false
  if (document.companyId !== context.companyId) return false
  if (document.acl.visibility !== 'RESTRICTED') return true
  return document.acl.aclUsers.includes(context.userId)
    || document.acl.aclRoles.some((role) => context.roles.includes(role))
}

function requireProject(context: TrustedRequestContext): string {
  if (context.projectId === null) throw new IndustryAgentClientError('INDUSTRY_PROJECT_REQUIRED', 'active project is required', 409)
  return context.projectId
}

function requireCompany(context: TrustedRequestContext): string {
  if (context.companyId === null) throw new IndustryAgentClientError('INDUSTRY_PROJECT_REQUIRED', 'active project company is required', 409)
  return context.companyId
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function incrementVersion(value: string): string {
  const match = value.match(/^source-v(\d+)$/u)
  return `source-v${match === null ? 2 : Number(match[1]) + 1}`
}

function safeId(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/gu, '-').slice(0, 48)
  return normalized === '' ? 'project' : normalized
}
