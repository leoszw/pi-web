import type { IncomingMessage, ServerResponse } from 'node:http'
import type { EVAL_API_VERSION } from '../../../../shared/industry/eval/common'
import type { EvalVariantSummary } from '../../../../shared/industry/eval/common'
import type { CreateIntentDraftCaseRequest, EvalDatasetSummary, IntentDatasetDetail, IntentEvalCase, IntentName, IntentTurn } from '../../../../shared/industry/eval/datasets'
import type {
  MutationEvalCase,
  MutationEvalFailureSummary,
  MutationEvalObservation,
  MutationEvalRunSummary,
  MutationEvalVariant,
  StartMutationEvalRunRequest,
} from '../../../../shared/industry/eval/mutation'
import type {
  RetrievalComparisonType,
  RetrievalDomain,
  RetrievalEvalCase,
  RetrievalEvalObservation,
  RetrievalLeakageReport,
  RetrievalPlaygroundRequest,
  RetrievalPlaygroundResult,
  RetrievalRunComparison,
  RetrievalRunSummary,
  StartRetrievalRunRequest,
} from '../../../../shared/industry/eval/retrieval'
import type { EvalRunSummary, IntentEvalObservation, IntentPlaygroundRequest, IntentRunComparison, StartIntentRunRequest } from '../../../../shared/industry/eval/runs'
import type { AuthPrincipal } from '../auth'
import type { TrustedRequestContext } from '../context'
import { RequestBodyError, readJsonBody } from '../../security/request-limits'
import { EvaluationClientError, type EvaluationClient } from './evaluation-client'

export interface EvalRouteOptions {
  request: IncomingMessage
  response: ServerResponse
  url: URL
  requestId: string
  principal: AuthPrincipal
  context: TrustedRequestContext
  client: EvaluationClient
  bodyLimitBytes: number
}

type EvalResponse<T> = {
  apiVersion: typeof EVAL_API_VERSION
  data: T
}

