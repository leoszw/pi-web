import type { OperationsReadiness } from '../../../shared/industry/operations'
import type { CreateRuntimeConfigDraftRequest, RuntimeConfigDraft, RuntimeInventory } from '../../../shared/industry/runtime'

interface ApiErrorBody { error?: { code?: string; message?: string } }
export interface P10ApiClient {
  getRuntimeInventory(): Promise<RuntimeInventory>
  listRuntimeConfigDrafts(): Promise<readonly RuntimeConfigDraft[]>
  createRuntimeConfigDraft(request: CreateRuntimeConfigDraftRequest): Promise<RuntimeConfigDraft>
  getRuntimeConfigDraft(draftId:string): Promise<RuntimeConfigDraft>
  validateRuntimeConfigDraft(draftId:string): Promise<RuntimeConfigDraft>
  saveRuntimeConfigDraft(draftId:string): Promise<RuntimeConfigDraft>
  evaluateRuntimeConfigDraft(draftId:string): Promise<RuntimeConfigDraft>
  getOperationsReadiness(): Promise<OperationsReadiness>
}

export function createP10ApiClient(fetcher:typeof fetch=fetch):P10ApiClient {
  return {
    getRuntimeInventory:()=>get('/api/industry/v1/runtime'),
    listRuntimeConfigDrafts:()=>get('/api/industry/v1/runtime/config/drafts'),
    createRuntimeConfigDraft:(request)=>post('/api/industry/v1/runtime/config/drafts',request),
    getRuntimeConfigDraft:(draftId)=>get(`/api/industry/v1/runtime/config/drafts/${encodeURIComponent(draftId)}`),
    validateRuntimeConfigDraft:(draftId)=>post(`/api/industry/v1/runtime/config/drafts/${encodeURIComponent(draftId)}/validate`,{}),
    saveRuntimeConfigDraft:(draftId)=>post(`/api/industry/v1/runtime/config/drafts/${encodeURIComponent(draftId)}/save`,{}),
    evaluateRuntimeConfigDraft:(draftId)=>post(`/api/industry/v1/runtime/config/drafts/${encodeURIComponent(draftId)}/eval`,{}),
    getOperationsReadiness:()=>get('/api/industry/v1/operations/readiness'),
  }
  async function get<T>(path:string):Promise<T>{return request<T>(path,{method:'GET'})}
  async function post<T>(path:string,body:unknown):Promise<T>{return request<T>(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})}
  async function request<T>(path:string,init:RequestInit):Promise<T>{const response=await fetcher(path,init);const body=await response.json() as {data?:T}&ApiErrorBody;if(!response.ok||body.data===undefined)throw new Error(body.error?.message??body.error?.code??`request failed: ${response.status}`);return body.data}
}
