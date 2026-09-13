import type { IncomingMessage, ServerResponse } from 'node:http'
import type { P9EvalDomain, StartP9EvalRunRequest } from '../../../../shared/industry/eval/p9'
import type { AuthPrincipal } from '../auth'
import type { TrustedRequestContext } from '../context'
import { RequestBodyError, readJsonBody } from '../../security/request-limits'
import { EvaluationClientError, type EvaluationClient } from './evaluation-client'

export interface P9EvalRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: EvaluationClient
  bodyLimitBytes: number
}

export async function handleP9EvalRoute(options:P9EvalRouteOptions):Promise<boolean>{
  const path=options.url.pathname
  if(!path.startsWith('/api/industry/v1/eval/p9/'))return false
  const domainCases=path.match(/^\/api\/industry\/v1\/eval\/p9\/(report|sandbox)\/cases$/u)
  if(domainCases!==null&&options.request.method==='GET'){requirePermission(options.principal,'eval.read');return sendData(options.response,await options.client.listP9EvalCases(options.context,domain(domainCases[1])))}
  const domainRuns=path.match(/^\/api\/industry\/v1\/eval\/p9\/(report|sandbox)\/runs$/u)
  if(domainRuns!==null&&options.request.method==='GET'){requirePermission(options.principal,'eval.read');return sendData(options.response,await options.client.listP9EvalRuns(options.context,domain(domainRuns[1])))}
  if(domainRuns!==null&&options.request.method==='POST'){
    requirePermission(options.principal,'eval.run')
    const body=await readJsonBody(options.request,options.bodyLimitBytes)
    return sendData(options.response,await options.client.startP9EvalRun(options.context,domain(domainRuns[1]),parseStart(body)),201)
  }
  const observationMatch=path.match(/^\/api\/industry\/v1\/eval\/p9\/runs\/([^/]+)\/(observations|failures)$/u)
  if(observationMatch!==null&&options.request.method==='GET'){
    requirePermission(options.principal,'eval.read')
    const runId=decode(observationMatch[1])
    const data=observationMatch[2]==='observations'?await options.client.listP9EvalObservations(options.context,runId):await options.client.listP9EvalFailures(options.context,runId)
    return sendData(options.response,data)
  }
  const runMatch=path.match(/^\/api\/industry\/v1\/eval\/p9\/runs\/([^/]+)$/u)
  if(runMatch!==null&&options.request.method==='GET'){requirePermission(options.principal,'eval.read');return sendData(options.response,await options.client.getP9EvalRun(options.context,decode(runMatch[1])))}
  return false
}

function parseStart(input:unknown):StartP9EvalRunRequest{const value=record(input);const keys=Object.keys(value);if(keys.length!==2||!keys.includes('datasetId')||!keys.includes('variantId'))throw new RequestBodyError('INVALID_JSON','only datasetId and variantId are allowed',400);if(typeof value.datasetId!=='string'||value.datasetId.trim()==='')throw new RequestBodyError('INVALID_JSON','datasetId must be a non-empty string',400);if(value.variantId!=='p9-broken-v0'&&value.variantId!=='p9-guarded-v1')throw new RequestBodyError('INVALID_JSON','variantId is invalid',400);return{datasetId:value.datasetId,variantId:value.variantId}}
function requirePermission(principal:AuthPrincipal,permission:'eval.read'|'eval.run'):void{if(principal.permissions.includes('eval.admin')||principal.permissions.includes(permission))return;throw new EvaluationClientError('EVAL_ACCESS_DENIED',`missing permission: ${permission}`,403)}
function domain(value:string|undefined):P9EvalDomain{if(value==='report')return'REPORT';if(value==='sandbox')return'SANDBOX';throw new RequestBodyError('INVALID_QUERY','invalid P9 domain',400)}
function record(value:unknown):Record<string,unknown>{if(typeof value!=='object'||value===null||Array.isArray(value))throw new RequestBodyError('INVALID_JSON','request body must be an object',400);return value as Record<string,unknown>}
function decode(value:string):string{try{return decodeURIComponent(value)}catch{throw new RequestBodyError('INVALID_QUERY','invalid path encoding',400)}}
function sendData(response:ServerResponse,data:unknown,statusCode=200):true{response.writeHead(statusCode,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify({apiVersion:'eval-api-v1',data}));return true}
