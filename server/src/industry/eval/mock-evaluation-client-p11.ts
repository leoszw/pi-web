import { createHash, randomUUID } from 'node:crypto'
import type {
  BaselineAcceptance,
  CreateReleaseWaiverRequest,
  ReleaseWaiver,
  StartUnifiedBenchmarkRunRequest,
  UnifiedBenchmarkMetric,
  UnifiedBenchmarkRun,
  UnifiedCorpusManifest,
  UnifiedReleaseDecision,
  UnifiedRunComparison,
} from '../../../../shared/industry/eval/p11'
import type { TrustedRequestContext } from '../context'
import { EvaluationClientError } from './evaluation-client'
import { MockEvaluationClient } from './mock-evaluation-client'

interface ProjectState {
  runs: Map<string, UnifiedBenchmarkRun>
  baseline?: BaselineAcceptance
  waivers: Map<string, ReleaseWaiver>
}
const STATES = new WeakMap<MockEvaluationClient, Map<string, ProjectState>>()
const CORPUS_ID = 'phase11-unified-corpus-v1'
const DOMAIN_COUNTS = [
  ['INTENT',100],['RETRIEVAL',180],['MUTATION',80],['TRACE',70],['RAG',120],['NORMALIZATION',70],['ENTITY',70],['TOOL',70],['MEMORY',70],['MULTIMODAL',50],['AGENT_LOOP',50],['REPORT',50],['SANDBOX',50],
] as const
const CORPUS_FINGERPRINT = `sha256:${createHash('sha256').update(JSON.stringify({corpusId:CORPUS_ID,version:'1.0.0',domainCounts:DOMAIN_COUNTS,total:1030})).digest('hex')}`
const MANIFEST: UnifiedCorpusManifest = {
  corpusId: CORPUS_ID,
  version: '1.0.0',
  status: 'REVIEWED',
  totalCaseCount: 1030,
  goldenCount: 820,
  hardCount: 210,
  criticalCaseCount: 130,
  fullCoverageRequired: true,
  fingerprint: CORPUS_FINGERPRINT,
  domainCounts: DOMAIN_COUNTS.map(([domain,caseCount])=>({domain,caseCount})),
  source: 'PHASE_11_MOCK_MANIFEST',
  reviewedAt: '2026-09-13T09:30:00.000Z',
}

declare module './evaluation-client' {
  interface EvaluationClient {
    getUnifiedCorpusManifest(context:TrustedRequestContext):Promise<UnifiedCorpusManifest>
    listUnifiedBenchmarkRuns(context:TrustedRequestContext):Promise<readonly UnifiedBenchmarkRun[]>
    startUnifiedBenchmarkRun(context:TrustedRequestContext,request:StartUnifiedBenchmarkRunRequest):Promise<UnifiedBenchmarkRun>
    getUnifiedBenchmarkRun(context:TrustedRequestContext,runId:string):Promise<UnifiedBenchmarkRun>
    getUnifiedReleaseDecision(context:TrustedRequestContext,runId:string):Promise<UnifiedReleaseDecision>
    getUnifiedBaseline(context:TrustedRequestContext):Promise<BaselineAcceptance|null>
    acceptUnifiedBaseline(context:TrustedRequestContext,runId:string):Promise<BaselineAcceptance>
    compareUnifiedRuns(context:TrustedRequestContext,baselineRunId:string,candidateRunId:string):Promise<UnifiedRunComparison>
    listReleaseWaivers(context:TrustedRequestContext):Promise<readonly ReleaseWaiver[]>
    createReleaseWaiver(context:TrustedRequestContext,runId:string,request:CreateReleaseWaiverRequest):Promise<ReleaseWaiver>
  }
}
declare module './mock-evaluation-client' {
  interface MockEvaluationClient {
    getUnifiedCorpusManifest(context:TrustedRequestContext):Promise<UnifiedCorpusManifest>
    listUnifiedBenchmarkRuns(context:TrustedRequestContext):Promise<readonly UnifiedBenchmarkRun[]>
    startUnifiedBenchmarkRun(context:TrustedRequestContext,request:StartUnifiedBenchmarkRunRequest):Promise<UnifiedBenchmarkRun>
    getUnifiedBenchmarkRun(context:TrustedRequestContext,runId:string):Promise<UnifiedBenchmarkRun>
    getUnifiedReleaseDecision(context:TrustedRequestContext,runId:string):Promise<UnifiedReleaseDecision>
    getUnifiedBaseline(context:TrustedRequestContext):Promise<BaselineAcceptance|null>
    acceptUnifiedBaseline(context:TrustedRequestContext,runId:string):Promise<BaselineAcceptance>
    compareUnifiedRuns(context:TrustedRequestContext,baselineRunId:string,candidateRunId:string):Promise<UnifiedRunComparison>
    listReleaseWaivers(context:TrustedRequestContext):Promise<readonly ReleaseWaiver[]>
    createReleaseWaiver(context:TrustedRequestContext,runId:string,request:CreateReleaseWaiverRequest):Promise<ReleaseWaiver>
  }
}

