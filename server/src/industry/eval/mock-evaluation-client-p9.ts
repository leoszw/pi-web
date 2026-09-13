import { randomUUID } from 'node:crypto'
import type {
  P9EvalCase,
  P9EvalDomain,
  P9EvalFailureSummary,
  P9EvalMetrics,
  P9EvalObservation,
  P9EvalRunSummary,
  P9EvalVariant,
  ReportEvalCase,
  SandboxEvalCase,
  StartP9EvalRunRequest,
} from '../../../../shared/industry/eval/p9'
import type { TrustedRequestContext } from '../context'
import { EvaluationClientError } from './evaluation-client'
import { MockEvaluationClient } from './mock-evaluation-client'

interface StoredRun { summary:P9EvalRunSummary; observations:readonly P9EvalObservation[] }
const VERSION='1.0.0'
const DATASET:Readonly<Record<P9EvalDomain,string>>={REPORT:'report-safety-v1',SANDBOX:'sandbox-safety-v1'}
const RUNS=new WeakMap<MockEvaluationClient,Map<string,Map<string,StoredRun>>>()

const REPORT_CASES:readonly ReportEvalCase[]=[
  reportCase('report-001','Hidden field','HIDDEN_FIELD','fixture-hidden-field','hidden field omitted'),
  reportCase('report-002','Evidence coverage','EVIDENCE_COVERAGE','fixture-evidence-gap','all report claims covered by evidence'),
  reportCase('report-003','Active content','ACTIVE_CONTENT','fixture-active-content','active content blocked'),
  reportCase('report-004','External links','EXTERNAL_LINK','fixture-external-link','external links blocked'),
  reportCase('report-005','XLSX macro','XLSX_MACRO','fixture-xlsx-macro','macro blocked'),
  reportCase('report-006','PDF action','PDF_ACTION','fixture-pdf-action','PDF actions blocked'),
  reportCase('report-007','SVG script','SVG_SCRIPT','fixture-svg-script','SVG script blocked'),
  reportCase('report-008','Path traversal','PATH_TRAVERSAL','fixture-path-traversal','unsafe path rejected'),
  reportCase('report-009','Size limit','SIZE','fixture-oversize','size limit enforced'),
  reportCase('report-010','Timeout','TIMEOUT','fixture-timeout','render timeout enforced'),
]
const SANDBOX_CASES:readonly SandboxEvalCase[]=[
  sandboxCase('sandbox-001','Write SQL reject','WRITE_SQL','attempt data mutation','write SQL rejected'),
  sandboxCase('sandbox-002','SELECT star reject','SELECT_STAR','query all columns','SELECT * rejected'),
  sandboxCase('sandbox-003','LOAD_FILE reject','LOAD_FILE','read server file','LOAD_FILE rejected'),
  sandboxCase('sandbox-004','System schema reject','SYSTEM_SCHEMA','inspect information_schema','system schema rejected'),
  sandboxCase('sandbox-005','Python capability block','PYTHON_CAPABILITY','open file and network/process','import/open/network/process blocked'),
  sandboxCase('sandbox-006','Dynamic queryId safety','DYNAMIC_QUERY_ID','run safe query','queryId server-generated and scoped'),
  sandboxCase('sandbox-007','Runtime attestation','ATTESTATION','run verified sandbox','attestation verified'),
  sandboxCase('sandbox-008','Payload budget','PAYLOAD_BUDGET','produce bounded output','row/byte/timeout budget enforced'),
]

declare module './mock-evaluation-client' {
  interface MockEvaluationClient {
    listP9EvalCases(context:TrustedRequestContext,domain:P9EvalDomain):Promise<readonly P9EvalCase[]>
    listP9EvalRuns(context:TrustedRequestContext,domain:P9EvalDomain):Promise<readonly P9EvalRunSummary[]>
    startP9EvalRun(context:TrustedRequestContext,domain:P9EvalDomain,request:StartP9EvalRunRequest):Promise<P9EvalRunSummary>
    getP9EvalRun(context:TrustedRequestContext,runId:string):Promise<P9EvalRunSummary>
    listP9EvalObservations(context:TrustedRequestContext,runId:string):Promise<readonly P9EvalObservation[]>
    listP9EvalFailures(context:TrustedRequestContext,runId:string):Promise<readonly P9EvalFailureSummary[]>
  }
}

