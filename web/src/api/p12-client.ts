import type {
  CreateOnlineFeedbackFromTraceRequest,
  DatasetHealthSummary,
  LabelOnlineFeedbackRequest,
  OnlineDatasetVersion,
  OnlineFeedbackItem,
  OnlineQualitySnapshot,
  ReviewOnlineFeedbackRequest,
} from '../../../shared/industry/eval/p12'

interface Envelope<T>{apiVersion:'eval-api-v1'|'industry-api-v1';data:T}
interface ErrorEnvelope{error:{requestId:string;code:string;message:string;retryable:boolean}}
export class P12ApiError extends Error{constructor(readonly code:string,message:string,readonly requestId:string,readonly retryable:boolean){super(message);this.name='P12ApiError'}}

export interface P12ApiClient{
  getOnlineQuality():Promise<OnlineQualitySnapshot>
  listFeedback():Promise<readonly OnlineFeedbackItem[]>
  getFeedback(feedbackId:string):Promise<OnlineFeedbackItem>
  createFeedbackFromTrace(input:CreateOnlineFeedbackFromTraceRequest):Promise<OnlineFeedbackItem>
  advanceToDraft(feedbackId:string):Promise<OnlineFeedbackItem>
  labelFeedback(feedbackId:string,input:LabelOnlineFeedbackRequest):Promise<OnlineFeedbackItem>
  reviewFeedback(feedbackId:string,input:ReviewOnlineFeedbackRequest):Promise<OnlineFeedbackItem>
  versionFeedback(feedbackId:string):Promise<OnlineFeedbackItem>
  listDatasetVersions():Promise<readonly OnlineDatasetVersion[]>
  getDatasetHealth():Promise<DatasetHealthSummary>
}

export function createP12ApiClient(fetcher:typeof fetch=fetch):P12ApiClient{
  return{
    getOnlineQuality:()=>request('/api/industry/v1/quality/online',{method:'GET'}),
    listFeedback:()=>request('/api/industry/v1/quality/feedback',{method:'GET'}),
    getFeedback:(feedbackId)=>request(`/api/industry/v1/quality/feedback/${encodeURIComponent(feedbackId)}`,{method:'GET'}),
    createFeedbackFromTrace:(input)=>request('/api/industry/v1/quality/feedback/from-trace',jsonPost(input)),
    advanceToDraft:(feedbackId)=>request(`/api/industry/v1/quality/feedback/${encodeURIComponent(feedbackId)}/draft`,jsonPost({})),
    labelFeedback:(feedbackId,input)=>request(`/api/industry/v1/quality/feedback/${encodeURIComponent(feedbackId)}/label`,jsonPost(input)),
    reviewFeedback:(feedbackId,input)=>request(`/api/industry/v1/quality/feedback/${encodeURIComponent(feedbackId)}/review`,jsonPost(input)),
    versionFeedback:(feedbackId)=>request(`/api/industry/v1/quality/feedback/${encodeURIComponent(feedbackId)}/version`,jsonPost({})),
    listDatasetVersions:()=>request('/api/industry/v1/quality/dataset/versions',{method:'GET'}),
    getDatasetHealth:()=>request('/api/industry/v1/quality/dataset/health',{method:'GET'}),
  }
  async function request<T>(path:string,init:RequestInit):Promise<T>{const response=await fetcher(path,{...init,credentials:'same-origin'});const payload:unknown=await response.json();if(!response.ok){if(isError(payload))throw new P12ApiError(payload.error.code,payload.error.message,payload.error.requestId,payload.error.retryable);throw new P12ApiError('INDUSTRY_API_ERROR',`request failed with status ${response.status}`,'unknown',false)}if(!isEnvelope(payload))throw new P12ApiError('INVALID_API_RESPONSE','invalid P12 API response','unknown',false);return payload.data as T}
}
function jsonPost(body:unknown):RequestInit{return{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}}
function isEnvelope(value:unknown):value is Envelope<unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value)&&'apiVersion'in value&&'data'in value}
function isError(value:unknown):value is ErrorEnvelope{if(typeof value!=='object'||value===null||Array.isArray(value)||!('error'in value))return false;const error=(value as {error?:unknown}).error;return typeof error==='object'&&error!==null&&!Array.isArray(error)&&typeof(error as {requestId?:unknown}).requestId==='string'&&typeof(error as {code?:unknown}).code==='string'&&typeof(error as {message?:unknown}).message==='string'&&typeof(error as {retryable?:unknown}).retryable==='boolean'}
