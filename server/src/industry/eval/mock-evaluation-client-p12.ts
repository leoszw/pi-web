import { createHash, randomUUID } from 'node:crypto'
import type {
  CreateOnlineFeedbackFromTraceRequest,
  DatasetHealthSummary,
  LabelOnlineFeedbackRequest,
  OnlineDatasetVersion,
  OnlineFeedbackItem,
  OnlineQualityMetric,
  OnlineQualityMetricId,
  OnlineQualitySnapshot,
  OnlineQualityStatus,
  ReviewOnlineFeedbackRequest,
} from '../../../../shared/industry/eval/p12'
import type { TrustedRequestContext } from '../context'
import { EvaluationClientError } from './evaluation-client'
import { MockEvaluationClient } from './mock-evaluation-client'

interface ProjectState {
  feedback: Map<string, OnlineFeedbackItem>
  versions: OnlineDatasetVersion[]
}

const STATES = new WeakMap<MockEvaluationClient, Map<string, ProjectState>>()
const DATASET_ID = 'online-feedback-reviewed'

declare module './evaluation-client' {
  interface EvaluationClient {
    getOnlineQualitySnapshot(context: TrustedRequestContext): Promise<OnlineQualitySnapshot>
    listOnlineFeedback(context: TrustedRequestContext): Promise<readonly OnlineFeedbackItem[]>
    getOnlineFeedback(context: TrustedRequestContext, feedbackId: string): Promise<OnlineFeedbackItem>
    createOnlineFeedbackFromTrace(context: TrustedRequestContext, request: CreateOnlineFeedbackFromTraceRequest, sanitizedInput: string, removedSecretPatterns: number): Promise<OnlineFeedbackItem>
    advanceOnlineFeedbackToDraft(context: TrustedRequestContext, feedbackId: string): Promise<OnlineFeedbackItem>
    labelOnlineFeedback(context: TrustedRequestContext, feedbackId: string, request: LabelOnlineFeedbackRequest): Promise<OnlineFeedbackItem>
    reviewOnlineFeedback(context: TrustedRequestContext, feedbackId: string, request: ReviewOnlineFeedbackRequest): Promise<OnlineFeedbackItem>
    versionOnlineFeedback(context: TrustedRequestContext, feedbackId: string): Promise<OnlineFeedbackItem>
    listOnlineDatasetVersions(context: TrustedRequestContext): Promise<readonly OnlineDatasetVersion[]>
    getOnlineDatasetHealth(context: TrustedRequestContext): Promise<DatasetHealthSummary>
  }
}

declare module './mock-evaluation-client' {
  interface MockEvaluationClient {
    getOnlineQualitySnapshot(context: TrustedRequestContext): Promise<OnlineQualitySnapshot>
    listOnlineFeedback(context: TrustedRequestContext): Promise<readonly OnlineFeedbackItem[]>
    getOnlineFeedback(context: TrustedRequestContext, feedbackId: string): Promise<OnlineFeedbackItem>
    createOnlineFeedbackFromTrace(context: TrustedRequestContext, request: CreateOnlineFeedbackFromTraceRequest, sanitizedInput: string, removedSecretPatterns: number): Promise<OnlineFeedbackItem>
    advanceOnlineFeedbackToDraft(context: TrustedRequestContext, feedbackId: string): Promise<OnlineFeedbackItem>
    labelOnlineFeedback(context: TrustedRequestContext, feedbackId: string, request: LabelOnlineFeedbackRequest): Promise<OnlineFeedbackItem>
    reviewOnlineFeedback(context: TrustedRequestContext, feedbackId: string, request: ReviewOnlineFeedbackRequest): Promise<OnlineFeedbackItem>
    versionOnlineFeedback(context: TrustedRequestContext, feedbackId: string): Promise<OnlineFeedbackItem>
    listOnlineDatasetVersions(context: TrustedRequestContext): Promise<readonly OnlineDatasetVersion[]>
    getOnlineDatasetHealth(context: TrustedRequestContext): Promise<DatasetHealthSummary>
  }
}

