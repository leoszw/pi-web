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

function principal(permissions:readonly string[]):AuthPrincipal{return{subject:'subject-p11',userId:'user-p11',tenantId:'tenant-1',companyIds:['company-1'],roles:['project-user'],permissions,sessionId:`session-p11-${permissions.join('-')||'none'}`}}
function makeRouter(permissions:readonly string[]){const client=new MockIndustryAgentClient([{tenantId:'tenant-1',projectId:'project-1',companyId:'company-1',name:'Project One'},{tenantId:'tenant-1',projectId:'project-2',companyId:'company-1',name:'Project Two'}]);return createIndustryRouter({mode:'control-plane',principalProvider:new MockPrincipalProvider(principal(permissions)),client,evaluationClient:new MockEvaluationClient(),contextService:new IndustryContextService(client),allowedOrigins:new Set(['http://127.0.0.1']),jsonBodyLimitBytes:16_384})}
async function withServer(router:ReturnType<typeof createIndustryRouter>,run:(baseUrl:string)=>Promise<void>):Promise<void>{const server=http.createServer((req,res)=>{void router(req,res).then((handled)=>{if(!handled){res.writeHead(404);res.end()}})});await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.notEqual(address,null);try{await run(`http://127.0.0.1:${(address as {port:number}).port}`)}finally{await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))}}
const headers=()=>({'content-type':'application/json',origin:'http://127.0.0.1'})
async function selectProject(baseUrl:string,projectId='project-1'){const response=await fetch(`${baseUrl}/api/industry/v1/context/project`,{method:'POST',headers:headers(),body:JSON.stringify({projectId})});assert.equal(response.status,200)}
async function post(baseUrl:string,path:string,body:unknown){return fetch(`${baseUrl}${path}`,{method:'POST',headers:headers(),body:JSON.stringify(body)})}

test('P11 requires active project and explicit eval permissions',async()=>{
  await withServer(makeRouter([]),async(baseUrl)=>{await selectProject(baseUrl);const response=await fetch(`${baseUrl}/api/industry/v1/eval/p11/corpus`);assert.equal(response.status,403);assert.equal(((await response.json()) as {error:{code:string}}).error.code,'EVAL_ACCESS_DENIED')})
  await withServer(makeRouter(['eval.read']),async(baseUrl)=>{const response=await fetch(`${baseUrl}/api/industry/v1/eval/p11/corpus`);assert.equal(response.status,409)})
  await withServer(makeRouter(['eval.baseline.accept']),async(baseUrl)=>{await selectProject(baseUrl);const response=await post(baseUrl,'/api/industry/v1/eval/p11/runs/run-p11-candidate-v2/accept-baseline',{});assert.equal(response.status,403)})
  await withServer(makeRouter(['eval.waiver.create']),async(baseUrl)=>{await selectProject(baseUrl);const response=await post(baseUrl,'/api/industry/v1/eval/p11/runs/run-p11-broken-v0/waivers',{reason:'documented release exception for incident mitigation',expiresAt:new Date(Date.now()+86400000).toISOString()});assert.equal(response.status,403)})
})

test('P11 corpus manifest models reviewed 1030 Golden/Hard coverage with stable fingerprint',async()=>{await withServer(makeRouter(['eval.read']),async(baseUrl)=>{
  await selectProject(baseUrl);const response=await fetch(`${baseUrl}/api/industry/v1/eval/p11/corpus`);assert.equal(response.status,200);const body=await response.json() as {data:{status:string;totalCaseCount:number;goldenCount:number;hardCount:number;criticalCaseCount:number;fullCoverageRequired:boolean;fingerprint:string;domainCounts:Array<{domain:string;caseCount:number}>}};assert.equal(body.data.status,'REVIEWED');assert.equal(body.data.totalCaseCount,1030);assert.equal(body.data.goldenCount+body.data.hardCount,1030);assert.equal(body.data.fullCoverageRequired,true);assert.match(body.data.fingerprint,/^sha256:[a-f0-9]{64}$/u);assert.equal(body.data.domainCounts.reduce((sum,item)=>sum+item.caseCount,0),1030);for(const domain of ['MULTIMODAL','AGENT_LOOP','REPORT','SANDBOX'])assert.ok(body.data.domainCounts.some((item)=>item.domain===domain))
})})

