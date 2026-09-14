import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AuthPrincipal } from '../auth'
import type { TrustedRequestContext } from '../context'
import { IndustryAgentClientError } from '../clients/industry-agent-client'
import type { EvaluationClient } from './evaluation-client'
import { RequestBodyError, readJsonBody } from '../../security/request-limits'

export interface P11EvalRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: EvaluationClient
  bodyLimitBytes: number
}

export async function handleP11EvalRoute(options:P11EvalRouteOptions):Promise<boolean>{
  const path=options.url.pathname
  if(!path.startsWith('/api/industry/v1/eval/p11/'))return false
  if(path==='/api/industry/v1/eval/p11/corpus'&&options.request.method==='GET'){requireRead(options.principal);return send(options.response,await options.client.getUnifiedCorpusManifest(options.context))}
  if(path==='/api/industry/v1/eval/p11/runs'&&options.request.method==='GET'){requireRead(options.principal);return send(options.response,await options.client.listUnifiedBenchmarkRuns(options.context))}
  if(path==='/api/industry/v1/eval/p11/runs'&&options.request.method==='POST'){requireRun(options.principal);const body=record(await readJsonBody(options.request,options.bodyLimitBytes));only(body,['corpusId','variantId']);return send(options.response,await options.client.startUnifiedBenchmarkRun(options.context,{corpusId:string(body.corpusId,'corpusId'),variantId:variant(body.variantId)}),201)}
  if(path==='/api/industry/v1/eval/p11/baseline'&&options.request.method==='GET'){requireRead(options.principal);return send(options.response,await options.client.getUnifiedBaseline(options.context))}
  if(path==='/api/industry/v1/eval/p11/compare'&&options.request.method==='POST'){requireRead(options.principal);const body=record(await readJsonBody(options.request,options.bodyLimitBytes));only(body,['baselineRunId','candidateRunId']);return send(options.response,await options.client.compareUnifiedRuns(options.context,string(body.baselineRunId,'baselineRunId'),string(body.candidateRunId,'candidateRunId')))}
  if(path==='/api/industry/v1/eval/p11/waivers'&&options.request.method==='GET'){requireRead(options.principal);return send(options.response,await options.client.listReleaseWaivers(options.context))}
  const accept=path.match(/^\/api\/industry\/v1\/eval\/p11\/runs\/([^/]+)\/accept-baseline$/u)
  if(accept!==null&&options.request.method==='POST'){requireBaselineAccept(options.principal);requireEmpty(record(await readJsonBody(options.request,options.bodyLimitBytes)));return send(options.response,await options.client.acceptUnifiedBaseline(options.context,decode(accept[1])),201)}
  const waiver=path.match(/^\/api\/industry\/v1\/eval\/p11\/runs\/([^/]+)\/waivers$/u)
  if(waiver!==null&&options.request.method==='POST'){requireWaiverCreate(options.principal);const body=record(await readJsonBody(options.request,options.bodyLimitBytes));only(body,['reason','expiresAt']);return send(options.response,await options.client.createReleaseWaiver(options.context,decode(waiver[1]),{reason:string(body.reason,'reason'),expiresAt:string(body.expiresAt,'expiresAt')}),201)}
  const gate=path.match(/^\/api\/industry\/v1\/eval\/p11\/runs\/([^/]+)\/gate$/u)
  if(gate!==null&&options.request.method==='GET'){requireRead(options.principal);return send(options.response,await options.client.getUnifiedReleaseDecision(options.context,decode(gate[1])))}
  const detail=path.match(/^\/api\/industry\/v1\/eval\/p11\/runs\/([^/]+)$/u)
  if(detail!==null&&options.request.method==='GET'){requireRead(options.principal);return send(options.response,await options.client.getUnifiedBenchmarkRun(options.context,decode(detail[1])))}
  return false
}

function requireRead(principal:AuthPrincipal):void{if(principal.permissions.includes('eval.admin')||principal.permissions.includes('eval.read'))return;throw new IndustryAgentClientError('EVAL_ACCESS_DENIED','missing permission: eval.read',403)}
function requireRun(principal:AuthPrincipal):void{if(principal.permissions.includes('eval.admin')||principal.permissions.includes('eval.run'))return;throw new IndustryAgentClientError('EVAL_ACCESS_DENIED','missing permission: eval.run',403)}
function requireBaselineAccept(principal:AuthPrincipal):void{if(principal.permissions.includes('eval.admin'))return;if(principal.permissions.includes('eval.read')&&principal.permissions.includes('eval.baseline.accept'))return;throw new IndustryAgentClientError('EVAL_ACCESS_DENIED','baseline acceptance requires eval.read + eval.baseline.accept',403)}
function requireWaiverCreate(principal:AuthPrincipal):void{if(principal.permissions.includes('eval.admin'))return;if(principal.permissions.includes('eval.read')&&principal.permissions.includes('eval.waiver.create'))return;throw new IndustryAgentClientError('EVAL_ACCESS_DENIED','waiver creation requires eval.read + eval.waiver.create',403)}
function record(value:unknown):Record<string,unknown>{if(typeof value!=='object'||value===null||Array.isArray(value))throw new RequestBodyError('INVALID_JSON','request body must be an object',400);return value as Record<string,unknown>}
function only(value:Record<string,unknown>,allowed:readonly string[]):void{const bad=Object.keys(value).filter((key)=>!allowed.includes(key));if(bad.length>0)throw new RequestBodyError('INVALID_JSON',`unexpected fields: ${bad.join(', ')}`,400)}
function requireEmpty(value:Record<string,unknown>):void{if(Object.keys(value).length>0)throw new RequestBodyError('INVALID_JSON','request body must be an empty object',400)}
function string(value:unknown,name:string):string{if(typeof value!=='string'||value.trim()==='')throw new RequestBodyError('INVALID_JSON',`${name} must be a non-empty string`,400);return value.trim()}
function variant(value:unknown):'p11-guarded-v1'|'p11-broken-v0'{if(value!=='p11-guarded-v1'&&value!=='p11-broken-v0')throw new RequestBodyError('INVALID_JSON','variantId is invalid',400);return value}
function decode(value:string):string{try{return decodeURIComponent(value)}catch{throw new RequestBodyError('INVALID_QUERY','invalid path encoding',400)}}
function send(response:ServerResponse,data:unknown,statusCode=200):true{response.writeHead(statusCode,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify({apiVersion:'eval-api-v1',data}));return true}