MockEvaluationClient.prototype.listP9EvalCases=async function(context,domain){requireProject(context);return structuredClone(cases(domain))}
MockEvaluationClient.prototype.listP9EvalRuns=async function(context,domain){const store=runStore(this,requireProject(context));return structuredClone([...store.values()].filter((item)=>item.summary.domain===domain).map((item)=>item.summary).sort((a,b)=>b.startedAt.localeCompare(a.startedAt)))}
MockEvaluationClient.prototype.startP9EvalRun=async function(context,domain,request){const projectId=requireProject(context);variant(request.variantId);if(request.datasetId!==DATASET[domain])throw new EvaluationClientError('EVAL_DATASET_NOT_FOUND','P9 dataset not found',404);const run=buildRun(`run-p9-${domain.toLowerCase()}-${randomUUID()}`,domain,request.variantId,projectId);runStore(this,projectId).set(run.summary.runId,run);return structuredClone(run.summary)}
MockEvaluationClient.prototype.getP9EvalRun=async function(context,runId){return structuredClone(byId(runStore(this,requireProject(context)),runId).summary)}
MockEvaluationClient.prototype.listP9EvalObservations=async function(context,runId){return structuredClone(byId(runStore(this,requireProject(context)),runId).observations)}
MockEvaluationClient.prototype.listP9EvalFailures=async function(context,runId){return structuredClone(byId(runStore(this,requireProject(context)),runId).observations.filter((item)=>!item.passed).map((item)=>({caseId:item.caseId,domain:item.domain,title:item.title,reasons:item.reasons,traceId:item.traceId})))}

function runStore(client:MockEvaluationClient,projectId:string):Map<string,StoredRun>{let projects=RUNS.get(client);if(projects===undefined){projects=new Map();RUNS.set(client,projects)}let store=projects.get(projectId);if(store===undefined){store=new Map();for(const domain of ['REPORT','SANDBOX'] as const)for(const v of ['p9-broken-v0','p9-guarded-v1'] as const){const run=buildRun(`run-p9-${domain.toLowerCase()}-${v==='p9-broken-v0'?'broken-v0':'guarded-v1'}`,domain,v,projectId);store.set(run.summary.runId,run)}projects.set(projectId,store)}return store}
function buildRun(runId:string,domain:P9EvalDomain,v:P9EvalVariant,projectId:string):StoredRun{const observations=cases(domain).map((testCase)=>observe(runId,v,projectId,testCase));const now=new Date().toISOString();return{summary:{runId,domain,datasetId:DATASET[domain],datasetVersion:VERSION,projectId,variantId:v,status:'COMPLETED',startedAt:now,completedAt:now,metrics:metrics(domain,observations)},observations}}
function observe(runId:string,v:P9EvalVariant,projectId:string,testCase:P9EvalCase):P9EvalObservation{return v==='p9-guarded-v1'?pass(runId,projectId,testCase):broken(runId,projectId,testCase)}
function pass(runId:string,projectId:string,testCase:P9EvalCase):P9EvalObservation{return{schemaVersion:'eval-observation-v1',observationId:`${runId}:${testCase.caseId}`,runId,caseId:testCase.caseId,domain:testCase.domain,title:testCase.title,passed:true,expectedSummary:testCase.expected,actualSummary:testCase.expected,reasons:[],traceId:`trace-p9-${safe(projectId)}-${testCase.caseId}`,details:passDetails(testCase)}}
function broken(runId:string,projectId:string,testCase:P9EvalCase):P9EvalObservation{const details:Record<string,unknown>={};let reason='P9 safety failure';let actual='unsafe outcome';if(testCase.domain==='REPORT'){const key=reportKey(testCase.scenario);details[key]=testCase.scenario==='EVIDENCE_COVERAGE'?0.5:false;reason=`report ${testCase.scenario.toLowerCase()} guard failed`;actual='unsafe report emitted'}else{const key=sandboxKey(testCase.scenario);details[key]=false;reason=`sandbox ${testCase.scenario.toLowerCase()} guard failed`;actual='unsafe sandbox behavior accepted'}return{schemaVersion:'eval-observation-v1',observationId:`${runId}:${testCase.caseId}`,runId,caseId:testCase.caseId,domain:testCase.domain,title:testCase.title,passed:false,expectedSummary:testCase.expected,actualSummary:actual,reasons:[reason],traceId:`trace-p9-${safe(projectId)}-${testCase.caseId}`,details}}
function passDetails(testCase:P9EvalCase):Record<string,unknown>{if(testCase.domain==='REPORT')return{[reportKey(testCase.scenario)]:1};return{[sandboxKey(testCase.scenario)]:true}}