test('guarded unified runs have full coverage critical E2E reproducibility and mock PI gate PASS',async()=>{await withServer(makeRouter(['eval.read','eval.run']),async(baseUrl)=>{
  await selectProject(baseUrl);const created=await post(baseUrl,'/api/industry/v1/eval/p11/runs',{corpusId:'phase11-unified-corpus-v1',variantId:'p11-guarded-v1'});assert.equal(created.status,201);const run=await created.json() as {data:{runId:string;coveredCaseCount:number;coverageRate:number;datasetReviewed:boolean;criticalE2E:{passed:boolean;total:number;passedCount:number};releaseGate:{status:string;source:string};reproducibility:{complete:boolean;corpusFingerprint:string};corpusFingerprint:string}};assert.equal(run.data.coveredCaseCount,1030);assert.equal(run.data.coverageRate,1);assert.equal(run.data.datasetReviewed,true);assert.equal(run.data.criticalE2E.passed,true);assert.equal(run.data.criticalE2E.passedCount,run.data.criticalE2E.total);assert.equal(run.data.releaseGate.status,'PASS');assert.equal(run.data.releaseGate.source,'MOCK_PI');assert.equal(run.data.reproducibility.complete,true);assert.equal(run.data.reproducibility.corpusFingerprint,run.data.corpusFingerprint)
  const injected=await post(baseUrl,'/api/industry/v1/eval/p11/runs',{corpusId:'phase11-unified-corpus-v1',variantId:'p11-guarded-v1',projectId:'project-2',gate:'PASS'});assert.equal(injected.status,400)
})})

test('baseline requires explicit accept and rejects incomplete or FAIL runs',async()=>{await withServer(makeRouter(['eval.read','eval.baseline.accept','eval.waiver.create']),async(baseUrl)=>{
  await selectProject(baseUrl);const baseline=await (await fetch(`${baseUrl}/api/industry/v1/eval/p11/baseline`)).json() as {data:{runId:string;explicit:boolean;acceptedBy:string}};assert.equal(baseline.data.runId,'run-p11-baseline-v1');assert.equal(baseline.data.explicit,true)
  const rejected=await post(baseUrl,'/api/industry/v1/eval/p11/runs/run-p11-broken-v0/accept-baseline',{});assert.equal(rejected.status,409);assert.equal(((await rejected.json()) as {error:{code:string}}).error.code,'EVAL_BASELINE_NOT_ELIGIBLE')
  const accepted=await post(baseUrl,'/api/industry/v1/eval/p11/runs/run-p11-candidate-v2/accept-baseline',{});assert.equal(accepted.status,201);const acceptedBody=await accepted.json() as {data:{runId:string;acceptedBy:string;explicit:boolean}};assert.equal(acceptedBody.data.runId,'run-p11-candidate-v2');assert.equal(acceptedBody.data.acceptedBy,'user-p11');assert.equal(acceptedBody.data.explicit,true)
  const current=await (await fetch(`${baseUrl}/api/industry/v1/eval/p11/baseline`)).json() as {data:{runId:string}};assert.equal(current.data.runId,'run-p11-candidate-v2')
})})

test('P11 compare returns coherent metric thresholds movements version/rank diff and paired CI',async()=>{await withServer(makeRouter(['eval.read']),async(baseUrl)=>{
  await selectProject(baseUrl);const response=await post(baseUrl,'/api/industry/v1/eval/p11/compare',{baselineRunId:'run-p11-baseline-v1',candidateRunId:'run-p11-candidate-v2'});assert.equal(response.status,200);const body=await response.json() as {data:{metricDeltas:Array<{metricId:string;delta:number;regressionThreshold:number;regressed:boolean}>;caseMovements:Array<{movement:string}>;versionDiff:Array<{component:string;changed:boolean}>;rankMovements:Array<{entityId:string;beforeRank:number;afterRank:number}>;statisticalCI:{method:string;confidence:number;sampleCount:number;deltaMean:number;lower:number;upper:number;conclusive:boolean}}};assert.ok(body.data.metricDeltas.length>=8);assert.ok(body.data.metricDeltas.every((item)=>typeof item.regressionThreshold==='number'));assert.ok(body.data.caseMovements.some((item)=>item.movement==='IMPROVED'));assert.ok(body.data.caseMovements.some((item)=>item.movement==='REGRESSED'));assert.ok(body.data.versionDiff.some((item)=>item.component==='agentModel'&&item.changed));assert.equal(body.data.rankMovements[0]?.entityId,'123456789012345678');assert.equal(typeof body.data.rankMovements[0]?.entityId,'string');assert.equal(body.data.statisticalCI.method,'PAIRED_BOOTSTRAP');assert.equal(body.data.statisticalCI.confidence,.95);assert.equal(body.data.statisticalCI.sampleCount,1030)
  const broken=await (await post(baseUrl,'/api/industry/v1/eval/p11/compare',{baselineRunId:'run-p11-baseline-v1',candidateRunId:'run-p11-broken-v0'})).json() as {data:{caseMovements:Array<{movement:string}>;rankMovements:Array<{delta:number}>;statisticalCI:{deltaMean:number;upper:number;conclusive:boolean}}};assert.ok(broken.data.caseMovements.every((item)=>item.movement==='REGRESSED'));assert.ok(broken.data.rankMovements.every((item)=>item.delta>0));assert.ok(broken.data.statisticalCI.deltaMean<0);assert.ok(broken.data.statisticalCI.upper<0);assert.equal(broken.data.statisticalCI.conclusive,true)
})})

