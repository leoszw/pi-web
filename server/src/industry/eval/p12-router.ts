import type { IncomingMessage, ServerResponse } from 'node:http'
import type {
  CreateOnlineFeedbackFromTraceRequest,
  EvalCaseDifficulty,
  LabelOnlineFeedbackRequest,
  OnlineFeedbackDomain,
  ReviewOnlineFeedbackRequest,
} from '../../../../shared/industry/eval/p12'
import type { AuthPrincipal } from '../auth'
import type { IndustryAgentClient } from '../clients/industry-agent-client'
import type { TrustedRequestContext } from '../context'
import { RequestBodyError, readJsonBody } from '../../security/request-limits'
import { EvaluationClientError, type EvaluationClient } from './evaluation-client'

export interface P12RouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: EvaluationClient
  agentClient: IndustryAgentClient
  bodyLimitBytes: number
}

export async function handleP12Route(options:P12RouteOptions):Promise<boolean>{
  const path=options.url.pathname
  if(!path.startsWith('/api/industry/v1/quality/'))return false
  try{
    if(path==='/api/industry/v1/quality/online'&&options.request.method==='GET'){requireRead(options.principal);return sendData(options.response,await options.client.getOnlineQualitySnapshot(options.context))}
    if(path==='/api/industry/v1/quality/feedback'&&options.request.method==='GET'){requireRead(options.principal);return sendData(options.response,await options.client.listOnlineFeedback(options.context))}
    if(path==='/api/industry/v1/quality/feedback/from-trace'&&options.request.method==='POST'){
      requireEdit(options.principal);requireTraceRead(options.principal)
      const body=parseCreate(await readJsonBody(options.request,options.bodyLimitBytes))
      const trace=await options.agentClient.getTrace(options.context,body.traceId,{debug:false,prompt:false,audit:false})
      const sanitized=sanitizeOnlineText(`${trace.summary.kind} · ${trace.summary.name}`)
      return sendData(options.response,await options.client.createOnlineFeedbackFromTrace(options.context,body,sanitized.text,sanitized.removed),201)
    }
    if(path==='/api/industry/v1/quality/dataset/versions'&&options.request.method==='GET'){requireRead(options.principal);return sendData(options.response,await options.client.listOnlineDatasetVersions(options.context))}
    if(path==='/api/industry/v1/quality/dataset/health'&&options.request.method==='GET'){requireRead(options.principal);return sendData(options.response,await options.client.getOnlineDatasetHealth(options.context))}

    const action=path.match(/^\/api\/industry\/v1\/quality\/feedback\/([^/]+)\/(draft|label|review|version)$/u)
    if(action!==null&&options.request.method==='POST'){
      const feedbackId=decode(action[1]);const kind=action[2]
      if(kind==='draft'){requireEdit(options.principal);requireEmpty(await readJsonBody(options.request,options.bodyLimitBytes));return sendData(options.response,await options.client.advanceOnlineFeedbackToDraft(options.context,feedbackId))}
      if(kind==='label'){requireEdit(options.principal);const body=parseLabel(await readJsonBody(options.request,options.bodyLimitBytes));return sendData(options.response,await options.client.labelOnlineFeedback(options.context,feedbackId,body))}
      if(kind==='review'){requireReview(options.principal);const body=parseReview(await readJsonBody(options.request,options.bodyLimitBytes));return sendData(options.response,await options.client.reviewOnlineFeedback(options.context,feedbackId,body))}
      requireVersion(options.principal);requireEmpty(await readJsonBody(options.request,options.bodyLimitBytes));return sendData(options.response,await options.client.versionOnlineFeedback(options.context,feedbackId))
    }
    const detail=path.match(/^\/api\/industry\/v1\/quality\/feedback\/([^/]+)$/u)
    if(detail!==null&&options.request.method==='GET'){requireRead(options.principal);return sendData(options.response,await options.client.getOnlineFeedback(options.context,decode(detail[1])))}
    return false
  }catch(error){
    if(error instanceof QualityAccessError||error instanceof EvaluationClientError||error instanceof RequestBodyError){sendError(options.response,options.requestId,error.code,error.message,error.statusCode);return true}
    throw error
  }
}

function parseCreate(value:unknown):CreateOnlineFeedbackFromTraceRequest{const row=record(value);only(row,['traceId','targetDomain']);return{traceId:str(row.traceId,'traceId'),targetDomain:domain(row.targetDomain)}}
function parseLabel(value:unknown):LabelOnlineFeedbackRequest{const row=record(value);only(row,['label','tags','difficulty','notes']);if(!Array.isArray(row.tags)||!row.tags.every((item)=>typeof item==='string'))throw new RequestBodyError('INVALID_JSON','tags must be an array of strings',400);return{label:str(row.label,'label'),tags:row.tags,difficulty:difficulty(row.difficulty),...(row.notes===undefined?{}:{notes:boundedString(row.notes,'notes',1000)})}}
function parseReview(value:unknown):ReviewOnlineFeedbackRequest{const row=record(value);only(row,['approved','reviewNote']);if(row.approved!==true)throw new RequestBodyError('INVALID_JSON','approved must be true for review',400);return{approved:true,...(row.reviewNote===undefined?{}:{reviewNote:boundedString(row.reviewNote,'reviewNote',1000)})}}
function domain(value:unknown):OnlineFeedbackDomain{if(value==='INTENT'||value==='RETRIEVAL'||value==='RAG'||value==='TOOL'||value==='MUTATION'||value==='MEMORY')return value;throw new RequestBodyError('INVALID_JSON','targetDomain is invalid',400)}
function difficulty(value:unknown):EvalCaseDifficulty{if(value==='NORMAL'||value==='HARD'||value==='ADVERSARIAL')return value;throw new RequestBodyError('INVALID_JSON','difficulty is invalid',400)}