MockEvaluationClient.prototype.getUnifiedCorpusManifest=async function(context){requireProject(context);return clone(MANIFEST)}
MockEvaluationClient.prototype.listUnifiedBenchmarkRuns=async function(context){const state=projectState(this,requireProject(context));return clone([...state.runs.values()].sort((a,b)=>b.startedAt.localeCompare(a.startedAt)))}
MockEvaluationClient.prototype.startUnifiedBenchmarkRun=async function(context,request){const projectId=requireProject(context);if(request.corpusId!==CORPUS_ID)throw new EvaluationClientError('EVAL_DATASET_NOT_FOUND','unified benchmark corpus not found',404);variant(request.variantId);const run=buildRun(`run-p11-${randomUUID()}`,projectId,request.variantId,request.variantId==='p11-broken-v0'?'BROKEN':'CANDIDATE');projectState(this,projectId).runs.set(run.runId,run);return clone(run)}
MockEvaluationClient.prototype.getUnifiedBenchmarkRun=async function(context,runId){return clone(runById(projectState(this,requireProject(context)),runId))}
MockEvaluationClient.prototype.getUnifiedReleaseDecision=async function(context,runId){const state=projectState(this,requireProject(context));return clone(decision(state,runById(state,runId)))}
MockEvaluationClient.prototype.getUnifiedBaseline=async function(context){return clone(projectState(this,requireProject(context)).baseline??null)}
MockEvaluationClient.prototype.acceptUnifiedBaseline=async function(context,runId){const projectId=requireProject(context);const state=projectState(this,projectId);const run=runById(state,runId);const reasons=baselineBlockReasons(run);if(reasons.length>0)throw new EvaluationClientError('EVAL_BASELINE_NOT_ELIGIBLE',`run cannot become baseline: ${reasons.join('; ')}`,409);if(state.baseline?.runId===runId)return clone(state.baseline);const accepted:BaselineAcceptance={acceptanceId:`baseline-${randomUUID()}`,projectId,runId,acceptedAt:new Date().toISOString(),acceptedBy:context.userId,explicit:true};state.baseline=accepted;return clone(accepted)}
MockEvaluationClient.prototype.compareUnifiedRuns=async function(context,baselineRunId,candidateRunId){const state=projectState(this,requireProject(context));const baseline=runById(state,baselineRunId);const candidate=runById(state,candidateRunId);if(baseline.corpusFingerprint!==candidate.corpusFingerprint)throw new EvaluationClientError('EVAL_DATASET_MISMATCH','unified runs must use the same corpus fingerprint',409);return clone(compare(baseline,candidate))}
MockEvaluationClient.prototype.listReleaseWaivers=async function(context){const state=projectState(this,requireProject(context));refreshWaivers(state);return clone([...state.waivers.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)))}
MockEvaluationClient.prototype.createReleaseWaiver=async function(context,runId,request){const projectId=requireProject(context);const state=projectState(this,projectId);const run=runById(state,runId);if(run.releaseGate.status!=='FAIL')throw new EvaluationClientError('EVAL_WAIVER_NOT_APPLICABLE','waiver is only allowed for a FAIL gate',409);refreshWaivers(state);if([...state.waivers.values()].some((item)=>item.runId===runId&&item.status==='ACTIVE'))throw new EvaluationClientError('EVAL_WAIVER_ALREADY_ACTIVE','an active waiver already exists for this run',409);validateWaiverRequest(request);const waiver:ReleaseWaiver={waiverId:`waiver-${randomUUID()}`,projectId,runId,reason:request.reason.trim(),status:'ACTIVE',originalGate:'FAIL',releaseDisposition:'WAIVED',createdBy:context.userId,createdAt:new Date().toISOString(),expiresAt:request.expiresAt};state.waivers.set(waiver.waiverId,waiver);return clone(waiver)}