test('waiver is separate from mock PI gate, unique while active, and never makes a FAIL run baseline eligible',async()=>{await withServer(makeRouter(['eval.read','eval.waiver.create','eval.baseline.accept']),async(baseUrl)=>{
  await selectProject(baseUrl)
  const passWaiver=await post(baseUrl,'/api/industry/v1/eval/p11/runs/run-p11-candidate-v2/waivers',{reason:'this should not be accepted because the gate already passed',expiresAt:new Date(Date.now()+86400000).toISOString()});assert.equal(passWaiver.status,409)
  const injected=await post(baseUrl,'/api/industry/v1/eval/p11/runs/run-p11-broken-v0/waivers',{reason:'documented temporary release exception for external validation',expiresAt:new Date(Date.now()+86400000).toISOString(),projectId:'project-2',gate:'PASS'});assert.equal(injected.status,400)
  const input={reason:'documented temporary release exception for external validation',expiresAt:new Date(Date.now()+86400000).toISOString()};const waiver=await post(baseUrl,'/api/industry/v1/eval/p11/runs/run-p11-broken-v0/waivers',input);assert.equal(waiver.status,201);const waiverBody=await waiver.json() as {data:{status:string;originalGate:string;releaseDisposition:string;createdBy:string}};assert.equal(waiverBody.data.status,'ACTIVE');assert.equal(waiverBody.data.originalGate,'FAIL');assert.equal(waiverBody.data.releaseDisposition,'WAIVED');assert.equal(waiverBody.data.createdBy,'user-p11')
  const duplicate=await post(baseUrl,'/api/industry/v1/eval/p11/runs/run-p11-broken-v0/waivers',input);assert.equal(duplicate.status,409);assert.equal(((await duplicate.json()) as {error:{code:string}}).error.code,'EVAL_WAIVER_ALREADY_ACTIVE')
  const decision=await (await fetch(`${baseUrl}/api/industry/v1/eval/p11/runs/run-p11-broken-v0/gate`)).json() as {data:{gate:{status:string;source:string};releaseDisposition:string;baselineEligible:boolean;baselineBlockReasons:string[]}};assert.equal(decision.data.gate.status,'FAIL');assert.equal(decision.data.gate.source,'MOCK_PI');assert.equal(decision.data.releaseDisposition,'WAIVED');assert.equal(decision.data.baselineEligible,false);assert.ok(decision.data.baselineBlockReasons.length>0)
  const baseline=await post(baseUrl,'/api/industry/v1/eval/p11/runs/run-p11-broken-v0/accept-baseline',{});assert.equal(baseline.status,409)
})})

test('P11 has no Manual PASS Force PASS or generic promote endpoint and dynamic runs are project-isolated',async()=>{await withServer(makeRouter(['eval.read','eval.run','eval.baseline.accept','eval.waiver.create']),async(baseUrl)=>{
  await selectProject(baseUrl);for(const path of ['/api/industry/v1/eval/p11/runs/run-p11-broken-v0/manual-pass','/api/industry/v1/eval/p11/runs/run-p11-broken-v0/force-pass','/api/industry/v1/eval/p11/runs/run-p11-broken-v0/promote'])assert.equal((await post(baseUrl,path,{})).status,404)
  const created=await (await post(baseUrl,'/api/industry/v1/eval/p11/runs',{corpusId:'phase11-unified-corpus-v1',variantId:'p11-guarded-v1'})).json() as {data:{runId:string;projectId:string}};assert.equal(created.data.projectId,'project-1')
  await selectProject(baseUrl,'project-2');const hidden=await fetch(`${baseUrl}/api/industry/v1/eval/p11/runs/${encodeURIComponent(created.data.runId)}`);assert.equal(hidden.status,404)
})})