export async function handleEvalRoute(options: EvalRouteOptions): Promise<boolean> {
  const path = options.url.pathname
  if (!path.startsWith('/api/industry/v1/eval/')) return false

  try {
    if (path === '/api/industry/v1/eval/variants' && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listVariants(options.context))
    }

    if (path === '/api/industry/v1/eval/datasets' && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listDatasets(options.context))
    }

    const datasetMatch = path.match(/^\/api\/industry\/v1\/eval\/datasets\/([^/]+)$/u)
    if (datasetMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.getDataset(options.context, decodeSegment(datasetMatch[1])))
    }

    const casesMatch = path.match(/^\/api\/industry\/v1\/eval\/datasets\/([^/]+)\/cases$/u)
    if (casesMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listCases(options.context, decodeSegment(casesMatch[1])))
    }
    if (casesMatch !== null && options.request.method === 'POST') {
      requirePermission(options.principal, 'eval.dataset.edit')
      const body = await readJsonBody(options.request, options.bodyLimitBytes)
      return sendData(
        options.response,
        await options.client.createDraftCase(options.context, decodeSegment(casesMatch[1]), parseCreateDraftCaseRequest(body)),
        201,
      )
    }

    if (path === '/api/industry/v1/eval/playground/intent' && options.request.method === 'POST') {
      requirePermission(options.principal, 'eval.playground')
      const body = await readJsonBody(options.request, options.bodyLimitBytes)
      return sendData(options.response, await options.client.playgroundIntent(options.context, parsePlaygroundRequest(body)))
    }

    if (path === '/api/industry/v1/eval/retrieval/cases' && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listRetrievalCases(options.context))
    }

    if (path === '/api/industry/v1/eval/playground/retrieval' && options.request.method === 'POST') {
      requirePermission(options.principal, 'eval.playground')
      const body = await readJsonBody(options.request, options.bodyLimitBytes)
      return sendData(options.response, await options.client.playgroundRetrieval(options.context, parseRetrievalPlaygroundRequest(body)))
    }

    if (path === '/api/industry/v1/eval/retrieval/leakage' && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.getRetrievalLeakageReport(options.context))
    }

    if (path === '/api/industry/v1/eval/retrieval/runs' && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listRetrievalRuns(options.context))
    }

    if (path === '/api/industry/v1/eval/retrieval/runs' && options.request.method === 'POST') {
      requirePermission(options.principal, 'eval.run')
      const body = await readJsonBody(options.request, options.bodyLimitBytes)
      return sendData(options.response, await options.client.startRetrievalRun(options.context, parseStartRetrievalRunRequest(body)), 201)
    }

    const retrievalObservationsMatch = path.match(/^\/api\/industry\/v1\/eval\/retrieval\/runs\/([^/]+)\/observations$/u)
    if (retrievalObservationsMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listRetrievalObservations(options.context, decodeSegment(retrievalObservationsMatch[1])))
    }

    const retrievalRunMatch = path.match(/^\/api\/industry\/v1\/eval\/retrieval\/runs\/([^/]+)$/u)
    if (retrievalRunMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.getRetrievalRun(options.context, decodeSegment(retrievalRunMatch[1])))
    }

    if (path === '/api/industry/v1/eval/retrieval/compare' && options.request.method === 'POST') {
      requirePermission(options.principal, 'eval.read')
      const body = await readJsonBody(options.request, options.bodyLimitBytes)
      const compare = parseRetrievalCompareRequest(body)
      return sendData(options.response, await options.client.compareRetrievalRuns(options.context, compare.baselineRunId, compare.candidateRunId, compare.comparisonType))
    }

    if (path === '/api/industry/v1/eval/mutation/cases' && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listMutationEvalCases(options.context))
    }

    if (path === '/api/industry/v1/eval/mutation/runs' && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listMutationEvalRuns(options.context))
    }

    if (path === '/api/industry/v1/eval/mutation/runs' && options.request.method === 'POST') {
      requirePermission(options.principal, 'eval.run')
      const body = await readJsonBody(options.request, options.bodyLimitBytes)
      return sendData(options.response, await options.client.startMutationEvalRun(options.context, parseStartMutationEvalRunRequest(body)), 201)
    }

    const mutationFailuresMatch = path.match(/^\/api\/industry\/v1\/eval\/mutation\/runs\/([^/]+)\/failures$/u)
    if (mutationFailuresMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listMutationEvalFailures(options.context, decodeSegment(mutationFailuresMatch[1])))
    }

    const mutationObservationsMatch = path.match(/^\/api\/industry\/v1\/eval\/mutation\/runs\/([^/]+)\/observations$/u)
    if (mutationObservationsMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listMutationEvalObservations(options.context, decodeSegment(mutationObservationsMatch[1])))
    }

    const mutationRunMatch = path.match(/^\/api\/industry\/v1\/eval\/mutation\/runs\/([^/]+)$/u)
    if (mutationRunMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.getMutationEvalRun(options.context, decodeSegment(mutationRunMatch[1])))
    }

    if (path === '/api/industry/v1/eval/runs' && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listRuns(options.context))
    }

    if (path === '/api/industry/v1/eval/runs' && options.request.method === 'POST') {
      requirePermission(options.principal, 'eval.run')
      const body = await readJsonBody(options.request, options.bodyLimitBytes)
      return sendData(options.response, await options.client.startIntentRun(options.context, parseStartRunRequest(body)), 201)
    }

    const observationsMatch = path.match(/^\/api\/industry\/v1\/eval\/runs\/([^/]+)\/observations$/u)
    if (observationsMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.listObservations(options.context, decodeSegment(observationsMatch[1])))
    }

    const runMatch = path.match(/^\/api\/industry\/v1\/eval\/runs\/([^/]+)$/u)
    if (runMatch !== null && options.request.method === 'GET') {
      requirePermission(options.principal, 'eval.read')
      return sendData(options.response, await options.client.getRun(options.context, decodeSegment(runMatch[1])))
    }

    if (path === '/api/industry/v1/eval/compare' && options.request.method === 'POST') {
      requirePermission(options.principal, 'eval.read')
      const body = await readJsonBody(options.request, options.bodyLimitBytes)
      const compare = parseCompareRequest(body)
      return sendData(options.response, await options.client.compareRuns(options.context, compare.baselineRunId, compare.candidateRunId))
    }

    return false
  } catch (error) {
    if (error instanceof EvalAccessError || error instanceof EvaluationClientError || error instanceof RequestBodyError) {
      sendError(options.response, options.requestId, error.code, error.message, error.statusCode)
      return true
    }
    throw error
  }
}

function requirePermission(principal: AuthPrincipal, permission: 'eval.read' | 'eval.playground' | 'eval.run' | 'eval.dataset.edit'): void {
  if (principal.permissions.includes('eval.admin') || principal.permissions.includes(permission)) return
  throw new EvalAccessError('EVAL_ACCESS_DENIED', `missing permission: ${permission}`, 403)
}

class EvalAccessError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(code: string, message: string, statusCode: number) {
    super(message)
    this.name = 'EvalAccessError'
    this.code = code
    this.statusCode = statusCode
  }
}

