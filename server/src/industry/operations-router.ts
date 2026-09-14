import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AuthPrincipal } from './auth'
import { IndustryAgentClientError, type IndustryAgentClient } from './clients/industry-agent-client'
import type { TrustedRequestContext } from './context'

export interface OperationsRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: IndustryAgentClient
}

export async function handleOperationsRoute(options: OperationsRouteOptions): Promise<boolean> {
  if(options.url.pathname!=='/api/industry/v1/operations/readiness')return false
  if(options.request.method!=='GET')return false
  if(!options.principal.permissions.includes('operations.admin')&&!options.principal.permissions.includes('operations.read'))throw new IndustryAgentClientError('OPERATIONS_ACCESS_DENIED','missing permission: operations.read',403)
  options.response.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'})
  options.response.end(JSON.stringify({apiVersion:'industry-api-v1',data:await options.client.getOperationsReadiness(options.context)}))
  return true
}
