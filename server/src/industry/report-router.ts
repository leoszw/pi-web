import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AuthPrincipal } from './auth'
import { IndustryAgentClientError, type IndustryAgentClient } from './clients/industry-agent-client'
import type { TrustedRequestContext } from './context'
import { RequestBodyError, readJsonBody } from '../security/request-limits'

export interface ReportRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: IndustryAgentClient
  bodyLimitBytes: number
}

export async function handleReportRoute(options: ReportRouteOptions): Promise<boolean> {
  const path = options.url.pathname
  if (!path.startsWith('/api/industry/v1/reports')) return false
  if (path === '/api/industry/v1/reports' && options.request.method === 'GET') {
    requirePermission(options.principal, 'report.read')
    return sendData(options.response, await options.client.listReports(options.context))
  }
  const downloadMatch = path.match(/^\/api\/industry\/v1\/reports\/([^/]+)\/download$/u)
  if (downloadMatch !== null && options.request.method === 'POST') {
    requireDownloadPermissions(options.principal)
    const body = await readJsonBody(options.request, options.bodyLimitBytes)
    requireEmptyBody(body)
    return sendData(options.response, await options.client.createReportDownloadGrant(options.context, decode(downloadMatch[1])), 201)
  }
  const detailMatch = path.match(/^\/api\/industry\/v1\/reports\/([^/]+)$/u)
  if (detailMatch !== null && options.request.method === 'GET') {
    requirePermission(options.principal, 'report.read')
    return sendData(options.response, await options.client.getReport(options.context, decode(detailMatch[1])))
  }
  return false
}

function requireEmptyBody(value: unknown): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).length !== 0) throw new RequestBodyError('INVALID_JSON','report download request body must be an empty object',400)
}
function requireDownloadPermissions(principal:AuthPrincipal):void{
  if(principal.permissions.includes('report.admin'))return
  if(principal.permissions.includes('report.read')&&principal.permissions.includes('report.download'))return
  throw new IndustryAgentClientError('REPORT_ACCESS_DENIED','report download requires report.read and report.download',403)
}
function requirePermission(principal: AuthPrincipal, permission: 'report.read' | 'report.download'): void {
  if (principal.permissions.includes('report.admin') || principal.permissions.includes(permission)) return
  throw new IndustryAgentClientError('REPORT_ACCESS_DENIED', `missing permission: ${permission}`, 403)
}
function decode(value:string):string { try { return decodeURIComponent(value) } catch { throw new RequestBodyError('INVALID_QUERY','invalid path encoding',400) } }
function sendData(response:ServerResponse,data:unknown,statusCode=200):true { response.writeHead(statusCode,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); response.end(JSON.stringify({apiVersion:'industry-api-v1',data})); return true }