function requireRead(principal:AuthPrincipal):void{if(isQualityAdmin(principal)||principal.permissions.includes('quality.read'))return;throw new QualityAccessError('QUALITY_ACCESS_DENIED','missing permission: quality.read',403)}
function requireEdit(principal:AuthPrincipal):void{if(isQualityAdmin(principal)||(principal.permissions.includes('quality.read')&&principal.permissions.includes('quality.feedback.edit')))return;throw new QualityAccessError('QUALITY_ACCESS_DENIED','quality.read + quality.feedback.edit are required',403)}
function requireReview(principal:AuthPrincipal):void{if(isQualityAdmin(principal)||(principal.permissions.includes('quality.read')&&principal.permissions.includes('quality.feedback.review')))return;throw new QualityAccessError('QUALITY_ACCESS_DENIED','quality.read + quality.feedback.review are required',403)}
function requireVersion(principal:AuthPrincipal):void{const qualityAllowed=isQualityAdmin(principal)||(principal.permissions.includes('quality.read')&&principal.permissions.includes('quality.feedback.review'));const datasetAllowed=principal.permissions.includes('eval.dataset.edit')||principal.permissions.includes('eval.admin');if(qualityAllowed&&datasetAllowed)return;throw new QualityAccessError('QUALITY_ACCESS_DENIED','quality review permission + eval.dataset.edit are required',403)}
function requireTraceRead(principal:AuthPrincipal):void{if(principal.permissions.includes('trace.admin')||principal.permissions.includes('trace.read.basic'))return;throw new QualityAccessError('TRACE_ACCESS_DENIED','missing permission: trace.read.basic',403)}
function isQualityAdmin(principal:AuthPrincipal):boolean{return principal.permissions.includes('quality.admin')}

class QualityAccessError extends Error{constructor(readonly code:string,message:string,readonly statusCode:number){super(message);this.name='QualityAccessError'}}
function record(value:unknown):Record<string,unknown>{if(typeof value!=='object'||value===null||Array.isArray(value))throw new RequestBodyError('INVALID_JSON','request body must be an object',400);return value as Record<string,unknown>}
function only(value:Record<string,unknown>,allowed:readonly string[]):void{const invalid=Object.keys(value).filter((key)=>!allowed.includes(key));if(invalid.length>0)throw new RequestBodyError('INVALID_JSON',`unexpected request fields: ${invalid.join(', ')}`,400)}
function str(value:unknown,name:string):string{if(typeof value!=='string'||value.trim()==='')throw new RequestBodyError('INVALID_JSON',`${name} must be a non-empty string`,400);return value.trim()}
function boundedString(value:unknown,name:string,max:number):string{const text=str(value,name);if(text.length>max)throw new RequestBodyError('INVALID_JSON',`${name} must be at most ${max} characters`,400);return text}
function requireEmpty(value:unknown):void{const row=record(value);if(Object.keys(row).length>0)throw new RequestBodyError('INVALID_JSON','request body must be an empty object',400)}
function decode(value:string):string{try{return decodeURIComponent(value)}catch{throw new RequestBodyError('INVALID_QUERY','invalid path encoding',400)}}
function sanitizeOnlineText(value:string):{text:string;removed:number}{let removed=0;const replace=(pattern:RegExp,replacement:string)=>{value=value.replace(pattern,()=>{removed+=1;return replacement})};replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/giu,'Bearer [REDACTED]');replace(/\bsk-[A-Za-z0-9_-]{6,}/gu,'[REDACTED_API_KEY]');replace(/\bapproval-[A-Za-z0-9_-]{6,}/gu,'[REDACTED_APPROVAL_TOKEN]');replace(/\b(?:mysql|postgres(?:ql)?):\/\/[^\s"']+/giu,'[REDACTED_DSN]');replace(/((?:api[-_ ]?key|approval[-_ ]?token|password|cookie|authorization)\s*[:=]\s*)[^\s,;]+/giu,'$1[REDACTED]');return{text:value.slice(0,500),removed}}
function sendData(response:ServerResponse,data:unknown,statusCode=200):true{response.writeHead(statusCode,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify({apiVersion:'eval-api-v1',data}));return true}
function sendError(response:ServerResponse,requestId:string,code:string,message:string,statusCode:number):void{response.writeHead(statusCode,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify({error:{requestId,code,message,retryable:false}}))}
