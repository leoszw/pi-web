import type {
  BaselineAcceptance,
  CreateReleaseWaiverRequest,
  ReleaseWaiver,
  StartUnifiedBenchmarkRunRequest,
  UnifiedBenchmarkRun,
  UnifiedCorpusManifest,
  UnifiedReleaseDecision,
  UnifiedRunComparison,
} from '../../../shared/industry/eval/p11'

interface Envelope<T>{apiVersion:'eval-api-v1';data:T}
interface ErrorEnvelope{error:{requestId:string;code:string;message:string;retryable:boolean}}
export class P11ApiError extends Error{constructor(readonly code:string,message:string,readonly requestId:string,readonly retryable:boolean){super(message);this.name='P11ApiError'}}

export interface P11ApiClient{
  getCorpus():Promise<UnifiedCorpusManifest>
  listRuns():Promise<readonly UnifiedBenchmarkRun[]>
  startRun(input:StartUnifiedBenchmarkRunRequest):Promise<UnifiedBenchmarkRun>
  getRun(runId:string):Promise<UnifiedBenchmarkRun>
  getDecision(runId:string):Promise<UnifiedReleaseDecision>
  getBaseline():Promise<BaselineAcceptance|null>
  acceptBaseline(runId:string):Promise<BaselineAcceptance>
  compare(baselineRunId:string,candidateRunId:string):Promise<UnifiedRunComparison>
  listWaivers():Promise<readonly ReleaseWaiver[]>
  createWaiver(runId:string,input:CreateReleaseWaiverRequest):Promise<ReleaseWaiver>
}

export function createP11ApiClient(fetcher:typeof fetch=fetch):P11ApiClient{
  return{
    getCorpus:()=>request('/api/industry/v1/eval/p11/corpus',{method:'GET'}),
    listRuns:()=>request('/api/industry/v1/eval/p11/runs',{method:'GET'}),
    startRun:(input)=>request('/api/industry/v1/eval/p11/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),
    getRun:(runId)=>request(`/api/industry/v1/eval/p11/runs/${encodeURIComponent(runId)}`,{method:'GET'}),
    getDecision:(runId)=>request(`/api/industry/v1/eval/p11/runs/${encodeURIComponent(runId)}/gate`,{method:'GET'}),
    getBaseline:()=>request('/api/industry/v1/eval/p11/baseline',{method:'GET'}),
    acceptBaseline:(runId)=>request(`/api/industry/v1/eval/p11/runs/${encodeURIComponent(runId)}/accept-baseline`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),
    compare:(baselineRunId,candidateRunId)=>request('/api/industry/v1/eval/p11/compare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({baselineRunId,candidateRunId})}),
    listWaivers:()=>request('/api/industry/v1/eval/p11/waivers',{method:'GET'}),
    createWaiver:(runId,input)=>request(`/api/industry/v1/eval/p11/runs/${encodeURIComponent(runId)}/waivers`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),
  }
  async function request<T>(path:string,init:RequestInit):Promise<T>{const response=await fetcher(path,{...init,credentials:'same-origin'});const payload:unknown=await response.json();if(!response.ok){if(isErrorEnvelope(payload))throw new P11ApiError(payload.error.code,payload.error.message,payload.error.requestId,payload.error.retryable);throw new P11ApiError('INDUSTRY_API_ERROR',`request failed with status ${response.status}`,'unknown',false)}if(!isEnvelope(payload))throw new P11ApiError('INVALID_API_RESPONSE','invalid P11 API response','unknown',false);return payload.data as T}
}
function isEnvelope(value:unknown):value is Envelope<unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value)&&'apiVersion'in value&&'data'in value}
function isErrorEnvelope(value:unknown):value is ErrorEnvelope{if(typeof value!=='object'||value===null||Array.isArray(value)||!('error'in value))return false;const error=(value as {error?:unknown}).error;return typeof error==='object'&&error!==null&&!Array.isArray(error)&&typeof(error as {requestId?:unknown}).requestId==='string'&&typeof(error as {code?:unknown}).code==='string'&&typeof(error as {message?:unknown}).message==='string'&&typeof(error as {retryable?:unknown}).retryable==='boolean'}
