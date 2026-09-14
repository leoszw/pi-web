import type {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeIngestion,
  KnowledgeUploadOptions,
  KnowledgeUploadRequest,
} from '../../../../shared/industry/knowledge'
import type { TrustedRequestContext } from '../context'
import { MockIndustryAgentClient } from '../clients/mock-industry-agent-client'
import { MockKnowledgeStore } from './mock-knowledge-store'

const stores = new WeakMap<MockIndustryAgentClient, MockKnowledgeStore>()

function storeFor(client: MockIndustryAgentClient): MockKnowledgeStore {
  let store = stores.get(client)
  if (store === undefined) {
    store = new MockKnowledgeStore()
    stores.set(client, store)
  }
  return store
}

declare module '../clients/mock-industry-agent-client' {
  interface MockIndustryAgentClient {
    getKnowledgeUploadOptions(context: TrustedRequestContext): Promise<KnowledgeUploadOptions>
    listKnowledgeDocuments(context: TrustedRequestContext): Promise<readonly KnowledgeDocument[]>
    uploadKnowledgeDocument(context: TrustedRequestContext, request: KnowledgeUploadRequest): Promise<KnowledgeDocument>
    getKnowledgeDocument(context: TrustedRequestContext, documentId: string): Promise<KnowledgeDocument>
    reingestKnowledgeDocument(context: TrustedRequestContext, documentId: string): Promise<KnowledgeDocument>
    listKnowledgeChunks(context: TrustedRequestContext, documentId: string): Promise<readonly KnowledgeChunk[]>
    getKnowledgeIngestion(context: TrustedRequestContext, ingestionId: string): Promise<KnowledgeIngestion>
  }
}

MockIndustryAgentClient.prototype.getKnowledgeUploadOptions = async function getKnowledgeUploadOptions(context) {
  return storeFor(this).options(context)
}

MockIndustryAgentClient.prototype.listKnowledgeDocuments = async function listKnowledgeDocuments(context) {
  return storeFor(this).list(context)
}

MockIndustryAgentClient.prototype.uploadKnowledgeDocument = async function uploadKnowledgeDocument(context, request) {
  return storeFor(this).upload(context, request)
}

MockIndustryAgentClient.prototype.getKnowledgeDocument = async function getKnowledgeDocument(context, documentId) {
  return storeFor(this).get(context, documentId)
}

MockIndustryAgentClient.prototype.reingestKnowledgeDocument = async function reingestKnowledgeDocument(context, documentId) {
  return storeFor(this).reingest(context, documentId)
}

MockIndustryAgentClient.prototype.listKnowledgeChunks = async function listKnowledgeChunks(context, documentId) {
  return storeFor(this).chunks(context, documentId)
}

MockIndustryAgentClient.prototype.getKnowledgeIngestion = async function getKnowledgeIngestion(context, ingestionId) {
  return storeFor(this).ingestion(context, ingestionId)
}
