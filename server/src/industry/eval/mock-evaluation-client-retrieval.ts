import type {
  RetrievalEvalCase,
  RetrievalLeakageReport,
  RetrievalPlaygroundRequest,
  RetrievalPlaygroundResult,
} from '../../../../shared/industry/eval/retrieval'
import type { TrustedRequestContext } from '../context'
import { EvaluationClientError } from './evaluation-client'
import { MockEvaluationClient } from './mock-evaluation-client'
import {
  RETRIEVAL_CASE_FIXTURES,
  buildRetrievalLeakageFixture,
  buildRetrievalPlaygroundFixture,
} from './retrieval-fixtures'

declare module './mock-evaluation-client' {
  interface MockEvaluationClient {
    listRetrievalCases(context: TrustedRequestContext): Promise<readonly RetrievalEvalCase[]>
    playgroundRetrieval(context: TrustedRequestContext, request: RetrievalPlaygroundRequest): Promise<RetrievalPlaygroundResult>
    getRetrievalLeakageReport(context: TrustedRequestContext): Promise<RetrievalLeakageReport>
  }
}

MockEvaluationClient.prototype.listRetrievalCases = async function listRetrievalCases(
  context: TrustedRequestContext,
): Promise<readonly RetrievalEvalCase[]> {
  const projectId = requireProject(context)
  return RETRIEVAL_CASE_FIXTURES.map((item) => ({
    ...structuredClone(item),
    queryContext: { ...structuredClone(item.queryContext), projectId },
    expected: { ...structuredClone(item.expected), expectedProjectId: projectId },
  }))
}

MockEvaluationClient.prototype.playgroundRetrieval = async function playgroundRetrieval(
  context: TrustedRequestContext,
  request: RetrievalPlaygroundRequest,
): Promise<RetrievalPlaygroundResult> {
  const projectId = requireProject(context)
  requireRetrievalVariant(request.variantId)
  const fixtureId = request.domain === 'ENGINEERING' ? 'retrieval-engineering-001' : 'retrieval-boq-001'
  const fixture = buildRetrievalPlaygroundFixture(fixtureId, request.variantId)
  return {
    ...fixture,
    queryContext: {
      ...fixture.queryContext,
      projectId,
      query: request.query,
      normalizedQuery: normalizeQuery(request.query),
      domain: request.domain,
    },
    stages: fixture.stages.map((stage) => ({
      ...stage,
      candidates: stage.candidates.map((candidate) => ({ ...candidate, projectId })),
    })),
  }
}

MockEvaluationClient.prototype.getRetrievalLeakageReport = async function getRetrievalLeakageReport(
  context: TrustedRequestContext,
): Promise<RetrievalLeakageReport> {
  requireProject(context)
  return structuredClone(buildRetrievalLeakageFixture())
}

function requireProject(context: TrustedRequestContext): string {
  if (context.projectId === null) {
    throw new EvaluationClientError('EVAL_PROJECT_REQUIRED', 'active project is required for retrieval evaluation', 409)
  }
  return context.projectId
}

function requireRetrievalVariant(variantId: string): void {
  if (variantId === 'retrieval-stable-v1' || variantId === 'retrieval-candidate-v2') return
  throw new EvaluationClientError('EVAL_VARIANT_NOT_FOUND', 'retrieval evaluation variant not found', 404)
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/gu, ' ')
}
