import { randomUUID } from 'node:crypto'
import type { AgentLoopBudget, AgentLoopRun, AgentLoopStep, StartAgentLoopRunRequest } from '../../../../shared/industry/agent-loop'
import type {
  CreateMultimodalAnalysisRequest,
  MultimodalAnalysis,
  MultimodalObservation,
  ReviewMultimodalObservationRequest,
} from '../../../../shared/industry/multimodal'
import type { TrustedRequestContext } from '../context'
import { IndustryAgentClientError } from '../clients/industry-agent-client'
import { MockIndustryAgentClient } from '../clients/mock-industry-agent-client'

const ANALYSES = new WeakMap<MockIndustryAgentClient, Map<string, Map<string, MultimodalAnalysis>>>()
const LOOPS = new WeakMap<MockIndustryAgentClient, Map<string, Map<string, AgentLoopRun>>>()
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const DEFAULT_BUDGET: AgentLoopBudget = { maxSteps: 8, maxTools: 4, maxTokens: 4000, maxCostUsd: 1, timeoutMs: 30_000 }

declare module '../clients/mock-industry-agent-client' {
  interface MockIndustryAgentClient {
    listMultimodalAnalyses(context: TrustedRequestContext): Promise<readonly MultimodalAnalysis[]>
    createMultimodalAnalysis(context: TrustedRequestContext, request: CreateMultimodalAnalysisRequest): Promise<MultimodalAnalysis>
    getMultimodalAnalysis(context: TrustedRequestContext, analysisId: string): Promise<MultimodalAnalysis>
    reviewMultimodalObservation(context: TrustedRequestContext, analysisId: string, observationId: string, request: ReviewMultimodalObservationRequest): Promise<MultimodalAnalysis>
    listAgentLoopRuns(context: TrustedRequestContext): Promise<readonly AgentLoopRun[]>
    startAgentLoopRun(context: TrustedRequestContext, request: StartAgentLoopRunRequest): Promise<AgentLoopRun>
    getAgentLoopRun(context: TrustedRequestContext, runId: string): Promise<AgentLoopRun>
  }
}

