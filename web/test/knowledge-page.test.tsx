import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { KnowledgeIngestionStatus, KnowledgeUploadRequest } from '../../shared/industry/knowledge'
import { KnowledgePageView, type KnowledgeSnapshot } from '../src/features/knowledge/KnowledgePage'

const document = {
  documentId: 'knowledge-project-1-spec-001', fileName: '路基工程技术规范.pdf', mimeType: 'application/pdf', sizeBytes: 204800,
  industry: 'ENGINEERING_CONSTRUCTION', companyId: 'company-1', projectId: 'project-1', department: '工程部',
  acl: { visibility: 'PROJECT' as const, aclUsers: [], aclRoles: [], securityTags: ['TECHNICAL'] },
  sourceVersion: 'source-v1', ingestionId: 'ingestion-project-1-spec-001', ingestionStatus: 'READY' as const,
  chunkCount: 1, createdAt: '2026-09-13T07:00:00.000Z', updatedAt: '2026-09-13T07:00:00.000Z',
}

const pipeline: readonly KnowledgeIngestionStatus[] = [
  'RECEIVED', 'VALIDATING', 'STORED', 'PARSING', 'EXTRACTING', 'CHUNKING', 'ENRICHING', 'EMBEDDING', 'INDEXING', 'QUALITY_VALIDATING', 'READY',
]

const snapshot: KnowledgeSnapshot = {
  options: {
    industries: ['ENGINEERING_CONSTRUCTION'], companies: [{ companyId: 'company-1', label: 'Company One' }],
    projects: [{ projectId: 'project-1', label: 'Project One' }], departments: ['工程部'], visibilities: ['PROJECT', 'RESTRICTED'],
    users: [{ userId: 'user-1', label: 'user-1' }], roles: ['project-user'], securityTags: ['GENERAL', 'TECHNICAL'],
  },
  documents: [document], selectedDocument: document,
  chunks: [{ chunkId: `${document.documentId}:chunk-1`, documentId: document.documentId, ordinal: 1, text: '路基填筑应分层施工。', parentContext: '路基工程技术规范.pdf > 路基填筑', page: 12, section: '路基填筑', sourceVersion: 'source-v1', projectId: 'project-1', securityTags: ['TECHNICAL'] }],
  ingestion: {
    ingestionId: document.ingestionId, documentId: document.documentId, projectId: 'project-1', status: 'READY', sourceVersion: 'source-v1',
    startedAt: '2026-09-13T07:00:00.000Z', completedAt: '2026-09-13T07:00:00.250Z',
    steps: pipeline.map((status, index) => ({ status, timestamp: `2026-09-13T07:00:00.${String(index).padStart(3,'0')}Z`, detail: `mock ${status}` })),
  },
}

const form: KnowledgeUploadRequest = {
  fileName: '新文档.pdf', mimeType: 'application/pdf', sizeBytes: 1024, industry: 'ENGINEERING_CONSTRUCTION',
  companyId: 'company-1', projectId: 'project-1', department: '工程部', visibility: 'PROJECT',
  aclUsers: [], aclRoles: [], securityTags: ['GENERAL'],
}

describe('KnowledgePageView', () => {
  it('renders server-issued scope options, metadata-only picker, ingestion pipeline, chunk context and source version', () => {
    const html = renderToStaticMarkup(<KnowledgePageView snapshot={snapshot} form={form} busy={false} error={null} />)
    expect(html).toContain('知识库 / RAG')
    expect(html).toContain('本地文件(仅元数据)')
    expect(html).toContain('type="file"')
    expect(html).toContain('文件字节不会上传或存储')
    expect(html).toContain('project-1')
    expect(html).toContain('project-user')
    expect(html).toContain('QUALITY_VALIDATING')
    expect(html).toContain('READY')
    expect(html).toContain('路基工程技术规范.pdf &gt; 路基填筑')
    expect(html).toContain('source-v1')
    expect(html).toContain('页12')
  })

  it('does not invent unauthorized project company role or user choices', () => {
    const html = renderToStaticMarkup(<KnowledgePageView snapshot={snapshot} form={form} busy={false} error={null} />)
    expect(html).not.toContain('project-2')
    expect(html).not.toContain('company-2')
    expect(html).not.toContain('admin-role')
    expect(html).not.toContain('user-2')
  })
})