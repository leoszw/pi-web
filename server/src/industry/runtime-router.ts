import type { IncomingMessage, ServerResponse } from 'node:http'
import type { RuntimeComponent } from '../../../shared/industry/runtime'
import { RUNTIME_COMPONENTS } from '../../../shared/industry/runtime'
import type { AuthPrincipal } from './auth'
import { IndustryAgentClientError, type IndustryAgentClient } from './clients/industry-agent-client'
import type { TrustedRequestContext } from './context'
import { RequestBodyError, readJsonBody } from '../security/request-limits'

export interface RuntimeRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: IndustryAgentClient
  bodyLimitBytes: number
}

export async function handleRuntimeRoute(options: RuntimeRouteOptions): Promise<boolean> {
  const path=options.url.pathname
  if(!path.startsWith('/api/industry/v1/runtime'))return false
  if(path==='/api/industry/v1/runtime'&&options.request.method==='GET'){requirePermission(options.principal,'runtime.read');return sendData(options.response,await options.client.getRuntimeInventory(options.context))}
  if(path==='/api/industry/v1/runtime/config/drafts'&&options.request.method==='GET'){requirePermission(options.principal,'runtime.read');return sendData(options.response,await options.client.listRuntimeConfigDrafts(options.context))}
  if(path==='/api/industry/v1/runtime/config/drafts'&&options.request.method==='POST'){requirePermission(options.principal,'runtime.config.edit');const body=await readJsonBody(options.request,options.bodyLimitBytes);return sendData(options.response,await options.client.createRuntimeConfigDraft(options.context,parseCreateDraft(body)),201)}
  const actionMatch=path.match(/^\/api\/industry\/v1\/runtime\/config\/drafts\/([^/]+)\/(validate|save|eval)$/u)
  if(actionMatch!==null&&options.request.method==='POST'){
    requirePermission(options.principal,'runtime.config.edit');const body=await readJsonBody(options.request,options.bodyLimitBytes);requireEmptyObject(body);const draftId=decode(actionMatch[1]);const action=actionMatch[2]
    if(action==='validate')return sendData(options.response,await options.client.validateRuntimeConfigDraft(options.context,draftId))
    if(action==='save')return sendData(options.response,await options.client.saveRuntimeConfigDraft(options.context,draftId))
    return sendData(options.response,await options.client.evaluateRuntimeConfigDraft(options.context,draftId))
  }
  const detailMatch=path.match(/^\/api\/industry\/v1\/runtime\/config\/drafts\/([^/]+)$/u)
  if(detailMatch!==null&&options.request.method==='GET'){requirePermission(options.principal,'runtime.read');return sendData(options.response,await options.client.getRuntimeConfigDraft(options.context,decode(detailMatch[1])))}
  return false
}

function parseCreateDraft(input:unknown){const value=record(input);only(value,['changes']);if(!Array.isArray(value.changes))throw new RequestBodyError('INVALID_JSON','changes must be an array',400);const changes=value.changes.map((item,index)=>{const row=record(item);only(row,['component','adapter','endpointAlias']);if(typeof row.component!=='string'||!RUNTIME_COMPONENTS.includes(row.component as RuntimeComponent))throw new RequestBodyError('INVALID_JSON',`changes[${index}].component is invalid`,400);return{component:row.component as RuntimeComponent,...(row.adapter===undefined?{}:{adapter:str(row.adapter,`changes[${index}].adapter`)}),...(row.endpointAlias===undefined?{}:{endpointAlias:str(row.endpointAlias,`changes[${index}].endpointAlias`)})}});return{changes}}
function requirePermission(principal:AuthPrincipal,permission:'runtime.read'|'runtime.config.edit'):void{if(principal.permissions.includes('runtime.admin')||principal.permissions.includes(permission))return;throw new IndustryAgentClientError('RUNTIME_ACCESS_DENIED',`missing permission: ${permission}`,403)}
function requireEmptyObject(input:unknown):void{const value=record(input);if(Object.keys(value).length>0)throw new RequestBodyError('INVALID_JSON','request body must be an empty object',400)}
function record(value:unknown):Record<string,unknown>{if(typeof value!=='object'||value===null||Array.isArray(value))throw new RequestBodyError('INVALID_JSON','request body must be an object',400);return value as Record<string,unknown>}
function only(value:Record<string,unknown>,allowed:readonly string[]):void{const bad=Object.keys(value).filter((key)=>!allowed.includes(key));if(bad.length>0)throw new RequestBodyError('INVALID_JSON',`unexpected fields: ${bad.join(', ')}`,400)}
function str(value:unknown,name:string):string{if(typeof value!=='string'||value.trim()==='')throw new RequestBodyError('INVALID_JSON',`${name} must be a non-empty string`,400);return value}
function decode(value:string):string{try{return decodeURIComponent(value)}catch{throw new RequestBodyError('INVALID_QUERY','invalid path encoding',400)}}
function sendData(response:ServerResponse,data:unknown,statusCode=200):true{response.writeHead(statusCode,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify({apiVersion:'industry-api-v1',data}));return true}