MockEvaluationClient.prototype.getOnlineQualitySnapshot = async function(context) {
  const projectId = requireProject(context)
  return clone(buildQualitySnapshot(projectId))
}

MockEvaluationClient.prototype.listOnlineFeedback = async function(context) {
  const state = projectState(this, requireProject(context))
  return clone([...state.feedback.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)))
}

MockEvaluationClient.prototype.getOnlineFeedback = async function(context, feedbackId) {
  return clone(feedbackById(projectState(this, requireProject(context)), feedbackId))
}

MockEvaluationClient.prototype.createOnlineFeedbackFromTrace = async function(context, request, sanitizedInput, removedSecretPatterns) {
  const projectId = requireProject(context)
  const state = projectState(this, projectId)
  const duplicate = [...state.feedback.values()].find((item)=>item.traceId===request.traceId&&item.targetDomain===request.targetDomain&&item.stage!=='VERSIONED')
  if (duplicate !== undefined) throw new EvaluationClientError('ONLINE_FEEDBACK_DUPLICATE_ACTIVE', 'an active feedback item already exists for this trace and domain', 409)
  const now = new Date().toISOString()
  const item: OnlineFeedbackItem = {
    feedbackId: `feedback-${randomUUID()}`,
    projectId,
    traceId: request.traceId,
    source: 'ONLINE_TRACE',
    targetDomain: request.targetDomain,
    stage: 'SANITIZED',
    sanitizedInput,
    sanitization: { removedSecretPatterns, removedPromptContent: true, sourceScopeTrusted: true },
    createdAt: now,
    updatedAt: now,
  }
  state.feedback.set(item.feedbackId, item)
  return clone(item)
}

MockEvaluationClient.prototype.advanceOnlineFeedbackToDraft = async function(context, feedbackId) {
  const state = projectState(this, requireProject(context))
  const item = feedbackById(state, feedbackId)
  requireStage(item, 'SANITIZED')
  const updated = { ...item, stage: 'DRAFT' as const, updatedAt: new Date().toISOString() }
  state.feedback.set(feedbackId, updated)
  return clone(updated)
}

MockEvaluationClient.prototype.labelOnlineFeedback = async function(context, feedbackId, request) {
  validateLabel(request)
  const state = projectState(this, requireProject(context))
  const item = feedbackById(state, feedbackId)
  requireStage(item, 'DRAFT')
  const now = new Date().toISOString()
  const updated: OnlineFeedbackItem = {
    ...item,
    stage: 'LABELED',
    humanLabel: {
      label: request.label.trim(),
      tags: [...new Set(request.tags.map((tag)=>tag.trim()).filter(Boolean))],
      difficulty: request.difficulty,
      ...(request.notes===undefined?{}:{notes:request.notes.trim()}),
      labeledBy: context.userId,
      labeledAt: now,
    },
    updatedAt: now,
  }
  state.feedback.set(feedbackId, updated)
  return clone(updated)
}

MockEvaluationClient.prototype.reviewOnlineFeedback = async function(context, feedbackId, request) {
  const state = projectState(this, requireProject(context))
  const item = feedbackById(state, feedbackId)
  requireStage(item, 'LABELED')
  const now = new Date().toISOString()
  const updated: OnlineFeedbackItem = {
    ...item,
    stage: 'REVIEWED',
    review: {
      approved: true,
      ...(request.reviewNote===undefined?{}:{reviewNote:request.reviewNote.trim()}),
      reviewedBy: context.userId,
      reviewedAt: now,
    },
    updatedAt: now,
  }
  state.feedback.set(feedbackId, updated)
  return clone(updated)
}

