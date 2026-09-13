import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { IndustryApiError, PiWebMode } from '../../../shared/industry/common'
import { handleAgentLoopRoute } from './agent-loop-router'
import type { PrincipalProvider } from './auth'
import { IndustryAgentClientError, type IndustryAgentClient } from './clients/industry-agent-client'
import { handleConversationRoute } from './conversation-router'
import { IndustryContextError, IndustryContextService } from './context'
import { EvaluationClientError, type EvaluationClient } from './eval/evaluation-client'
import { handleP11EvalRoute } from './eval/p11-router'
import { handleP7EvalRoute } from './eval/p7-router'
import { handleP8EvalRoute } from './eval/p8-router'
import { handleP9EvalRoute } from './eval/p9-router'
import { handleRagEvalRoute } from './eval/rag-router'
import { handleEvalRoute } from './eval/router'
import { handleTraceEvalRoute } from './eval/trace-router'
import { handleKnowledgeRoute } from './knowledge-router'
import { handleMultimodalRoute } from './multimodal-router'
import { handleMutationRoute } from './mutation-router'
import { handleOperationsRoute } from './operations-router'
import { handleReportRoute } from './report-router'
import { handleRuntimeRoute } from './runtime-router'
import { handleSandboxRoute } from './sandbox-router'
import { handleTraceRoute } from './trace-router'
import { isOriginAllowed } from '../security/origin'
import { DEFAULT_JSON_BODY_LIMIT_BYTES, RequestBodyError, readJsonBody } from '../security/request-limits'

export interface IndustryRouterOptions {
  mode: PiWebMode
  principalProvider: PrincipalProvider
  client: IndustryAgentClient
  evaluationClient: EvaluationClient
  contextService: IndustryContextService
  allowedOrigins: ReadonlySet<string>
  jsonBodyLimitBytes?: number
}

export function createIndustryRouter(options: IndustryRouterOptions) {
  const bodyLimit = options.jsonBodyLimitBytes ?? DEFAULT_JSON_BODY_LIMIT_BYTES
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (!url.pathname.startsWith('/api/industry/v1/')) return false
    const requestId = randomUUID()
    response.setHeader('x-request-id', requestId)
    if (options.mode !== 'control-plane') { sendError(response, { requestId, code:'INDUSTRY_CONTROL_PLANE_DISABLED', message:'industry control plane is disabled in local mode', retryable:false },404); return true }
    if (!isOriginAllowed(request, options.allowedOrigins)) { sendError(response, { requestId, code:'ORIGIN_NOT_ALLOWED', message:'request origin is not allowed', retryable:false },403); return true }
    try {
      const principal = await options.principalProvider.getPrincipal(request)
      const resolved = await options.contextService.getContext(principal, requestId)
      if (await handleP11EvalRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.evaluationClient,bodyLimitBytes:bodyLimit })) return true
      if (await handleP9EvalRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.evaluationClient,bodyLimitBytes:bodyLimit })) return true
      if (await handleP8EvalRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.evaluationClient,bodyLimitBytes:bodyLimit })) return true
      if (await handleP7EvalRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.evaluationClient,agentClient:options.client,bodyLimitBytes:bodyLimit })) return true
      if (await handleRagEvalRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.evaluationClient,bodyLimitBytes:bodyLimit })) return true
      if (await handleTraceEvalRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.evaluationClient,bodyLimitBytes:bodyLimit })) return true
      if (await handleEvalRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.evaluationClient,bodyLimitBytes:bodyLimit })) return true
      if (await handleRuntimeRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.client,bodyLimitBytes:bodyLimit })) return true
      if (await handleOperationsRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.client })) return true
      if (await handleReportRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.client,bodyLimitBytes:bodyLimit })) return true
      if (await handleSandboxRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.client,bodyLimitBytes:bodyLimit })) return true
      if (await handleMultimodalRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.client,bodyLimitBytes:bodyLimit })) return true
      if (await handleAgentLoopRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.client,bodyLimitBytes:bodyLimit })) return true
      if (await handleKnowledgeRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.client,bodyLimitBytes:bodyLimit })) return true
      if (await handleTraceRoute({ request,response,url,requestId,principal,context:resolved.trusted,client:options.client })) return true
      if (await handleMutationRoute({ request,response,url,requestId,context:resolved.trusted,client:options.client,bodyLimitBytes:bodyLimit })) return true
      if (await handleConversationRoute({ request,response,url,requestId,context:resolved.trusted,client:options.client,bodyLimitBytes:bodyLimit })) return true
      if (url.pathname === '/api/industry/v1/health' && request.method === 'GET') { const health=await options.client.getHealth(resolved.trusted); sendJson(response,{apiVersion:'industry-api-v1',status:health.status,mode:'control-plane',adapter:health.adapter,requestId}); return true }
      if (url.pathname === '/api/industry/v1/context' && request.method === 'GET') { sendJson(response,{apiVersion:'industry-api-v1',context:resolved.view,authorizedProjects:resolved.authorizedProjects}); return true }
      if (url.pathname === '/api/industry/v1/context/project' && request.method === 'POST') { const body=await readJsonBody(request,bodyLimit); const projectId=parseProjectSelection(body); const selected=await options.contextService.selectProject(principal,requestId,projectId); sendJson(response,{apiVersion:'industry-api-v1',context:selected.view,authorizedProjects:selected.authorizedProjects}); return true }
      sendError(response,{requestId,code:'INDUSTRY_ROUTE_NOT_FOUND',message:'industry route not found',retryable:false},404); return true
    } catch (error) {
      if (error instanceof IndustryContextError) { sendError(response,{requestId,code:error.code,message:error.message,retryable:false,resolution:{type:'reselect_project'}},error.statusCode); return true }
      if (error instanceof IndustryAgentClientError) { sendError(response,{requestId,code:error.code,message:error.message,retryable:false,...(error.code==='MUTATION_COMMIT_FINALIZATION_FAILED'?{resolution:{type:'open_reconciliation' as const}}:{})},error.statusCode); return true }
      if (error instanceof EvaluationClientError) { sendError(response,{requestId,code:error.code,message:error.message,retryable:false},error.statusCode); return true }
      if (error instanceof RequestBodyError) { sendError(response,{requestId,code:error.code,message:error.message,retryable:false},error.statusCode); return true }
      sendError(response,{requestId,code:'INDUSTRY_INTERNAL_ERROR',message:'industry control plane request failed',retryable:false,resolution:{type:'contact_admin'}},500); return true
    }
  }
}

export function parseProjectSelection(value: unknown): string | null {
  if (!isRecord(value)) throw new RequestBodyError('INVALID_JSON','request body must be an object',400)
  const keys=Object.keys(value)
  if(keys.length!==1||keys[0]!=='projectId')throw new RequestBodyError('INVALID_JSON','only projectId is allowed in project selection requests',400)
  if(value.projectId===null)return null
  if(typeof value.projectId!=='string'||value.projectId.trim()==='')throw new RequestBodyError('INVALID_JSON','projectId must be a non-empty string or null',400)
  return value.projectId
}
function sendJson(response:ServerResponse,body:unknown,statusCode=200):void{response.writeHead(statusCode,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify(body))}
function sendError(response:ServerResponse,error:IndustryApiError,statusCode:number):void{sendJson(response,{error},statusCode)}
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==='object'&&value!==null&&!Array.isArray(value)}