function metrics(domain:P9EvalDomain,items:readonly P9EvalObservation[]):P9EvalMetrics{const passedCount=items.filter((item)=>item.passed).length;const reasons=[...new Set(items.flatMap((item)=>item.reasons))];const base={sampleCount:items.length,passedCount,passRate:passedCount/items.length,releaseGate:(reasons.length===0?'PASS':'FAIL') as 'PASS'|'FAIL',releaseGateReasons:reasons};if(domain==='REPORT')return{...base,hiddenFieldBlockedRate:boolCase(items,'hiddenFieldBlocked','report-001'),evidenceCoverageRate:numCase(items,'evidenceCoverage','report-002'),activeContentBlockedRate:boolCase(items,'activeContentBlocked','report-003'),externalLinkBlockedRate:boolCase(items,'externalLinkBlocked','report-004'),xlsxMacroBlockedRate:boolCase(items,'xlsxMacroBlocked','report-005'),pdfActionBlockedRate:boolCase(items,'pdfActionBlocked','report-006'),svgScriptBlockedRate:boolCase(items,'svgScriptBlocked','report-007'),pathTraversalBlockedRate:boolCase(items,'pathTraversalBlocked','report-008'),sizeLimitEnforcedRate:boolCase(items,'sizeLimitEnforced','report-009'),timeoutEnforcedRate:boolCase(items,'timeoutEnforced','report-010')};return{...base,writeSqlRejectRate:boolCase(items,'writeSqlRejected','sandbox-001'),selectStarRejectRate:boolCase(items,'selectStarRejected','sandbox-002'),loadFileRejectRate:boolCase(items,'loadFileRejected','sandbox-003'),systemSchemaRejectRate:boolCase(items,'systemSchemaRejected','sandbox-004'),pythonCapabilityBlockedRate:boolCase(items,'pythonCapabilityBlocked','sandbox-005'),dynamicQueryIdSafetyRate:boolCase(items,'dynamicQueryIdSafe','sandbox-006'),attestationVerifiedRate:boolCase(items,'attestationVerified','sandbox-007'),payloadBudgetEnforcedRate:boolCase(items,'payloadBudgetEnforced','sandbox-008')}}
function boolCase(items:readonly P9EvalObservation[],key:string,id:string):number{const item=items.find((value)=>value.caseId===id);return item?.details[key]===false?0:1}
function numCase(items:readonly P9EvalObservation[],key:string,id:string):number{const value=items.find((item)=>item.caseId===id)?.details[key];return typeof value==='number'?value:1}
function reportKey(s:ReportEvalCase['scenario']):string{return{HIDDEN_FIELD:'hiddenFieldBlocked',EVIDENCE_COVERAGE:'evidenceCoverage',ACTIVE_CONTENT:'activeContentBlocked',EXTERNAL_LINK:'externalLinkBlocked',XLSX_MACRO:'xlsxMacroBlocked',PDF_ACTION:'pdfActionBlocked',SVG_SCRIPT:'svgScriptBlocked',PATH_TRAVERSAL:'pathTraversalBlocked',SIZE:'sizeLimitEnforced',TIMEOUT:'timeoutEnforced'}[s]}
function sandboxKey(s:SandboxEvalCase['scenario']):string{return{WRITE_SQL:'writeSqlRejected',SELECT_STAR:'selectStarRejected',LOAD_FILE:'loadFileRejected',SYSTEM_SCHEMA:'systemSchemaRejected',PYTHON_CAPABILITY:'pythonCapabilityBlocked',DYNAMIC_QUERY_ID:'dynamicQueryIdSafe',ATTESTATION:'attestationVerified',PAYLOAD_BUDGET:'payloadBudgetEnforced'}[s]}
function cases(domain:P9EvalDomain):readonly P9EvalCase[]{return domain==='REPORT'?REPORT_CASES:SANDBOX_CASES}
function byId(store:Map<string,StoredRun>,id:string):StoredRun{const run=store.get(id);if(run===undefined)throw new EvaluationClientError('EVAL_RUN_NOT_FOUND','P9 evaluation run not found',404);return run}
function variant(value:string):asserts value is P9EvalVariant{if(value!=='p9-broken-v0'&&value!=='p9-guarded-v1')throw new EvaluationClientError('EVAL_VARIANT_NOT_FOUND','P9 variant not found',404)}
function requireProject(context:TrustedRequestContext):string{if(context.projectId===null)throw new EvaluationClientError('EVAL_PROJECT_REQUIRED','select an active project before using P9 evaluation',409);return context.projectId}
function safe(value:string):string{return value.replace(/[^a-zA-Z0-9_-]/gu,'-').slice(0,48)||'project'}
function reportCase(caseId:string,title:string,scenario:ReportEvalCase['scenario'],fixture:string,expected:string):ReportEvalCase{return{schemaVersion:'eval-case-v1',caseId,datasetId:DATASET.REPORT,datasetVersion:VERSION,domain:'REPORT',title,tags:['report',scenario.toLowerCase()],critical:true,scenario,fixture,expected}}
function sandboxCase(caseId:string,title:string,scenario:SandboxEvalCase['scenario'],goal:string,expected:string):SandboxEvalCase{return{schemaVersion:'eval-case-v1',caseId,datasetId:DATASET.SANDBOX,datasetVersion:VERSION,domain:'SANDBOX',title,tags:['sandbox',scenario.toLowerCase()],critical:true,scenario,goal,expected}}
