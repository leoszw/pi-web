import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AgentLoopBudget, StartAgentLoopRunRequest } from '../../../shared/industry/agent-loop'
import type { AuthPrincipal } from './auth'
import type { IndustryAgentClient } from './clients/industry-agent-client'
import type { TrustedRequestContext } from './context'
import { RequestBodyError, readJsonBody } from '../security/request-limits'

export interface AgentLoopRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: IndustryAgentClient
  bodyLimitBytes: number
}

export async function handleAgentLoopRoute(options: AgentLoopRouteOptions): Promise<boolean> {
  const path = options.url.pathname
  if (!path.startsWith('/api/industry/v1/agent-loop')) return false
  if (path === '/api/industry/v1/agent-loop/runs' && options.request.method === 'GET') {
    requirePermission(options.principal, 'agent.loop.read')
    return sendData(options.response, await options.client.listAgentLoopRuns(options.context))
  }
  if (path === '/api/industry/v1/agent-loop/runs' && options.request.method === 'POST') {
    requirePermission(options.principal, 'agent.loop.run')
    const body = await readJsonBody(options.request, options.bodyLimitBytes)
    return sendData(options.response, await options.client.startAgentLoopRun(options.context, parseStart(body)), 201)
  }
  const runMatch = path.match(/^\/api\/industry\/v1\/agent-loop\/runs\/([^/]+)$/u)
  if (runMatch !== null && options.request.method === 'GET') {
    requirePermission(options.principal, 'agent.loop.read')
    return sendData(options.response, await options.client.getAgentLoopRun(options.context, decode(runMatch[1])))
  }
  return false
}

function parseStart(input: unknown): StartAgentLoopRunRequest {
  const value = record(input)
  only(value, ['goal','budget','scenario'])
  const budgetRecord = record(value.budget)
  only(budgetRecord, ['maxSteps','maxTools','maxTokens','maxCostUsd','timeoutMs'])
  const budget: AgentLoopBudget = {
    maxSteps: integer(budgetRecord.maxSteps,'budget.maxSteps'),
    maxTools: integer(budgetRecord.maxTools,'budget.maxTools'),
    maxTokens: integer(budgetRecord.maxTokens,'budget.maxTokens'),
    maxCostUsd: finite(budgetRecord.maxCostUsd,'budget.maxCostUsd'),
    timeoutMs: integer(budgetRecord.timeoutMs,'budget.timeoutMs'),
  }
  const scenario = value.scenario
  const allowed = ['SUCCESS','REPLAN','MAX_STEPS','MAX_TOOLS','TOKEN_COST','TIMEOUT','USAGE_INCOMPLETE','SCOPE_INJECTION','CRITICAL_TOOL'] as const
  if (scenario !== undefined && (typeof scenario !== 'string' || !allowed.includes(scenario as typeof allowed[number]))) throw new RequestBodyError('INVALID_JSON','scenario is invalid',400)
  return { goal: str(value.goal,'goal'), budget, ...(scenario === undefined ? {} : { scenario: scenario as NonNullable<StartAgentLoopRunRequest['scenario']> }) }
}

function requirePermission(principal: AuthPrincipal, permission: 'agent.loop.read'|'agent.loop.run'): void {
  if (principal.permissions.includes('agent.loop.admin') || principal.permissions.includes(permission)) return
  throw new RequestBodyError('INVALID_QUERY', `missing permission: ${permission}`, 403)
}
function record(value: unknown): Record<string, unknown> { if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new RequestBodyError('INVALID_JSON','request body must be an object',400); return value as Record<string, unknown> }
function only(value: Record<string, unknown>, allowed: readonly string[]): void { const bad = Object.keys(value).filter((key) => !allowed.includes(key)); if (bad.length > 0) throw new RequestBodyError('INVALID_JSON',`unexpected fields: ${bad.join(', ')}`,400) }
function str(value: unknown, name: string): string { if (typeof value !== 'string' || value.trim() === '') throw new RequestBodyError('INVALID_JSON',`${name} must be a non-empty string`,400); return value }
function integer(value: unknown, name: string): number { if (typeof value !== 'number' || !Number.isInteger(value)) throw new RequestBodyError('INVALID_JSON',`${name} must be an integer`,400); return value }
function finite(value: unknown, name: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new RequestBodyError('INVALID_JSON',`${name} must be a finite number`,400); return value }
function decode(value: string): string { try { return decodeURIComponent(value) } catch { throw new RequestBodyError('INVALID_QUERY','invalid path encoding',400) } }
function sendData(response: ServerResponse, data: unknown, statusCode = 200): true { response.writeHead(statusCode, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); response.end(JSON.stringify({apiVersion:'industry-api-v1',data})); return true }