MockEvaluationClient.prototype.versionOnlineFeedback = async function(context, feedbackId) {
  const projectId = requireProject(context)
  const state = projectState(this, projectId)
  const item = feedbackById(state, feedbackId)
  requireStage(item, 'REVIEWED')
  if (item.humanLabel === undefined || item.review === undefined) throw new EvaluationClientError('ONLINE_FEEDBACK_INVALID_STATE','reviewed feedback is incomplete',409)
  const now = new Date().toISOString()
  const version = `1.0.${state.versions.length + 1}`
  const fingerprint = `sha256:${createHash('sha256').update(JSON.stringify({projectId,feedbackId,label:item.humanLabel.label,tags:item.humanLabel.tags,version})).digest('hex')}`
  const datasetVersion: OnlineDatasetVersion = {
    datasetId: DATASET_ID,
    projectId,
    version,
    status: 'REVIEWED',
    golden: false,
    sourceFeedbackIds: [feedbackId],
    caseCount: 1,
    fingerprint,
    createdAt: now,
    createdBy: context.userId,
  }
  state.versions.push(datasetVersion)
  const updated: OnlineFeedbackItem = {
    ...item,
    stage: 'VERSIONED',
    datasetVersion: { datasetId: DATASET_ID, version, status: 'REVIEWED', golden: false, createdAt: now },
    updatedAt: now,
  }
  state.feedback.set(feedbackId, updated)
  return clone(updated)
}

MockEvaluationClient.prototype.listOnlineDatasetVersions = async function(context) {
  return clone(projectState(this, requireProject(context)).versions.slice().reverse())
}

MockEvaluationClient.prototype.getOnlineDatasetHealth = async function(context) {
  const projectId = requireProject(context)
  const state = projectState(this, projectId)
  return clone(buildHealth(projectId, state))
}

function projectState(client: MockEvaluationClient, projectId: string): ProjectState {
  let projects = STATES.get(client)
  if (projects === undefined) { projects = new Map(); STATES.set(client, projects) }
  let state = projects.get(projectId)
  if (state === undefined) { state = seedProject(projectId); projects.set(projectId, state) }
  return state
}

function seedProject(projectId: string): ProjectState {
  const stamp = '2026-09-13T09:45:00.000Z'
  const safeProject = safe(projectId)
  const draft: OnlineFeedbackItem = {
    feedbackId: `feedback-${safeProject}-retrieval`, projectId, traceId:`trace-${safeProject}-retrieval-001`, source:'ONLINE_TRACE', targetDomain:'RETRIEVAL', stage:'DRAFT', sanitizedInput:'工程部位查询', sanitization:{removedSecretPatterns:3,removedPromptContent:true,sourceScopeTrusted:true}, createdAt:stamp, updatedAt:stamp,
  }
  const labeled: OnlineFeedbackItem = {
    feedbackId:`feedback-${safeProject}-mutation`, projectId, traceId:`trace-${safeProject}-mutation-001`, source:'ONLINE_TRACE', targetDomain:'MUTATION', stage:'LABELED', sanitizedInput:'负责人修改', sanitization:{removedSecretPatterns:2,removedPromptContent:true,sourceScopeTrusted:true}, humanLabel:{label:'MUTATION_CONFIRMATION_REQUIRED',tags:['mutation','confirmation'],difficulty:'HARD',labeledBy:'fixture-labeler',labeledAt:stamp}, createdAt:stamp, updatedAt:stamp,
  }
  const reviewed: OnlineFeedbackItem = {
    feedbackId:`feedback-${safeProject}-conversation`, projectId, traceId:`trace-${safeProject}-conversation-001`, source:'ONLINE_TRACE', targetDomain:'INTENT', stage:'REVIEWED', sanitizedInput:'行业 Agent 对话', sanitization:{removedSecretPatterns:1,removedPromptContent:true,sourceScopeTrusted:true}, humanLabel:{label:'CLARIFICATION_REQUIRED',tags:['intent','clarification','online'],difficulty:'ADVERSARIAL',labeledBy:'fixture-labeler',labeledAt:stamp}, review:{approved:true,reviewNote:'Reviewed fixture feedback.',reviewedBy:'fixture-reviewer',reviewedAt:stamp}, createdAt:stamp, updatedAt:stamp,
  }
  return { feedback:new Map([[draft.feedbackId,draft],[labeled.feedbackId,labeled],[reviewed.feedbackId,reviewed]]), versions:[] }
}

