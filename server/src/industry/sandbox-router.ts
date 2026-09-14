import type { IncomingMessage, ServerResponse } from 'node:http'
import type { StartSandboxRunRequest } from '../../../shared/industry/sandbox'
import type { AuthPrincipal } from './auth'
import { IndustryAgentClientError, type IndustryAgentClient } from './clients/industry-agent-client'
import type { TrustedRequestContext } from './context'
import { RequestBodyError, readJsonBody } from '../security/request-limits'

export interface SandboxRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: IndustryAgentClient
  bodyLimitBytes: number
}

export async function handleSandboxRoute(options: SandboxRouteOptions): Promise<boolean> {
  const path = options.url.pathname
  if (!path.startsWith('/api/industry/v1/sandbox')) return false
  if (path === '/api/industry/v1/sandbox/runs' && options.request.method === 'GET') {
    requirePermission(options.principal, 'sandbox.read')
    return sendData(options.response, await options.client.listSandboxRuns(options.context))
  }
  if (path === '/api/industry/v1/sandbox/runs' && options.request.method === 'POST') {
    requirePermission(options.principal, 'sandbox.run')
    const body = await readJsonBody(options.request, options.bodyLimitBytes)
    return sendData(options.response, await options.client.startSandboxRun(options.context, parseStart(body)), 201)
  }
  const match = path.match(/^\/api\/industry\/v1\/sandbox\/runs\/([^/]+)$/u)
  if (match !== null && options.request.method === 'GET') {
    requirePermission(options.principal, 'sandbox.read')
    return sendData(options.response, await options.client.getSandboxRun(options.context, decode(match[1])))
  }
  return false
}

function parseStart(input: unknown): StartSandboxRunRequest {
  const value = record(input)
  only(value,['goal','budget','scenario'])
  const budget = record(value.budget)
  only(budget,['maxRows','maxBytes','timeoutMs'])
  const scenario = value.scenario
  const allowed = ['SAFE_READ','WRITE_SQL','SELECT_STAR','LOAD_FILE','SYSTEM_SCHEMA','PYTHON_IMPORT_OPEN_NETWORK_PROCESS','DYNAMIC_QUERY_ID','ATTESTATION','PAYLOAD_BUDGET'] as const
  if (scenario !== undefined && (typeof scenario !== 'string' || !allowed.includes(scenario as typeof allowed[number]))) throw new RequestBodyError('INVALID_JSON','scenario is invalid',400)
  return {
    goal:str(value.goal,'goal'),
    budget:{maxRows:integer(budget.maxRows,'budget.maxRows'),maxBytes:integer(budget.maxBytes,'budget.maxBytes'),timeoutMs:integer(budget.timeoutMs,'budget.timeoutMs')},
    ...(scenario === undefined ? {} : { scenario: scenario as NonNullable<StartSandboxRunRequest['scenario']> }),
  }
}

function requirePermission(principal: AuthPrincipal, permission: 'sandbox.read' | 'sandbox.run'): void {
  if (principal.permissions.includes('sandbox.admin') || principal.permissions.includes(permission)) return
  throw new IndustryAgentClientError('SANDBOX_ACCESS_DENIED', `missing permission: ${permission}`, 403)
}
function record(value:unknown):Record<string,unknown>{if(typeof value!=='object'||value===null||Array.isArray(value))throw new RequestBodyError('INVALID_JSON','request body must be an object',400);return value as Record<string,unknown>}
function only(value:Record<string,unknown>,allowed:readonly string[]):void{const bad=Object.keys(value).filter((key)=>!allowed.includes(key));if(bad.length>0)throw new RequestBodyError('INVALID_JSON',`unexpected fields: ${bad.join(', ')}`,400)}
function str(value:unknown,name:string):string{if(typeof value!=='string'||value.trim()==='')throw new RequestBodyError('INVALID_JSON',`${name} must be a non-empty string`,400);return value}
function integer(value:unknown,name:string):number{if(typeof value!=='number'||!Number.isInteger(value))throw new RequestBodyError('INVALID_JSON',`${name} must be an integer`,400);return value}
function decode(value:string):string{try{return decodeURIComponent(value)}catch{throw new RequestBodyError('INVALID_QUERY','invalid path encoding',400)}}
function sendData(response:ServerResponse,data:unknown,statusCode=200):true{response.writeHead(statusCode,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify({apiVersion:'industry-api-v1',data}));return true}