function parsePlaygroundRequest(input: unknown): IntentPlaygroundRequest {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['query', 'previousTurns', 'variantId'])
  const query = requireNonEmptyString(record.query, 'query')
  const variantId = requireNonEmptyString(record.variantId, 'variantId')
  if (!Array.isArray(record.previousTurns)) throw new RequestBodyError('INVALID_JSON', 'previousTurns must be an array', 400)
  const previousTurns = record.previousTurns.map((item, index) => parseTurn(item, index))
  return { query, previousTurns, variantId }
}

function parseRetrievalPlaygroundRequest(input: unknown): RetrievalPlaygroundRequest {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['query', 'domain', 'variantId'])
  return {
    query: requireNonEmptyString(record.query, 'query'),
    domain: parseRetrievalDomain(record.domain),
    variantId: requireNonEmptyString(record.variantId, 'variantId'),
  }
}

function parseRetrievalDomain(value: unknown): RetrievalDomain {
  if (value === 'ENGINEERING' || value === 'BOQ') return value
  throw new RequestBodyError('INVALID_JSON', 'domain must be ENGINEERING or BOQ', 400)
}

function parseCreateDraftCaseRequest(input: unknown): CreateIntentDraftCaseRequest {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['query', 'previousTurns', 'expected', 'tags', 'difficulty', 'critical', 'notes'])
  const query = requireNonEmptyString(record.query, 'query')
  if (!Array.isArray(record.previousTurns)) throw new RequestBodyError('INVALID_JSON', 'previousTurns must be an array', 400)
  const previousTurns = record.previousTurns.map((item, index) => parseTurn(item, index))
  const expectedRecord = requireRecord(record.expected)
  assertOnlyKeys(expectedRecord, ['primaryIntent', 'acceptableIntents', 'mustNot'])
  if (!isIntentName(expectedRecord.primaryIntent)) throw new RequestBodyError('INVALID_JSON', 'expected.primaryIntent is invalid', 400)
  const acceptableIntents = parseIntentArray(expectedRecord.acceptableIntents, 'expected.acceptableIntents')
  const mustNot = parseIntentArray(expectedRecord.mustNot, 'expected.mustNot')
  if (!acceptableIntents.includes(expectedRecord.primaryIntent)) throw new RequestBodyError('INVALID_JSON', 'expected.acceptableIntents must include primaryIntent', 400)
  if (mustNot.includes(expectedRecord.primaryIntent)) throw new RequestBodyError('INVALID_JSON', 'expected.mustNot cannot include primaryIntent', 400)
  const tags = parseStringArray(record.tags, 'tags')
  if (record.difficulty !== 'NORMAL' && record.difficulty !== 'HARD' && record.difficulty !== 'ADVERSARIAL') throw new RequestBodyError('INVALID_JSON', 'difficulty is invalid', 400)
  if (typeof record.critical !== 'boolean') throw new RequestBodyError('INVALID_JSON', 'critical must be boolean', 400)
  if (record.notes !== undefined && (typeof record.notes !== 'string' || record.notes.length > 2000)) throw new RequestBodyError('INVALID_JSON', 'notes must be a string up to 2000 characters', 400)
  return {
    query,
    previousTurns,
    expected: { primaryIntent: expectedRecord.primaryIntent, acceptableIntents, mustNot },
    tags,
    difficulty: record.difficulty,
    critical: record.critical,
    ...(record.notes === undefined ? {} : { notes: record.notes }),
  }
}

function parseIntentArray(value: unknown, field: string): IntentName[] {
  if (!Array.isArray(value) || value.some((item) => !isIntentName(item))) throw new RequestBodyError('INVALID_JSON', `${field} must be an array of valid intents`, 400)
  return [...new Set(value as IntentName[])]
}

function parseStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) throw new RequestBodyError('INVALID_JSON', `${field} must be an array of non-empty strings`, 400)
  return [...new Set(value as string[])].slice(0, 20)
}

function parseStartRunRequest(input: unknown): StartIntentRunRequest {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['datasetId', 'variantId'])
  return { datasetId: requireNonEmptyString(record.datasetId, 'datasetId'), variantId: requireNonEmptyString(record.variantId, 'variantId') }
}

function parseStartRetrievalRunRequest(input: unknown): StartRetrievalRunRequest {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['datasetId', 'variantId'])
  return { datasetId: requireNonEmptyString(record.datasetId, 'datasetId'), variantId: requireNonEmptyString(record.variantId, 'variantId') }
}

function parseStartMutationEvalRunRequest(input: unknown): StartMutationEvalRunRequest {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['datasetId', 'variantId'])
  return {
    datasetId: requireNonEmptyString(record.datasetId, 'datasetId'),
    variantId: parseMutationEvalVariant(record.variantId),
  }
}