function buildQualitySnapshot(projectId: string): OnlineQualitySnapshot {
  const safeProject = safe(projectId)
  const metrics: OnlineQualityMetric[] = [
    metric('INTENT_DRIFT_RATE','Intent drift',.028,.019,'RATE',.02,.05),
    metric('CLARIFICATION_RATE','Clarification',.061,.057,'RATE',.08,.12),
    metric('ZERO_RETRIEVAL_RATE','Zero retrieval',.045,.031,'RATE',.04,.08),
    metric('LOW_CONFIDENCE_RATE','Low confidence',.11,.094,'RATE',.10,.20),
    metric('TOOL_ERROR_RATE','Tool error',.012,.014,'RATE',.03,.06),
    metric('MUTATION_REJECT_RATE','Mutation reject',.16,.13,'RATE',.15,.25),
    metric('RAG_INSUFFICIENT_EVIDENCE_RATE','RAG insufficient evidence',.09,.082,'RATE',.10,.18),
    metric('P95_LATENCY_MS','P95 latency',820,790,'MS',1000,1800),
    metric('AVG_TOKENS','Average tokens',1850,1760,'TOKENS',2500,4000),
    metric('AVG_COST_USD','Average cost',.016,.015,'USD',.03,.06),
    metric('USER_CORRECTION_RATE','User correction',.035,.022,'RATE',.03,.07),
  ]
  const byId = new Map(metrics.map((item)=>[item.metricId,item]))
  return {
    source:'MOCK_FIXTURE',
    projectId,
    windowStart:'2026-09-12T09:45:00.000Z',
    windowEnd:'2026-09-13T09:45:00.000Z',
    sampleCount:500,
    metrics,
    signals:[
      signal('signal-intent-drift','INTENT_DRIFT_RATE','Intent drift increased','WARN','Intent distribution moved above the warning threshold.',byId,`trace-${safeProject}-conversation-001`),
      signal('signal-zero-retrieval','ZERO_RETRIEVAL_RATE','Zero retrieval increased','WARN','Retrieval misses exceeded the warning threshold.',byId,`trace-${safeProject}-retrieval-001`),
      signal('signal-mutation-reject','MUTATION_REJECT_RATE','Mutation rejection increased','WARN','Rejected mutation confirmations exceeded the warning threshold.',byId,`trace-${safeProject}-mutation-001`),
      signal('signal-user-correction','USER_CORRECTION_RATE','User corrections increased','WARN','Corrections are above the online quality warning threshold.',byId,`trace-${safeProject}-conversation-001`),
    ],
  }
}

function metric(metricId:OnlineQualityMetricId,label:string,value:number,previousValue:number,unit:OnlineQualityMetric['unit'],warningThreshold:number,failureThreshold:number):OnlineQualityMetric {
  const status:OnlineQualityStatus=value>=failureThreshold?'FAIL':value>=warningThreshold?'WARN':'PASS'
  return {metricId,label,value,previousValue,delta:round(value-previousValue),unit,warningThreshold,failureThreshold,status}
}
function signal(signalId:string,type:OnlineQualityMetricId,title:string,severity:'WARN'|'CRITICAL',detail:string,metrics:ReadonlyMap<OnlineQualityMetricId,OnlineQualityMetric>,traceId:string){const metricValue=metrics.get(type);if(metricValue===undefined)throw new Error(`missing metric ${type}`);return{signalId,type,title,severity,detail,observedValue:metricValue.value,threshold:metricValue.warningThreshold,traceIds:[traceId]}}

