import type { IncomingMessage, ServerResponse } from 'node:http'
import type { P8EvalDomain, StartP8EvalRunRequest } from '../../../../shared/industry/eval/p8'
import type { AuthPrincipal } from '../auth'
import type { TrustedRequestContext } from '../context'
import { RequestBodyError, readJsonBody } from '../../security/request-limits'
import { EvaluationClientError, type EvaluationClient } from './evaluation-client'

export interface P8EvalRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: EvaluationClient
  bodyLimitBytes: number
}

export async function handleP8EvalRoute(options: P8EvalRouteOptions): Promise<boolean> {
  const path = options.url.pathname
  if (!path.startsWith('/api/industry/v1/eval/p8/')) return false
  try {
    const domainCases = path.match(/^\/api\/industry\/v1\/eval\/p8\/(multimodal|agent-loop)\/cases$/u)
    if (domainCases !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listP8EvalCases(options.context, domain(domainCases[1])))
    }
    const domainRuns = path.match(/^\/api\/industry\/v1\/eval\/p8\/(multimodal|agent-loop)\/runs$/u)
    if (domainRuns !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listP8EvalRuns(options.context, domain(domainRuns[1])))
    }
    if (domainRuns !== null && options.request.method === 'POST') {
      requirePermission(options.principal, 'eval.run')
      const body = await readJsonBody(options.request, options.bodyLimitBytes)
      return sendData(options.response, await options.client.startP8EvalRun(options.context, domain(domainRuns[1]), parseStart(body)), 201)
    }
    const failures = path.match(/^\/api\/industry\/v1\/eval\/p8\/runs\/([^/]+)\/failures$/u)
    if (failures !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listP8EvalFailures(options.context, decode(failures[1])))
    }
    const observations = path.match(/^\/api\/industry\/v1\/eval\/p8\/runs\/([^/]+)\/observations$/u)
    if (observations !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listP8EvalObservations(options.context, decode(observations[1])))
    }
    const run = path.match(/^\/api\/industry\/v1\/eval\/p8\/runs\/([^/]+)$/u)
    if (run !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.getP8EvalRun(options.context, decode(run[1])))
    }
    return false
  } catch (error) {
    if (error instanceof EvaluationClientError || error instanceof RequestBodyError || error instanceof EvalAccessError) {
      sendError(options.response, options.requestId, error.code, error.message, error.statusCode)
      return true
    }
    throw error
  }
}

function parseStart(input: unknown): StartP8EvalRunRequest {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new RequestBodyError('INVALID_JSON','request body must be an object',400)
  const value=input as Record<string,unknown>
  const bad=Object.keys(value).filter((key)=>!['datasetId','variantId'].includes(key))
  if(bad.length>0)throw new RequestBodyError('INVALID_JSON',`unexpected fields: ${bad.join(', ')}`,400)
  if(typeof value.datasetId!=='string'||value.datasetId.trim()==='')throw new RequestBodyError('INVALID_JSON','datasetId must be a non-empty string',400)
  if(value.variantId!=='p8-broken-v0'&&value.variantId!=='p8-guarded-v1')throw new RequestBodyError('INVALID_JSON','variantId is invalid',400)
  return {datasetId:value.datasetId,variantId:value.variantId}
}
function domain(value:string):P8EvalDomain{return value==='multimodal'?'MULTIMODAL':'AGENT_LOOP'}
function requirePermission(principal:AuthPrincipal,permission:'eval.read'|'eval.run'):void{if(principal.permissions.includes('eval.admin')||principal.permissions.includes(permission))return;throw new EvalAccessError('EVAL_ACCESS_DENIED',`missing permission: ${permission}`,403)}
class EvalAccessError extends Error { readonly code:string; readonly statusCode:number; constructor(code:string,message:string,statusCode:number){super(message);this.name='EvalAccessError';this.code=code;this.statusCode=statusCode} }
function decode(value:string):string{try{return decodeURIComponent(value)}catch{throw new RequestBodyError('INVALID_QUERY','invalid path encoding',400)}}
function sendData(response:ServerResponse,data:unknown,statusCode=200):true{response.writeHead(statusCode,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify({apiVersion:'eval-api-v1',data}));return true}
function sendError(response:ServerResponse,requestId:string,code:string,message:string,statusCode:number):void{response.writeHead(statusCode,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify({error:{requestId,code,message,retryable:false}}))}
