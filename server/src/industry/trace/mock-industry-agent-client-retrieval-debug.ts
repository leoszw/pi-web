import type { RetrievalDebugResult } from '../../../../shared/industry/retrieval-debug'
import type { TrustedRequestContext } from '../context'
import { buildRetrievalPlaygroundFixture } from '../eval/retrieval-fixtures'
import { IndustryAgentClientError } from '../clients/industry-agent-client'
import { MockIndustryAgentClient } from '../clients/mock-industry-agent-client'

declare module '../clients/mock-industry-agent-client' {
  interface MockIndustryAgentClient {
    getRetrievalDebug(context: TrustedRequestContext, traceId: string): Promise<RetrievalDebugResult>
  }
}

MockIndustryAgentClient.prototype.getRetrievalDebug = async function getRetrievalDebug(
  context: TrustedRequestContext,
  traceId: string,
): Promise<RetrievalDebugResult> {
  const projectId = requireProject(context)
  const expectedTraceId = `trace-${safeId(projectId)}-retrieval-001`
  if (traceId !== expectedTraceId) {
    if (traceId.startsWith(`trace-${safeId(projectId)}-`)) {
      throw new IndustryAgentClientError('TRACE_RETRIEVAL_DEBUG_UNAVAILABLE', 'retrieval debug is only available for retrieval traces', 409)
    }
    throw new IndustryAgentClientError('TRACE_NOT_FOUND', 'trace not found', 404)
  }

  const fixture = buildRetrievalPlaygroundFixture('retrieval-engineering-001', 'retrieval-stable-v1')
  return {
    traceId,
    source: 'TRACE',
    queryContext: {
      ...fixture.queryContext,
      projectId,
      query: 'K12+300到K12+800左幅有哪些路基工程部位',
      normalizedQuery: 'k12+300到k12+800左幅有哪些路基工程部位',
      domain: 'ENGINEERING',
    },
    stages: fixture.stages.map((stage) => ({
      ...stage,
      candidates: stage.candidates.map((candidate) => ({ ...candidate, projectId })),
    })),
    notes: [
      'Single-trace debug snapshot reconstructed from deterministic trace fixture.',
      'Debug is not an evaluation run: no dataset aggregation, comparison, or release conclusion is produced here.',
    ],
  }
}

function requireProject(context: TrustedRequestContext): string {
  if (context.projectId === null) throw new IndustryAgentClientError('INDUSTRY_PROJECT_REQUIRED', 'active project is required', 409)
  return context.projectId
}

function safeId(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9_-]/gu, '-').slice(0, 48)
  return normalized === '' ? 'project' : normalized
}
