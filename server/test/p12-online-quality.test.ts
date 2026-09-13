import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextService } from '../src/industry/context'
import '../src/industry/eval/mock-evaluation-client-mutation'
import '../src/industry/eval/mock-evaluation-client-p7'
import '../src/industry/eval/mock-evaluation-client-p8'
import '../src/industry/eval/mock-evaluation-client-p9'
import '../src/industry/eval/mock-evaluation-client-p11'
import '../src/industry/eval/mock-evaluation-client-p11-hardening'
import '../src/industry/eval/mock-evaluation-client-p12'
import '../src/industry/eval/mock-evaluation-client-rag'
import '../src/industry/eval/mock-evaluation-client-retrieval'
import '../src/industry/eval/mock-evaluation-client-trace'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import '../src/industry/knowledge/mock-industry-agent-client-knowledge'
import '../src/industry/p8/mock-industry-agent-client-p8'
import '../src/industry/p9/mock-industry-agent-client-p9'
import '../src/industry/p10/mock-industry-agent-client-p10'
import { createIndustryRouter } from '../src/industry/router'
import '../src/industry/trace/mock-industry-agent-client-retrieval-debug'

function principal(permissions:readonly string[]):AuthPrincipal{return{subject:'subject-p12',userId:'user-1',tenantId:'tenant-1',companyIds:['company-1'],roles:['project-user'],permissions,sessionId:`session-p12-${permissions.join('-')||'none'}`}}
function makeRouter(permissions:readonly string[]){const client=new MockIndustryAgentClient([{tenantId:'tenant-1',projectId:'project-1',companyId:'company-1',name:'Project One'},{tenantId:'tenant-1',projectId:'project-2',companyId:'company-1',name:'Project Two'}]);return createIndustryRouter({mode:'control-plane',principalProvider:new MockPrincipalProvider(principal(permissions)),client,evaluationClient:new MockEvaluationClient(),contextService:new IndustryContextService(client),allowedOrigins:new Set(['http://127.0.0.1']),jsonBodyLimitBytes:32_768})}
async function withServer(router:ReturnType<typeof createIndustryRouter>,run:(baseUrl:string)=>Promise<void>):Promise<void>{const server=http.createServer((req,res)=>{void router(req,res).then((handled)=>{if(!handled){res.writeHead(404);res.end()}})});await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.notEqual(address,null);try{await run(`http://127.0.0.1:${(address as {port:number}).port}`)}finally{await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))}}
const headers=()=>({'content-type':'application/json',origin:'http://127.0.0.1'})
async function post(baseUrl:string,path:string,body:unknown){return fetch(`${baseUrl}${path}`,{method:'POST',headers:headers(),body:JSON.stringify(body)})}
async function selectProject(baseUrl:string,projectId='project-1'){const response=await post(baseUrl,'/api/industry/v1/context/project',{projectId});assert.equal(response.status,200)}

const fullPermissions=['quality.read','quality.feedback.edit','quality.feedback.review','eval.dataset.edit','trace.read.basic'] as const

test('P12 dashboard requires quality.read and active project',async()=>{
  await withServer(makeRouter([]),async(baseUrl)=>{await selectProject(baseUrl);const response=await fetch(`${baseUrl}/api/industry/v1/quality/online`);assert.equal(response.status,403);assert.equal(((await response.json()) as {error:{code:string}}).error.code,'QUALITY_ACCESS_DENIED')})
  await withServer(makeRouter(['eval.admin']),async(baseUrl)=>{await selectProject(baseUrl);const response=await fetch(`${baseUrl}/api/industry/v1/quality/online`);assert.equal(response.status,403)})
  await withServer(makeRouter(['quality.read']),async(baseUrl)=>{const response=await fetch(`${baseUrl}/api/industry/v1/quality/online`);assert.equal(response.status,409)})
})

test('P12 dashboard exposes all planned online quality metrics and trace-backed signals',async()=>{await withServer(makeRouter(['quality.read']),async(baseUrl)=>{
  await selectProject(baseUrl);const response=await fetch(`${baseUrl}/api/industry/v1/quality/online`);assert.equal(response.status,200);const body=await response.json() as {data:{source:string;sampleCount:number;metrics:Array<{metricId:string;status:string}>;signals:Array<{traceIds:string[]}>}};assert.equal(body.data.source,'MOCK_FIXTURE');assert.equal(body.data.sampleCount,500);assert.equal(body.data.metrics.length,11);assert.deepEqual(new Set(body.data.metrics.map((item)=>item.metricId)),new Set(['INTENT_DRIFT_RATE','CLARIFICATION_RATE','ZERO_RETRIEVAL_RATE','LOW_CONFIDENCE_RATE','TOOL_ERROR_RATE','MUTATION_REJECT_RATE','RAG_INSUFFICIENT_EVIDENCE_RATE','P95_LATENCY_MS','AVG_TOKENS','AVG_COST_USD','USER_CORRECTION_RATE']));assert.ok(body.data.metrics.some((item)=>item.status==='WARN'));assert.ok(body.data.signals.flatMap((item)=>item.traceIds).includes('trace-project-1-retrieval-001'))
})})