MockIndustryAgentClient.prototype.listMultimodalAnalyses = async function listMultimodalAnalyses(context) {
  const projectId = requireProject(context)
  const store = analysisStore(this, projectId)
  seedAnalyses(store, projectId)
  return structuredClone([...store.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
}
MockIndustryAgentClient.prototype.createMultimodalAnalysis = async function createMultimodalAnalysis(context, request) {
  const projectId = requireProject(context)
  validateImageRequest(request)
  const now = new Date().toISOString()
  const analysisId = `analysis-${randomUUID()}`
  const analysis = buildAnalysis(analysisId, projectId, request, now)
  analysisStore(this, projectId).set(analysisId, analysis)
  return structuredClone(analysis)
}
MockIndustryAgentClient.prototype.getMultimodalAnalysis = async function getMultimodalAnalysis(context, analysisId) {
  return structuredClone(requireAnalysis(this, requireProject(context), analysisId))
}
MockIndustryAgentClient.prototype.reviewMultimodalObservation = async function reviewMultimodalObservation(context, analysisId, observationId, request) {
  const projectId = requireProject(context)
  const analysis = requireAnalysis(this, projectId, analysisId)
  const observation = analysis.observations.find((item) => item.observationId === observationId)
  if (observation === undefined) throw new IndustryAgentClientError('MULTIMODAL_OBSERVATION_NOT_FOUND', 'multimodal observation not found', 404)
  const candidateIds = new Set(observation.entityCandidates.map((item) => item.entityId))
  if (request.selectedEntityId !== undefined && !candidateIds.has(request.selectedEntityId)) throw new IndustryAgentClientError('MULTIMODAL_ENTITY_NOT_ALLOWED', 'selected entity is outside the server-issued candidates', 400)
  const allowedFields = new Set(observation.fields.map((field) => field.name))
  for (const key of Object.keys(request.correctedFields ?? {})) if (!allowedFields.has(key)) throw new IndustryAgentClientError('MULTIMODAL_FIELD_NOT_ALLOWED', 'corrected field is not present in the observation schema', 400)
  if (request.decision === 'ACCEPT' && request.correctedFields !== undefined) throw new IndustryAgentClientError('MULTIMODAL_REVIEW_INVALID', 'ACCEPT cannot mutate fields', 400)
  if (request.decision === 'REJECT' && (request.correctedFields !== undefined || request.selectedEntityId !== undefined)) throw new IndustryAgentClientError('MULTIMODAL_REVIEW_INVALID', 'REJECT cannot mutate fields or entity selection', 400)
  if (request.decision === 'CORRECT' && request.correctedFields === undefined && request.selectedEntityId === undefined) throw new IndustryAgentClientError('MULTIMODAL_REVIEW_INVALID', 'CORRECT requires a field correction or entity selection', 400)
  const corrections = request.decision === 'CORRECT' ? request.correctedFields ?? {} : {}
  const updated: MultimodalObservation = {
    ...observation,
    selectedEntityId: request.decision === 'REJECT' ? observation.selectedEntityId : request.selectedEntityId ?? observation.selectedEntityId,
    fields: observation.fields.map((field) => corrections[field.name] === undefined ? field : { ...field, value: corrections[field.name]!, confidence: 1, missing: false }),
    missingFields: observation.missingFields.filter((name) => corrections[name] === undefined),
    reviewStatus: request.decision === 'ACCEPT' ? 'ACCEPTED' : request.decision === 'CORRECT' ? 'CORRECTED' : 'REJECTED',
    ...(request.note === undefined ? {} : { reviewNote: request.note }),
  }
  const next: MultimodalAnalysis = { ...analysis, observations: analysis.observations.map((item) => item.observationId === observationId ? updated : item), updatedAt: new Date().toISOString() }
  analysisStore(this, projectId).set(analysisId, next)
  return structuredClone(next)
}
MockIndustryAgentClient.prototype.listAgentLoopRuns = async function listAgentLoopRuns(context) {
  const projectId = requireProject(context)
  const store = loopStore(this, projectId)
  seedLoops(store, projectId)
  return structuredClone([...store.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
}
MockIndustryAgentClient.prototype.startAgentLoopRun = async function startAgentLoopRun(context, request) {
  const projectId = requireProject(context)
  validateLoopRequest(request)
  const run = buildLoopRun(`agent-loop-${randomUUID()}`, projectId, request.goal, request.budget, request.scenario ?? 'SUCCESS')
  loopStore(this, projectId).set(run.runId, run)
  return structuredClone(run)
}
MockIndustryAgentClient.prototype.getAgentLoopRun = async function getAgentLoopRun(context, runId) {
  const projectId = requireProject(context)
  const store = loopStore(this, projectId)
  seedLoops(store, projectId)
  const run = store.get(runId)
  if (run === undefined) throw new IndustryAgentClientError('AGENT_LOOP_RUN_NOT_FOUND', 'agent loop run not found', 404)
  return structuredClone(run)
}

function analysisStore(client: MockIndustryAgentClient, projectId: string): Map<string, MultimodalAnalysis> {
  let projects = ANALYSES.get(client); if (projects === undefined) { projects = new Map(); ANALYSES.set(client, projects) }
  let store = projects.get(projectId); if (store === undefined) { store = new Map(); projects.set(projectId, store) }
  return store
}
function loopStore(client: MockIndustryAgentClient, projectId: string): Map<string, AgentLoopRun> {
  let projects = LOOPS.get(client); if (projects === undefined) { projects = new Map(); LOOPS.set(client, projects) }
  let store = projects.get(projectId); if (store === undefined) { store = new Map(); projects.set(projectId, store) }
  return store
}
function seedAnalyses(store: Map<string, MultimodalAnalysis>, projectId: string): void {
  if (store.size > 0) return
  const now = '2026-09-13T07:30:00.000Z'
  const seeded = buildAnalysis('analysis-mock-low-confidence', projectId, { fileName: 'bridge-pier-low-confidence.jpg', mimeType: 'image/jpeg', sizeBytes: 240_000, width: 1280, height: 720 }, now)
  store.set(seeded.analysisId, seeded)
}
function buildAnalysis(analysisId: string, projectId: string, request: CreateMultimodalAnalysisRequest, now: string): MultimodalAnalysis {
  const lower = request.fileName.toLowerCase()
  if (lower.includes('no-evidence')) return { analysisId, projectId, image: { ...request }, observations: [], noEvidence: true, promptInjectionBlocked: false, createdAt: now, updatedAt: now }
  const injection = lower.includes('prompt-injection')
  const low = lower.includes('low-confidence')
  const observation: MultimodalObservation = {
    observationId: `observation-${analysisId}-1`, label: 'bridge_pier_rebar', confidence: low ? 0.54 : 0.94,
    bbox: { x: 0.18, y: 0.14, width: 0.52, height: 0.68 },
    fields: [{ name: 'diameter_mm', value: low ? '' : '25', confidence: low ? 0.3 : 0.92, missing: low }, { name: 'concrete_grade', value: 'C30', confidence: low ? 0.61 : 0.9, missing: false }],
    entityCandidates: [{ entityId: 'engineering-position-123456789012345678', entityType: 'ENGINEERING_POSITION', name: '一号墩钢筋工程', confidence: low ? 0.58 : 0.93 }, { entityId: 'engineering-position-223456789012345678', entityType: 'ENGINEERING_POSITION', name: '二号墩钢筋工程', confidence: 0.33 }],
    missingFields: low ? ['diameter_mm'] : [], lowConfidence: low, reviewStatus: 'PENDING',
  }
  return { analysisId, projectId, image: { ...request }, observations: [observation], noEvidence: false, promptInjectionBlocked: injection, createdAt: now, updatedAt: now }
}
function requireAnalysis(client: MockIndustryAgentClient, projectId: string, analysisId: string): MultimodalAnalysis {
  const store = analysisStore(client, projectId); seedAnalyses(store, projectId)
  const analysis = store.get(analysisId)
  if (analysis === undefined) throw new IndustryAgentClientError('MULTIMODAL_ANALYSIS_NOT_FOUND', 'multimodal analysis not found', 404)
  return analysis
}
function seedLoops(store: Map<string, AgentLoopRun>, projectId: string): void {
  if (store.size > 0) return
  store.set('agent-loop-success-v1', buildLoopRun('agent-loop-success-v1', projectId, '查询未完成工程部位并汇总', DEFAULT_BUDGET, 'SUCCESS'))
  store.set('agent-loop-replan-v1', buildLoopRun('agent-loop-replan-v1', projectId, '查询清单后验证规格并重规划', DEFAULT_BUDGET, 'REPLAN'))
  store.set('agent-loop-critical-tool-v1', buildLoopRun('agent-loop-critical-tool-v1', projectId, '修改工程量清单负责人', DEFAULT_BUDGET, 'CRITICAL_TOOL'))
}

function buildLoopRun(runId: string, projectId: string, goal: string, budget: AgentLoopBudget, scenario: NonNullable<StartAgentLoopRunRequest['scenario']>): AgentLoopRun {
  const started = '2026-09-13T07:35:00.000Z'
  const makeStep = (sequenceNo: number, phase: AgentLoopStep['phase'], title: string, detail: string, overrides: Partial<AgentLoopStep> = {}): AgentLoopStep => ({ sequenceNo, phase, status: 'OK', title, detail, tokenUsage: 80, costUsd: 0.01, startedAt: new Date(Date.parse(started) + sequenceNo * 100).toISOString(), completedAt: new Date(Date.parse(started) + sequenceNo * 100 + 75).toISOString(), ...overrides })
  let intendedSteps: AgentLoopStep[]
  let intendedReason: AgentLoopRun['terminationReason'] = 'SUCCESS'
  if (scenario === 'REPLAN') {
    intendedSteps = [makeStep(1,'PLAN','Plan','query then verify'), makeStep(2,'ACT','Act','query_boq',{toolName:'query_boq'}), makeStep(3,'VERIFY','Verify','spec mismatch found',{status:'ERROR'}), makeStep(4,'REPLAN','Replan','tighten specification'), makeStep(5,'ACT','Act','query_boq',{toolName:'query_boq'}), makeStep(6,'VERIFY','Verify','candidate verified'), makeStep(7,'TERMINATE','Terminate','goal satisfied')]
  } else if (scenario === 'CRITICAL_TOOL') {
    intendedReason = 'CRITICAL_TOOL_CONFIRMATION_REQUIRED'
    intendedSteps = [makeStep(1,'PLAN','Plan','mutation requires confirmation'), makeStep(2,'ACT','Critical tool blocked','update_boq_owner',{status:'BLOCKED',toolName:'update_boq_owner',toolCritical:true}), makeStep(3,'TERMINATE','Terminate','explicit user confirmation required')]
  } else if (scenario === 'MAX_STEPS') {
    intendedReason = 'MAX_STEPS'
    intendedSteps = boundedStepSequence(budget.maxSteps, makeStep)
  } else if (scenario === 'MAX_TOOLS') {
    intendedReason = 'MAX_TOOLS'
    const toolSteps = Array.from({ length: budget.maxTools }, (_, index) => makeStep(index + 2, 'ACT', 'Act', `tool ${index + 1} within budget`, { toolName: 'query' }))
    intendedSteps = [makeStep(1,'PLAN','Plan','bounded tools'), ...toolSteps, makeStep(toolSteps.length + 2,'TERMINATE','Terminate','max tools reached')]
  } else if (scenario === 'TOKEN_COST') {
    if (budget.maxTokens <= 100) {
      intendedReason = 'TOKEN_BUDGET'
      intendedSteps = [makeStep(1,'PLAN','Plan','consume token budget',{tokenUsage:budget.maxTokens,costUsd:Math.min(0.01,budget.maxCostUsd)}), makeStep(2,'TERMINATE','Terminate','token budget reached',{tokenUsage:0,costUsd:0})]
    } else {
      intendedReason = 'COST_BUDGET'
      intendedSteps = [makeStep(1,'PLAN','Plan','consume cost budget',{tokenUsage:Math.min(80,budget.maxTokens),costUsd:budget.maxCostUsd}), makeStep(2,'TERMINATE','Terminate','cost budget reached',{tokenUsage:0,costUsd:0})]
    }
  } else if (scenario === 'TIMEOUT') {
    intendedReason = 'TIMEOUT'; intendedSteps = [makeStep(1,'PLAN','Plan','bounded execution'), makeStep(2,'TERMINATE','Terminate','timeout reached')]
  } else if (scenario === 'USAGE_INCOMPLETE') {
    intendedReason = 'USAGE_INCOMPLETE'; intendedSteps = [makeStep(1,'PLAN','Plan','usage accounting required'), makeStep(2,'TERMINATE','Terminate','usage incomplete')]
  } else if (scenario === 'SCOPE_INJECTION') {
    intendedReason = 'SCOPE_INJECTION_BLOCKED'; intendedSteps = [makeStep(1,'PLAN','Plan','query current project'), makeStep(2,'ACT','Scope injection blocked','browser/model projectId ignored',{status:'BLOCKED',toolName:'query_tasks',scopeInjectionBlocked:true}), makeStep(3,'TERMINATE','Terminate','unsafe scope rejected')]
  } else {
    intendedSteps = [makeStep(1,'PLAN','Plan','query and summarize'), makeStep(2,'ACT','Act','query_engineering_position',{toolName:'query_engineering_position'}), makeStep(3,'VERIFY','Verify','results satisfy goal'), makeStep(4,'TERMINATE','Terminate','goal satisfied')]
  }
  const bounded = enforceBudgets(intendedSteps, intendedReason, budget, makeStep)
  const steps = bounded.steps
  const terminationReason = bounded.reason
  const totalTokens = steps.reduce((sum, item) => sum + item.tokenUsage, 0)
  const costUsd = Number(steps.reduce((sum, item) => sum + item.costUsd, 0).toFixed(4))
  const toolCalls = steps.filter((item) => item.toolName !== undefined).length
  const elapsedMs = terminationReason === 'TIMEOUT' && bounded.budgetTriggered === false ? budget.timeoutMs : Math.min(Math.max(steps.length * 100, 1), budget.timeoutMs)
  const inputTokens = Math.floor(totalTokens * 0.7)
  const usage = { steps: steps.length, toolCalls, inputTokens, outputTokens: totalTokens - inputTokens, totalTokens, costUsd, elapsedMs, complete: scenario !== 'USAGE_INCOMPLETE' }
  const status: AgentLoopRun['status'] = terminationReason === 'SUCCESS' ? 'COMPLETED' : 'TERMINATED'
  return { runId, projectId, goal, status, budget: { ...budget }, usage, steps, terminationReason, traceId: `trace-${runId}`, createdAt: started, completedAt: new Date(Date.parse(started) + elapsedMs).toISOString() }
}

function enforceBudgets(
  intendedSteps: readonly AgentLoopStep[],
  intendedReason: AgentLoopRun['terminationReason'],
  budget: AgentLoopBudget,
  makeStep: (sequenceNo: number, phase: AgentLoopStep['phase'], title: string, detail: string, overrides?: Partial<AgentLoopStep>) => AgentLoopStep,
): { steps: AgentLoopStep[]; reason: AgentLoopRun['terminationReason']; budgetTriggered: boolean } {
  const work = intendedSteps.filter((item) => item.phase !== 'TERMINATE')
  const rows: AgentLoopStep[] = []
  let tools = 0
  let tokens = 0
  let cost = 0
  let reason = intendedReason
  let budgetTriggered = false
  for (const candidate of work) {
    if (rows.length >= budget.maxSteps - 1) { reason = 'MAX_STEPS'; budgetTriggered = true; break }
    const nextTools = tools + (candidate.toolName === undefined ? 0 : 1)
    if (nextTools > budget.maxTools) { reason = 'MAX_TOOLS'; budgetTriggered = true; break }
    if (tokens + candidate.tokenUsage > budget.maxTokens) { reason = 'TOKEN_BUDGET'; budgetTriggered = true; break }
    if (cost + candidate.costUsd > budget.maxCostUsd + 1e-9) { reason = 'COST_BUDGET'; budgetTriggered = true; break }
    if ((rows.length + 2) * 100 > budget.timeoutMs) { reason = 'TIMEOUT'; budgetTriggered = true; break }
    rows.push({ ...candidate, sequenceNo: rows.length + 1 })
    tools = nextTools
    tokens += candidate.tokenUsage
    cost += candidate.costUsd
  }
  const sequenceNo = rows.length + 1
  const terminate = makeStep(sequenceNo, 'TERMINATE', 'Terminate', terminationDetail(reason), { tokenUsage: 0, costUsd: 0, status: reason === 'ERROR' ? 'ERROR' : 'OK' })
  return { steps: [...rows, terminate], reason, budgetTriggered }
}

function terminationDetail(reason: AgentLoopRun['terminationReason']): string {
  if (reason === 'SUCCESS') return 'goal satisfied'
  if (reason === 'MAX_STEPS') return 'max steps reached'
  if (reason === 'MAX_TOOLS') return 'max tools reached'
  if (reason === 'TOKEN_BUDGET') return 'token budget reached'
  if (reason === 'COST_BUDGET') return 'cost budget reached'
  if (reason === 'TIMEOUT') return 'timeout reached'
  if (reason === 'USAGE_INCOMPLETE') return 'usage accounting incomplete'
  if (reason === 'SCOPE_INJECTION_BLOCKED') return 'unsafe scope rejected'
  if (reason === 'CRITICAL_TOOL_CONFIRMATION_REQUIRED') return 'explicit user confirmation required'
  return 'loop terminated with error'
}

function boundedStepSequence(maxSteps: number, makeStep: (sequenceNo: number, phase: AgentLoopStep['phase'], title: string, detail: string, overrides?: Partial<AgentLoopStep>) => AgentLoopStep): AgentLoopStep[] {
  if (maxSteps === 1) return [makeStep(1,'TERMINATE','Terminate','max steps reached before execution')]
  const rows: AgentLoopStep[] = [makeStep(1,'PLAN','Plan','bounded loop')]
  for (let sequenceNo = 2; sequenceNo < maxSteps; sequenceNo += 1) rows.push(makeStep(sequenceNo, sequenceNo % 2 === 0 ? 'ACT' : 'VERIFY', sequenceNo % 2 === 0 ? 'Act' : 'Verify', 'bounded step', sequenceNo % 2 === 0 ? { toolName: 'query' } : {}))
  rows.push(makeStep(maxSteps,'TERMINATE','Terminate','max steps reached'))
  return rows
}

function validateImageRequest(request: CreateMultimodalAnalysisRequest): void {
  if (request.fileName.trim() === '') throw new IndustryAgentClientError('MULTIMODAL_FILE_NAME_REQUIRED', 'image file name is required', 400)
  if (!['image/jpeg','image/png','image/webp'].includes(request.mimeType)) throw new IndustryAgentClientError('MULTIMODAL_MIME_NOT_ALLOWED', 'image mime type is not allowed', 415)
  if (!Number.isInteger(request.sizeBytes) || request.sizeBytes <= 0 || request.sizeBytes > MAX_IMAGE_BYTES) throw new IndustryAgentClientError('MULTIMODAL_SIZE_INVALID', 'image size is outside the mock limit', 413)
  for (const value of [request.width, request.height]) if (value !== undefined && (!Number.isInteger(value) || value <= 0 || value > 20_000)) throw new IndustryAgentClientError('MULTIMODAL_DIMENSION_INVALID', 'image dimensions are invalid', 400)
}
function validateLoopRequest(request: StartAgentLoopRunRequest): void {
  if (request.goal.trim() === '' || request.goal.length > 2_000) throw new IndustryAgentClientError('AGENT_LOOP_GOAL_INVALID', 'agent loop goal is required and must be at most 2000 characters', 400)
  const budget = request.budget
  if (!Number.isInteger(budget.maxSteps) || budget.maxSteps < 1 || budget.maxSteps > 50) throw new IndustryAgentClientError('AGENT_LOOP_BUDGET_INVALID', 'maxSteps must be between 1 and 50', 400)
  if (!Number.isInteger(budget.maxTools) || budget.maxTools < 0 || budget.maxTools > 50) throw new IndustryAgentClientError('AGENT_LOOP_BUDGET_INVALID', 'maxTools must be between 0 and 50', 400)
  if (!Number.isInteger(budget.maxTokens) || budget.maxTokens < 1 || budget.maxTokens > 1_000_000) throw new IndustryAgentClientError('AGENT_LOOP_BUDGET_INVALID', 'maxTokens is invalid', 400)
  if (!Number.isFinite(budget.maxCostUsd) || budget.maxCostUsd < 0 || budget.maxCostUsd > 1_000) throw new IndustryAgentClientError('AGENT_LOOP_BUDGET_INVALID', 'maxCostUsd is invalid', 400)
  if (!Number.isInteger(budget.timeoutMs) || budget.timeoutMs < 100 || budget.timeoutMs > 3_600_000) throw new IndustryAgentClientError('AGENT_LOOP_BUDGET_INVALID', 'timeoutMs is invalid', 400)
}
function requireProject(context: TrustedRequestContext): string { if (context.projectId === null) throw new IndustryAgentClientError('INDUSTRY_PROJECT_REQUIRED', 'active project is required', 409); return context.projectId }
