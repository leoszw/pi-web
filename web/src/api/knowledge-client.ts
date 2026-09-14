import type {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeIngestion,
  KnowledgeUploadOptions,
  KnowledgeUploadRequest,
} from '../../../shared/industry/knowledge'

interface KnowledgeEnvelope<T> {
  apiVersion: 'knowledge-api-v1'
  data: T
}

interface ApiErrorEnvelope {
  error: { requestId: string; code: string; message: string; retryable: boolean }
}

export interface KnowledgeApiClient {
  getUploadOptions(): Promise<KnowledgeUploadOptions>
  listDocuments(): Promise<readonly KnowledgeDocument[]>
  uploadDocument(request: KnowledgeUploadRequest): Promise<KnowledgeDocument>
  getDocument(documentId: string): Promise<KnowledgeDocument>
  reingestDocument(documentId: string): Promise<KnowledgeDocument>
  listChunks(documentId: string): Promise<readonly KnowledgeChunk[]>
  getIngestion(ingestionId: string): Promise<KnowledgeIngestion>
}

export class KnowledgeApiError extends Error {
  readonly code: string
  readonly requestId: string
  readonly retryable: boolean
  constructor(code: string, message: string, requestId: string, retryable: boolean) {
    super(message)
    this.name = 'KnowledgeApiError'
    this.code = code
    this.requestId = requestId
    this.retryable = retryable
  }
}

export function createKnowledgeApiClient(fetcher: typeof fetch = fetch): KnowledgeApiClient {
  return {
    getUploadOptions: () => request('/api/industry/v1/knowledge/options', { method: 'GET' }),
    listDocuments: () => request('/api/industry/v1/knowledge/documents', { method: 'GET' }),
    uploadDocument: (body) => request('/api/industry/v1/knowledge/uploads', jsonPost(body)),
    getDocument: (documentId) => request(`/api/industry/v1/knowledge/documents/${encodeURIComponent(documentId)}`, { method: 'GET' }),
    reingestDocument: (documentId) => request(`/api/industry/v1/knowledge/documents/${encodeURIComponent(documentId)}/reingest`, jsonPost({})),
    listChunks: (documentId) => request(`/api/industry/v1/knowledge/documents/${encodeURIComponent(documentId)}/chunks`, { method: 'GET' }),
    getIngestion: (ingestionId) => request(`/api/industry/v1/knowledge/ingestions/${encodeURIComponent(ingestionId)}`, { method: 'GET' }),
  }

  function jsonPost(body: unknown): RequestInit {
    return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
  }

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetcher(path, { ...init, credentials: 'same-origin' })
    const payload: unknown = await response.json()
    if (!response.ok) {
      if (isErrorEnvelope(payload)) throw new KnowledgeApiError(payload.error.code, payload.error.message, payload.error.requestId, payload.error.retryable)
      throw new KnowledgeApiError('KNOWLEDGE_API_ERROR', `request failed with status ${response.status}`, 'unknown', false)
    }
    if (!isEnvelope(payload)) throw new KnowledgeApiError('INVALID_API_RESPONSE', 'invalid knowledge API response', 'unknown', false)
    return payload.data as T
  }
}

function isEnvelope(value: unknown): value is KnowledgeEnvelope<unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (value as { apiVersion?: unknown }).apiVersion === 'knowledge-api-v1' && 'data' in value
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('error' in value)) return false
  const error = (value as { error?: unknown }).error
  return typeof error === 'object' && error !== null && !Array.isArray(error)
    && typeof (error as { requestId?: unknown }).requestId === 'string'
    && typeof (error as { code?: unknown }).code === 'string'
    && typeof (error as { message?: unknown }).message === 'string'
    && typeof (error as { retryable?: unknown }).retryable === 'boolean'
}