test('P12 trace feedback follows sanitize draft label review version with no Golden path',async()=>{await withServer(makeRouter(fullPermissions),async(baseUrl)=>{
  await selectProject(baseUrl)
  const injected=await post(baseUrl,'/api/industry/v1/quality/feedback/from-trace',{traceId:'trace-project-1-retrieval-001',targetDomain:'RETRIEVAL',projectId:'project-2'});assert.equal(injected.status,400)
  const created=await post(baseUrl,'/api/industry/v1/quality/feedback/from-trace',{traceId:'trace-project-1-retrieval-001',targetDomain:'RAG'});assert.equal(created.status,201);const createdText=await created.text();assert.equal(/Bearer\s+[^[]|sk-[A-Za-z0-9]|approval-private|mysql:\/\//u.test(createdText),false);const item=JSON.parse(createdText) as {data:{feedbackId:string;stage:string;sanitization:{removedPromptContent:boolean;sourceScopeTrusted:boolean};projectId:string}};assert.equal(item.data.stage,'SANITIZED');assert.equal(item.data.projectId,'project-1');assert.equal(item.data.sanitization.removedPromptContent,true);assert.equal(item.data.sanitization.sourceScopeTrusted,true)
  const earlyLabel=await post(baseUrl,`/api/industry/v1/quality/feedback/${item.data.feedbackId}/label`,{label:'RAG_QA',tags:['rag'],difficulty:'HARD'});assert.equal(earlyLabel.status,409)
  const injectedDraft=await post(baseUrl,`/api/industry/v1/quality/feedback/${item.data.feedbackId}/draft`,{golden:true});assert.equal(injectedDraft.status,400)
  const draft=await post(baseUrl,`/api/industry/v1/quality/feedback/${item.data.feedbackId}/draft`,{});assert.equal(draft.status,200);assert.equal(((await draft.json()) as {data:{stage:string}}).data.stage,'DRAFT')
  const labeled=await post(baseUrl,`/api/industry/v1/quality/feedback/${item.data.feedbackId}/label`,{label:'RAG_INSUFFICIENT_EVIDENCE',tags:['rag','online'],difficulty:'HARD',notes:'Human-labeled online case'});assert.equal(labeled.status,200);const labeledBody=await labeled.json() as {data:{stage:string;humanLabel:{labeledBy:string}}};assert.equal(labeledBody.data.stage,'LABELED');assert.equal(labeledBody.data.humanLabel.labeledBy,'user-1')
  const reviewed=await post(baseUrl,`/api/industry/v1/quality/feedback/${item.data.feedbackId}/review`,{approved:true,reviewNote:'Evidence checked'});assert.equal(reviewed.status,200);const reviewedBody=await reviewed.json() as {data:{stage:string;review:{reviewedBy:string}}};assert.equal(reviewedBody.data.stage,'REVIEWED');assert.equal(reviewedBody.data.review.reviewedBy,'user-1')
  const versioned=await post(baseUrl,`/api/industry/v1/quality/feedback/${item.data.feedbackId}/version`,{});assert.equal(versioned.status,200);const versionedBody=await versioned.json() as {data:{stage:string;datasetVersion:{status:string;golden:boolean;version:string}}};assert.equal(versionedBody.data.stage,'VERSIONED');assert.equal(versionedBody.data.datasetVersion.status,'REVIEWED');assert.equal(versionedBody.data.datasetVersion.golden,false);assert.match(versionedBody.data.datasetVersion.version,/^1\.0\.\d+$/u)
  const repeatVersion=await post(baseUrl,`/api/industry/v1/quality/feedback/${item.data.feedbackId}/version`,{});assert.equal(repeatVersion.status,409)
  for(const path of [`/api/industry/v1/quality/feedback/${item.data.feedbackId}/golden`,`/api/industry/v1/quality/feedback/${item.data.feedbackId}/promote`])assert.equal((await post(baseUrl,path,{})).status,404)
  const versions=await fetch(`${baseUrl}/api/industry/v1/quality/dataset/versions`);const versionsBody=await versions.json() as {data:Array<{status:string;golden:boolean;sourceFeedbackIds:string[]}>};assert.ok(versionsBody.data.some((entry)=>entry.sourceFeedbackIds.includes(item.data.feedbackId)&&entry.status==='REVIEWED'&&!entry.golden))
})})

test('P12 write permissions are layered and Trace/Dataset governance remain independent',async()=>{
  await withServer(makeRouter(['quality.feedback.edit','trace.read.basic']),async(baseUrl)=>{await selectProject(baseUrl);const response=await post(baseUrl,'/api/industry/v1/quality/feedback/from-trace',{traceId:'trace-project-1-retrieval-001',targetDomain:'RETRIEVAL'});assert.equal(response.status,403)})
  await withServer(makeRouter(['quality.read','quality.feedback.edit']),async(baseUrl)=>{await selectProject(baseUrl);const response=await post(baseUrl,'/api/industry/v1/quality/feedback/from-trace',{traceId:'trace-project-1-retrieval-001',targetDomain:'RETRIEVAL'});assert.equal(response.status,403);assert.equal(((await response.json()) as {error:{code:string}}).error.code,'TRACE_ACCESS_DENIED')})
  await withServer(makeRouter(['quality.admin','eval.dataset.edit']),async(baseUrl)=>{await selectProject(baseUrl);const response=await post(baseUrl,'/api/industry/v1/quality/feedback/from-trace',{traceId:'trace-project-1-retrieval-001',targetDomain:'RETRIEVAL'});assert.equal(response.status,403);assert.equal(((await response.json()) as {error:{code:string}}).error.code,'TRACE_ACCESS_DENIED')})
  await withServer(makeRouter(['quality.read','quality.feedback.review']),async(baseUrl)=>{await selectProject(baseUrl);const seeded=(await (await fetch(`${baseUrl}/api/industry/v1/quality/feedback`)).json()) as {data:Array<{feedbackId:string;stage:string}>};const reviewed=seeded.data.find((item)=>item.stage==='REVIEWED');assert.ok(reviewed);const version=await post(baseUrl,`/api/industry/v1/quality/feedback/${reviewed.feedbackId}/version`,{});assert.equal(version.status,403)})
  await withServer(makeRouter(['quality.admin']),async(baseUrl)=>{await selectProject(baseUrl);const seeded=(await (await fetch(`${baseUrl}/api/industry/v1/quality/feedback`)).json()) as {data:Array<{feedbackId:string;stage:string}>};const reviewed=seeded.data.find((item)=>item.stage==='REVIEWED');assert.ok(reviewed);assert.equal((await post(baseUrl,`/api/industry/v1/quality/feedback/${reviewed.feedbackId}/version`,{})).status,403)})
  await withServer(makeRouter(['quality.admin','eval.dataset.edit']),async(baseUrl)=>{await selectProject(baseUrl);const seeded=(await (await fetch(`${baseUrl}/api/industry/v1/quality/feedback`)).json()) as {data:Array<{feedbackId:string;stage:string}>};const reviewed=seeded.data.find((item)=>item.stage==='REVIEWED');assert.ok(reviewed);assert.equal((await post(baseUrl,`/api/industry/v1/quality/feedback/${reviewed.feedbackId}/version`,{})).status,200)})
})

test('P12 feedback is project isolated and Dataset Health exposes all planned health dimensions',async()=>{await withServer(makeRouter(fullPermissions),async(baseUrl)=>{
  await selectProject(baseUrl);const created=await post(baseUrl,'/api/industry/v1/quality/feedback/from-trace',{traceId:'trace-project-1-retrieval-001',targetDomain:'TOOL'});const feedback=(await created.json()) as {data:{feedbackId:string}};await selectProject(baseUrl,'project-2');const hidden=await fetch(`${baseUrl}/api/industry/v1/quality/feedback/${encodeURIComponent(feedback.data.feedbackId)}`);assert.equal(hidden.status,404)
  const health=await fetch(`${baseUrl}/api/industry/v1/quality/dataset/health`);assert.equal(health.status,200);const body=await health.json() as {data:{source:string;reviewedPercent:number;hardAdversarialCount:number;tagDistribution:unknown[];duplicateCount:number;nearDuplicateCount:number;holdoutLeakageCount:number;labelChurnRate:number;lastReviewAgeDays:number;issues:unknown[]}};assert.equal(body.data.source,'MOCK_FIXTURE');assert.ok(body.data.reviewedPercent>=0&&body.data.reviewedPercent<=1);assert.ok(body.data.hardAdversarialCount>=1);assert.ok(Array.isArray(body.data.tagDistribution));assert.equal(body.data.duplicateCount,1);assert.equal(body.data.nearDuplicateCount,2);assert.equal(body.data.holdoutLeakageCount,0);assert.equal(body.data.labelChurnRate,.08);assert.equal(body.data.lastReviewAgeDays,2);assert.ok(body.data.issues.length>=3)
})})
