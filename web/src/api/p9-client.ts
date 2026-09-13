import type { P9EvalCase, P9EvalDomain, P9EvalFailureSummary, P9EvalObservation, P9EvalRunSummary, P9EvalVariant } from '../../../shared/industry/eval/p9'
import type { ReportArtifact, ReportDownloadGrant } from '../../../shared/industry/report'
import type { SandboxRun, SandboxScenario, StartSandboxRunRequest } from '../../../shared/industry/sandbox'

interface Envelope<T>{apiVersion:'industry-api-v1'|'eval-api-v1';data:T}
interface ErrorEnvelope{error:{requestId:string;code:string;message:string;retryable:boolean}}
export class P9ApiError extends Error{constructor(readonly code:string,message:string,readonly requestId:string,readonly retryable:boolean){super(message);this.name='P9ApiError'}}

export interface P9ApiClient{
  listReports():Promise<readonly ReportArtifact[]>
  getReport(reportId:string):Promise<ReportArtifact>
  requestReportDownload(reportId:string):Promise<ReportDownloadGrant>
  listSandboxRuns():Promise<readonly SandboxRun[]>
  startSandboxRun(input:{goal:string;budget:StartSandboxRunRequest['budget'];scenario?:SandboxScenario}):Promise<SandboxRun>
  getSandboxRun(runId:string):Promise<SandboxRun>
  listEvalCases(domain:P9EvalDomain):Promise<readonly P9EvalCase[]>
  listEvalRuns(domain:P9EvalDomain):Promise<readonly P9EvalRunSummary[]>
  startEvalRun(domain:P9EvalDomain,input:{datasetId:string;variantId:P9EvalVariant}):Promise<P9EvalRunSummary>
  getEvalRun(runId:string):Promise<P9EvalRunSummary>
  listEvalObservations(runId:string):Promise<readonly P9EvalObservation[]>
  listEvalFailures(runId:string):Promise<readonly P9EvalFailureSummary[]>
}

export function createP9ApiClient(fetcher:typeof fetch=fetch):P9ApiClient{
  return{
    listReports:()=>request('/api/industry/v1/reports',{method:'GET'}),
    getReport:(reportId)=>request(`/api/industry/v1/reports/${encodeURIComponent(reportId)}`,{method:'GET'}),
    requestReportDownload:(reportId)=>request(`/api/industry/v1/reports/${encodeURIComponent(reportId)}/download`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),
    listSandboxRuns:()=>request('/api/industry/v1/sandbox/runs',{method:'GET'}),
    startSandboxRun:(input)=>request('/api/industry/v1/sandbox/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),
    getSandboxRun:(runId)=>request(`/api/industry/v1/sandbox/runs/${encodeURIComponent(runId)}`,{method:'GET'}),
    listEvalCases:(domain)=>request(`/api/industry/v1/eval/p9/${segment(domain)}/cases`,{method:'GET'}),
    listEvalRuns:(domain)=>request(`/api/industry/v1/eval/p9/${segment(domain)}/runs`,{method:'GET'}),
    startEvalRun:(domain,input)=>request(`/api/industry/v1/eval/p9/${segment(domain)}/runs`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)}),
    getEvalRun:(runId)=>request(`/api/industry/v1/eval/p9/runs/${encodeURIComponent(runId)}`,{method:'GET'}),
    listEvalObservations:(runId)=>request(`/api/industry/v1/eval/p9/runs/${encodeURIComponent(runId)}/observations`,{method:'GET'}),
    listEvalFailures:(runId)=>request(`/api/industry/v1/eval/p9/runs/${encodeURIComponent(runId)}/failures`,{method:'GET'}),
  }
  async function request<T>(path:string,init:RequestInit):Promise<T>{const response=await fetcher(path,{...init,credentials:'same-origin'});const payload:unknown=await response.json();if(!response.ok){if(isErrorEnvelope(payload))throw new P9ApiError(payload.error.code,payload.error.message,payload.error.requestId,payload.error.retryable);throw new P9ApiError('INDUSTRY_API_ERROR',`request failed with status ${response.status}`,'unknown',false)}if(!isEnvelope(payload))throw new P9ApiError('INVALID_API_RESPONSE','invalid P9 API response','unknown',false);return payload.data as T}
}
function segment(domain:P9EvalDomain):string{return domain.toLowerCase()}
function isEnvelope(value:unknown):value is Envelope<unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value)&&'apiVersion'in value&&'data'in value}
function isErrorEnvelope(value:unknown):value is ErrorEnvelope{if(typeof value!=='object'||value===null||Array.isArray(value)||!('error'in value))return false;const error=(value as {error?:unknown}).error;return typeof error==='object'&&error!==null&&!Array.isArray(error)&&typeof(error as {requestId?:unknown}).requestId==='string'&&typeof(error as {code?:unknown}).code==='string'&&typeof(error as {message?:unknown}).message==='string'&&typeof(error as {retryable?:unknown}).retryable==='boolean'}