function parseMutationEvalVariant(value: unknown): MutationEvalVariant {
  if (value === 'mutation-unsafe-v0' || value === 'mutation-guarded-v1') return value
  throw new RequestBodyError('INVALID_JSON', 'variantId must be mutation-unsafe-v0 or mutation-guarded-v1', 400)
}

function parseCompareRequest(input: unknown): { baselineRunId: string; candidateRunId: string } {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['baselineRunId', 'candidateRunId'])
  return { baselineRunId: requireNonEmptyString(record.baselineRunId, 'baselineRunId'), candidateRunId: requireNonEmptyString(record.candidateRunId, 'candidateRunId') }
}

function parseRetrievalCompareRequest(input: unknown): { baselineRunId: string; candidateRunId: string; comparisonType: RetrievalComparisonType } {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['baselineRunId', 'candidateRunId', 'comparisonType'])
  return {
    baselineRunId: requireNonEmptyString(record.baselineRunId, 'baselineRunId'),
    candidateRunId: requireNonEmptyString(record.candidateRunId, 'candidateRunId'),
    comparisonType: parseRetrievalComparisonType(record.comparisonType),
  }
}

function parseRetrievalComparisonType(value: unknown): RetrievalComparisonType {
  if (value === 'EMBEDDING' || value === 'RERANKER' || value === 'CONFIG') return value
  throw new RequestBodyError('INVALID_JSON', 'comparisonType must be EMBEDDING, RERANKER, or CONFIG', 400)
}

function parseTurn(input: unknown, index: number): IntentTurn {
  const record = requireRecord(input)
  assertOnlyKeys(record, ['role', 'text', 'resolvedIntent'])
  if (record.role !== 'user' && record.role !== 'assistant') throw new RequestBodyError('INVALID_JSON', `previousTurns[${index}].role must be user or assistant`, 400)
  const text = requireNonEmptyString(record.text, `previousTurns[${index}].text`)
  if (record.resolvedIntent === undefined) return { role: record.role, text }
  if (!isIntentName(record.resolvedIntent)) throw new RequestBodyError('INVALID_JSON', `previousTurns[${index}].resolvedIntent is invalid`, 400)
  return { role: record.role, text, resolvedIntent: record.resolvedIntent }
}

function isIntentName(value: unknown): value is IntentName {
  return value === 'QUERY_BOQ' || value === 'QUERY_ENGINEERING_POSITION' || value === 'QUERY_QUANTITY' || value === 'RAG_QA' || value === 'MUTATION' || value === 'UNKNOWN'
}

function requireRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new RequestBodyError('INVALID_JSON', 'request body must be an object', 400)
  return input as Record<string, unknown>
}

function assertOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed)
  const unexpected = Object.keys(record).filter((key) => !allowedSet.has(key))
  if (unexpected.length > 0) throw new RequestBodyError('INVALID_JSON', `unexpected request fields: ${unexpected.join(', ')}`, 400)
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new RequestBodyError('INVALID_JSON', `${field} must be a non-empty string`, 400)
  return value
}

function decodeSegment(value: string | undefined): string {
  if (value === undefined) throw new RequestBodyError('INVALID_JSON', 'missing path segment', 400)
  try {
    return decodeURIComponent(value)
  } catch {
    throw new RequestBodyError('INVALID_JSON', 'invalid path encoding', 400)
  }
}

function sendData(
  response: ServerResponse,
  data:
    | readonly EvalVariantSummary[]
    | readonly EvalDatasetSummary[]
    | IntentDatasetDetail
    | readonly IntentEvalCase[]
    | IntentEvalCase
    | EvalRunSummary
    | readonly EvalRunSummary[]
    | readonly IntentEvalObservation[]
    | IntentRunComparison
    | readonly RetrievalEvalCase[]
    | RetrievalPlaygroundResult
    | RetrievalLeakageReport
    | RetrievalRunSummary
    | readonly RetrievalRunSummary[]
    | readonly RetrievalEvalObservation[]
    | RetrievalRunComparison
    | readonly MutationEvalCase[]
    | MutationEvalRunSummary
    | readonly MutationEvalRunSummary[]
    | readonly MutationEvalObservation[]
    | readonly MutationEvalFailureSummary[]
    | Awaited<ReturnType<EvaluationClient['playgroundIntent']>>,
  statusCode = 200,
): true {
  const body: EvalResponse<typeof data> = { apiVersion: 'eval-api-v1', data }
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(body))
  return true
}

function sendError(response: ServerResponse, requestId: string, code: string, message: string, statusCode: number): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify({ error: { requestId, code, message, retryable: false } }))
}