function buildHealth(projectId:string,state:ProjectState):DatasetHealthSummary {
  const items=[...state.feedback.values()]
  const labeled=items.filter((item)=>item.humanLabel!==undefined)
  const reviewed=items.filter((item)=>item.stage==='REVIEWED'||item.stage==='VERSIONED')
  const hard=labeled.filter((item)=>item.humanLabel?.difficulty==='HARD'||item.humanLabel?.difficulty==='ADVERSARIAL')
  const tagCounts=new Map<string,number>()
  for(const item of labeled)for(const tag of item.humanLabel?.tags??[])tagCounts.set(tag,(tagCounts.get(tag)??0)+1)
  const duplicateCount=1, nearDuplicateCount=2, holdoutLeakageCount=0, labelChurnRate=.08, lastReviewAgeDays=2
  return {
    source:'MOCK_FIXTURE',projectId,datasetId:DATASET_ID,sourceCaseCount:items.length,draftCount:items.filter((item)=>item.stage==='SANITIZED'||item.stage==='DRAFT').length,labeledCount:labeled.length,reviewedCount:reviewed.length,versionedCount:items.filter((item)=>item.stage==='VERSIONED').length,reviewedPercent:items.length===0?0:reviewed.length/items.length,hardAdversarialCount:hard.length,hardAdversarialPercent:labeled.length===0?0:hard.length/labeled.length,tagDistribution:[...tagCounts.entries()].map(([tag,count])=>({tag,count})).sort((a,b)=>b.count-a.count||a.tag.localeCompare(b.tag)),duplicateCount,nearDuplicateCount,holdoutLeakageCount,labelChurnRate,lastReviewAgeDays,issues:[{issueId:'health-duplicate',type:'DUPLICATE',severity:'WARN',count:duplicateCount,detail:'Exact duplicate candidates require curator review.'},{issueId:'health-near-duplicate',type:'NEAR_DUPLICATE',severity:'WARN',count:nearDuplicateCount,detail:'Near-duplicate candidates should be clustered before versioning.'},{issueId:'health-label-churn',type:'LABEL_CHURN',severity:'WARN',count:1,detail:'Label churn is 8.0% in the mock review window.'}],computedAt:new Date().toISOString(),
  }
}

function feedbackById(state:ProjectState,feedbackId:string):OnlineFeedbackItem { const item=state.feedback.get(feedbackId); if(item===undefined)throw new EvaluationClientError('ONLINE_FEEDBACK_NOT_FOUND','online feedback item not found',404); return item }
function requireStage(item:OnlineFeedbackItem,stage:OnlineFeedbackItem['stage']):void { if(item.stage!==stage)throw new EvaluationClientError('ONLINE_FEEDBACK_INVALID_STATE',`feedback must be ${stage} before this action`,409) }
function validateLabel(request:LabelOnlineFeedbackRequest):void { if(request.label.trim().length<2||request.label.trim().length>200)throw new EvaluationClientError('ONLINE_FEEDBACK_LABEL_INVALID','label must be 2-200 characters',400);if(request.tags.length>20)throw new EvaluationClientError('ONLINE_FEEDBACK_LABEL_INVALID','at most 20 tags are allowed',400);if(request.notes!==undefined&&request.notes.length>1000)throw new EvaluationClientError('ONLINE_FEEDBACK_LABEL_INVALID','notes must be at most 1000 characters',400) }
function requireProject(context:TrustedRequestContext):string { if(context.projectId===null)throw new EvaluationClientError('EVAL_PROJECT_REQUIRED','select an active project before using online quality',409);return context.projectId }
function safe(value:string):string { return value.replace(/[^a-zA-Z0-9_-]/gu,'-').slice(0,48)||'project' }
function round(value:number):number { return Math.round(value*10000)/10000 }
function clone<T>(value:T):T { return structuredClone(value) }