function projectState(client:MockEvaluationClient,projectId:string):ProjectState{let projects=STATES.get(client);if(projects===undefined){projects=new Map();STATES.set(client,projects)}let state=projects.get(projectId);if(state===undefined){const baseline=buildRun('run-p11-baseline-v1',projectId,'p11-guarded-v1','BASELINE');const candidate=buildRun('run-p11-candidate-v2',projectId,'p11-guarded-v1','CANDIDATE');const broken=buildRun('run-p11-broken-v0',projectId,'p11-broken-v0','BROKEN');state={runs:new Map([[baseline.runId,baseline],[candidate.runId,candidate],[broken.runId,broken]]),baseline:{acceptanceId:`baseline-fixture-${safe(projectId)}`,projectId,runId:baseline.runId,acceptedAt:'2026-09-13T09:31:00.000Z',acceptedBy:'fixture-reviewer',explicit:true},waivers:new Map()};projects.set(projectId,state)}return state}
function buildRun(runId:string,projectId:string,variantId:StartUnifiedBenchmarkRunRequest['variantId'],kind:'BASELINE'|'CANDIDATE'|'BROKEN'):UnifiedBenchmarkRun{const broken=kind==='BROKEN';const candidate=kind==='CANDIDATE';const now=new Date().toISOString();const covered=broken?1009:1030;const criticalPassed=broken?128:130;const metrics=metricSet(kind);const reasons:string[]=[];if(covered!==1030)reasons.push('full coverage is required: 1009/1030 cases executed');if(criticalPassed!==130)reasons.push('critical E2E failed: 128/130 passed');for(const metric of metrics)if(metric.critical&&metric.value<1)reasons.push(`${metric.label} failed critical safety threshold`);const reproducibility={complete:!broken,gitCommit:candidate?'mock-p11-candidate-v2':kind==='BASELINE'?'mock-p11-baseline-v1':'mock-p11-broken-v0',corpusFingerprint:CORPUS_FINGERPRINT,configFingerprint:broken?'':'mock-config-p11-v2',runtimeConfigVersion:candidate?2:1,componentVersions:{agentModel:candidate?'2.0.0':'1.0.0',reranker:'1.0.0',parser:'1.0.0',sandbox:'1.0.0'},missing:broken?['configFingerprint']:[]};if(!reproducibility.complete)reasons.push('reproducibility snapshot is incomplete');return{runId,projectId,corpusId:CORPUS_ID,corpusVersion:MANIFEST.version,corpusFingerprint:CORPUS_FINGERPRINT,variantId,status:'COMPLETED',coveredCaseCount:covered,coverageRate:covered/1030,datasetReviewed:true,criticalE2E:{passed:criticalPassed===130,total:130,passedCount:criticalPassed,failedCaseIds:broken?['critical-tool-007','critical-mutation-011']:[]},metrics,releaseGate:{status:reasons.length===0?'PASS':'FAIL',source:'MOCK_PI',ruleVersion:'p11-release-gate-v1',reasons,evaluatedAt:now},reproducibility,startedAt:now,completedAt:now}}
function metricSet(kind:'BASELINE'|'CANDIDATE'|'BROKEN'):readonly UnifiedBenchmarkMetric[]{const values=kind==='BASELINE'?[.92,.87,.94,1,.90,1,1,1]:kind==='CANDIDATE'?[.93,.86,.95,1,.92,1,1,1]:[.84,.71,.78,.94,.70,.73,.90,.88];const rows=[['accuracy','Unified accuracy',-.02,true],['retrieval_ndcg','Retrieval nDCG@10',-.02,true],['rag_groundedness','RAG groundedness',-.01,true],['tool_safety','Tool safety',0,true],['multimodal_quality','Multimodal quality',-.03,true],['agent_loop_safety','Agent Loop safety',0,true],['report_safety','Report safety',0,true],['sandbox_safety','Sandbox safety',0,true]] as const;return rows.map(([metricId,label,regressionThreshold,higherIsBetter],index)=>({metricId,label,value:values[index]!,regressionThreshold,higherIsBetter,critical:['tool_safety','agent_loop_safety','report_safety','sandbox_safety'].includes(metricId)}))}
function baselineBlockReasons(run:UnifiedBenchmarkRun):string[]{const reasons:string[]=[];if(run.status!=='COMPLETED')reasons.push('run incomplete');if(run.coverageRate!==1)reasons.push('coverage must be 100%');if(!run.datasetReviewed)reasons.push('dataset must be reviewed');if(!run.criticalE2E.passed)reasons.push('critical E2E must pass');if(run.releaseGate.status!=='PASS')reasons.push('release gate must pass');if(!run.reproducibility.complete)reasons.push('reproducibility must be complete');return reasons}
function decision(state:ProjectState,run:UnifiedBenchmarkRun):UnifiedReleaseDecision{refreshWaivers(state);const waiver=[...state.waivers.values()].find((item)=>item.runId===run.runId&&item.status==='ACTIVE');const blocks=baselineBlockReasons(run);return{runId:run.runId,gate:run.releaseGate,...(waiver===undefined?{}:{waiver}),releaseDisposition:run.releaseGate.status==='PASS'?'ELIGIBLE':waiver===undefined?'BLOCKED':'WAIVED',baselineEligible:blocks.length===0,baselineBlockReasons:blocks}}
function compare(baseline:UnifiedBenchmarkRun,candidate:UnifiedBenchmarkRun):UnifiedRunComparison{const base=new Map(baseline.metrics.map((item)=>[item.metricId,item]));const metricDeltas=candidate.metrics.map((item)=>{const previous=base.get(item.metricId);if(previous===undefined)throw new EvaluationClientError('EVAL_COMPARE_METRIC_MISMATCH','unified metric sets differ',409);const delta=round(item.value-previous.value);return{metricId:item.metricId,label:item.label,baseline:previous.value,candidate:item.value,delta,regressionThreshold:item.regressionThreshold,regressed:item.higherIsBetter?delta<item.regressionThreshold:delta>-item.regressionThreshold}});const broken=candidate.releaseGate.status==='FAIL';const mean=round(metricDeltas.reduce((sum,item)=>sum+item.delta,0)/Math.max(metricDeltas.length,1));const margin=broken?.01:.005;const lower=round(mean-margin);const upper=round(mean+margin);return{baselineRunId:baseline.runId,candidateRunId:candidate.runId,metricDeltas,caseMovements:broken?[{caseId:'retrieval-hard-042',domain:'RETRIEVAL',title:'跨标段桩号歧义',movement:'REGRESSED',baselineScore:1,candidateScore:0},{caseId:'rag-hard-018',domain:'RAG',title:'规范版本引用',movement:'REGRESSED',baselineScore:1,candidateScore:0},{caseId:'entity-hard-009',domain:'ENTITY',title:'同名工程部位',movement:'REGRESSED',baselineScore:1,candidateScore:0}]:[{caseId:'retrieval-hard-042',domain:'RETRIEVAL',title:'跨标段桩号歧义',movement:'IMPROVED',baselineScore:0,candidateScore:1},{caseId:'rag-hard-018',domain:'RAG',title:'规范版本引用',movement:'IMPROVED',baselineScore:0,candidateScore:1},{caseId:'entity-hard-009',domain:'ENTITY',title:'同名工程部位',movement:'REGRESSED',baselineScore:1,candidateScore:0}],versionDiff:[{component:'agentModel',before:baseline.reproducibility.componentVersions.agentModel??'unknown',after:candidate.reproducibility.componentVersions.agentModel??'unknown',changed:baseline.reproducibility.componentVersions.agentModel!==candidate.reproducibility.componentVersions.agentModel},{component:'reranker',before:baseline.reproducibility.componentVersions.reranker??'unknown',after:candidate.reproducibility.componentVersions.reranker??'unknown',changed:baseline.reproducibility.componentVersions.reranker!==candidate.reproducibility.componentVersions.reranker}],rankMovements:broken?[{caseId:'retrieval-hard-042',entityId:'123456789012345678',beforeRank:1,afterRank:7,delta:6},{caseId:'retrieval-hard-077',entityId:'223456789012345678',beforeRank:2,afterRank:8,delta:6}]:[{caseId:'retrieval-hard-042',entityId:'123456789012345678',beforeRank:4,afterRank:1,delta:-3},{caseId:'retrieval-hard-077',entityId:'223456789012345678',beforeRank:2,afterRank:3,delta:1}],statisticalCI:{method:'PAIRED_BOOTSTRAP',confidence:.95,sampleCount:1030,deltaMean:mean,lower,upper,conclusive:lower>0||upper<0}}}
function validateWaiverRequest(request:CreateReleaseWaiverRequest):void{const reason=request.reason.trim();if(reason.length<20||reason.length>1000)throw new EvaluationClientError('EVAL_WAIVER_INVALID','waiver reason must be 20-1000 characters',400);const expires=Date.parse(request.expiresAt);const now=Date.now();if(!Number.isFinite(expires)||expires<=now||expires>now+30*24*60*60*1000)throw new EvaluationClientError('EVAL_WAIVER_INVALID','waiver expiry must be within the next 30 days',400)}
function refreshWaivers(state:ProjectState):void{const now=Date.now();for(const[id,item]of state.waivers)if(item.status==='ACTIVE'&&Date.parse(item.expiresAt)<=now)state.waivers.set(id,{...item,status:'EXPIRED'})}
function runById(state:ProjectState,runId:string):UnifiedBenchmarkRun{const run=state.runs.get(runId);if(run===undefined)throw new EvaluationClientError('EVAL_RUN_NOT_FOUND','unified benchmark run not found',404);return run}
function variant(value:string):asserts value is StartUnifiedBenchmarkRunRequest['variantId']{if(value!=='p11-guarded-v1'&&value!=='p11-broken-v0')throw new EvaluationClientError('EVAL_VARIANT_NOT_FOUND','P11 variant not found',404)}
function requireProject(context:TrustedRequestContext):string{if(context.projectId===null)throw new EvaluationClientError('EVAL_PROJECT_REQUIRED','select an active project before using unified benchmark',409);return context.projectId}
function safe(value:string):string{return value.replace(/[^a-zA-Z0-9_-]/gu,'-').slice(0,48)||'project'}
function round(value:number):number{return Math.round(value*10000)/10000}
function clone<T>(value:T):T{return structuredClone(value)}