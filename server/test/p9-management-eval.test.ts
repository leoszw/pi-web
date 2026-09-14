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
import '../src/industry/eval/mock-evaluation-client-rag'
import '../src/industry/eval/mock-evaluation-client-retrieval'
import '../src/industry/eval/mock-evaluation-client-trace'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import '../src/industry/knowledge/mock-industry-agent-client-knowledge'
import '../src/industry/p8/mock-industry-agent-client-p8'
import '../src/industry/p9/mock-industry-agent-client-p9'
import { createIndustryRouter } from '../src/industry/router'
import '../src/industry/trace/mock-industry-agent-client-retrieval-debug'

function principal(permissions:readonly string[]):AuthPrincipal{return{subject:'subject-p9',userId:'user-1',tenantId:'tenant-1',companyIds:['company-1'],roles:['project-user'],permissions,sessionId:`session-p9-${permissions.join('-')||'none'}`}}
function makeRouter(permissions:readonly string[]){const client=new MockIndustryAgentClient([{tenantId:'tenant-1',projectId:'project-1',companyId:'company-1',name:'Project One'},{tenantId:'tenant-1',projectId:'project-2',companyId:'company-1',name:'Project Two'}]);return createIndustryRouter({mode:'control-plane',principalProvider:new MockPrincipalProvider(principal(permissions)),client,evaluationClient:new MockEvaluationClient(),contextService:new IndustryContextService(client),allowedOrigins:new Set(['http://127.0.0.1']),jsonBodyLimitBytes:16_384})}
async function withServer(router:ReturnType<typeof createIndustryRouter>,run:(baseUrl:string)=>Promise<void>):Promise<void>{const server=http.createServer((req,res)=>{void router(req,res).then((handled)=>{if(!handled){res.writeHead(404);res.end()}})});await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.notEqual(address,null);try{await run(`http://127.0.0.1:${(address as {port:number}).port}`)}finally{await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))}}
const headers=()=>({'content-type':'application/json',origin:'http://127.0.0.1'})
async function selectProject(baseUrl:string,projectId='project-1'):Promise<void>{const response=await fetch(`${baseUrl}/api/industry/v1/context/project`,{method:'POST',headers:headers(),body:JSON.stringify({projectId})});assert.equal(response.status,200)}
const sandboxBudget={maxRows:100,maxBytes:64000,timeoutMs:5000}
async function startSandbox(baseUrl:string,scenario:string,budget=sandboxBudget){const response=await fetch(`${baseUrl}/api/industry/v1/sandbox/runs`,{method:'POST',headers:headers(),body:JSON.stringify({goal:`scenario ${scenario}`,budget,scenario})});assert.equal(response.status,201);return await response.json() as {data:{runId:string;projectId:string;status:string;terminationReason:string;generatedSql:string;queryId:string|null;validation:Array<{severity:string;code:string}>;runtimeAttestation:{verified:boolean;networkDisabled:boolean;processSpawnDisabled:boolean};output:{rowCount:number;bytes:number;rows:Array<{id:string}>};budget:{maxRows:number;maxBytes:number;timeoutMs:number}}}}

test('P9 management permissions use explicit access-denied errors',async()=>{await withServer(makeRouter([]),async(baseUrl)=>{await selectProject(baseUrl);const report=await fetch(`${baseUrl}/api/industry/v1/reports`);assert.equal(report.status,403);assert.equal(((await report.json()) as {error:{code:string}}).error.code,'REPORT_ACCESS_DENIED');const sandbox=await fetch(`${baseUrl}/api/industry/v1/sandbox/runs`);assert.equal(sandbox.status,403);assert.equal(((await sandbox.json()) as {error:{code:string}}).error.code,'SANDBOX_ACCESS_DENIED')})})

test('Report download requires both read and download permissions',async()=>{
  for(const permissions of [['report.read'],['report.download']] as const){await withServer(makeRouter(permissions),async(baseUrl)=>{await selectProject(baseUrl);const response=await fetch(`${baseUrl}/api/industry/v1/reports/report-progress-v1/download`,{method:'POST',headers:headers(),body:'{}'});assert.equal(response.status,403);assert.equal(((await response.json()) as {error:{code:string}}).error.code,'REPORT_ACCESS_DENIED')})}
})

test('Report Center exposes preview metadata evidence lineage and authorized scoped download grants',async()=>{await withServer(makeRouter(['report.read','report.download']),async(baseUrl)=>{
  const missing=await fetch(`${baseUrl}/api/industry/v1/reports`);assert.equal(missing.status,409);await selectProject(baseUrl)
  const list=await fetch(`${baseUrl}/api/industry/v1/reports`);assert.equal(list.status,200);const listBody=await list.json() as {data:Array<{reportId:string;projectId:string;security:{hiddenFieldBlocked:boolean};evidence:unknown[];lineage:unknown[]}>};assert.ok(listBody.data.length>=2);assert.ok(listBody.data.every((item)=>item.projectId==='project-1'&&item.security.hiddenFieldBlocked&&item.evidence.length>0&&item.lineage.length>0))
  const id=listBody.data[0]!.reportId
  const injected=await fetch(`${baseUrl}/api/industry/v1/reports/${encodeURIComponent(id)}/download`,{method:'POST',headers:headers(),body:JSON.stringify({projectId:'project-2'})});assert.equal(injected.status,400)
  const grant=await fetch(`${baseUrl}/api/industry/v1/reports/${encodeURIComponent(id)}/download`,{method:'POST',headers:headers(),body:'{}'});assert.equal(grant.status,201);const grantBody=await grant.json() as {data:{authorized:boolean;artifactRef:string;contentDisposition:string}};assert.equal(grantBody.data.authorized,true);assert.equal(grantBody.data.contentDisposition,'attachment');assert.match(grantBody.data.artifactRef,/^mock-report-artifact:/u);assert.equal(grantBody.data.artifactRef.includes('/etc/'),false)
  await selectProject(baseUrl,'project-2');const hidden=await fetch(`${baseUrl}/api/industry/v1/reports/${encodeURIComponent(id)}`);assert.equal(hidden.status,404)
})})

test('Sandbox forbids arbitrary SQL/Python/queryId input and blocks dangerous capabilities before query execution',async()=>{await withServer(makeRouter(['sandbox.read','sandbox.run']),async(baseUrl)=>{
  await selectProject(baseUrl)
  for(const injected of [{generatedSql:'DELETE FROM engineering_position'},{sql:'SELECT 1'},{pythonSource:'import os'},{queryId:'client-query'},{projectId:'project-2'}]){const response=await fetch(`${baseUrl}/api/industry/v1/sandbox/runs`,{method:'POST',headers:headers(),body:JSON.stringify({goal:'safe query',budget:sandboxBudget,...injected})});assert.equal(response.status,400)}
  const safe=await startSandbox(baseUrl,'SAFE_READ');assert.equal(safe.data.projectId,'project-1');assert.match(safe.data.generatedSql,/^SELECT id, name, status/u);assert.ok(safe.data.queryId?.startsWith('query-'));assert.equal(safe.data.runtimeAttestation.verified,true);assert.equal(safe.data.runtimeAttestation.networkDisabled,true);assert.equal(safe.data.runtimeAttestation.processSpawnDisabled,true);assert.ok(safe.data.output.rowCount<=safe.data.budget.maxRows);assert.ok(safe.data.output.bytes<=safe.data.budget.maxBytes);assert.equal(safe.data.output.bytes,Buffer.byteLength(JSON.stringify(safe.data.output.rows),'utf8'));assert.equal(typeof safe.data.output.rows[0]?.id,'string');assert.equal(safe.data.output.rows[0]?.id,'123456789012345678');assert.ok(safe.data.validation.every((item)=>item.severity!=='BLOCK'))
  for(const scenario of ['WRITE_SQL','SELECT_STAR','LOAD_FILE','SYSTEM_SCHEMA','PYTHON_IMPORT_OPEN_NETWORK_PROCESS'] as const){const body=await startSandbox(baseUrl,scenario);assert.equal(body.data.status,'BLOCKED');assert.equal(body.data.queryId,null);assert.ok(body.data.validation.some((item)=>item.severity==='BLOCK'))}
  await selectProject(baseUrl,'project-2');const hidden=await fetch(`${baseUrl}/api/industry/v1/sandbox/runs/${encodeURIComponent(safe.data.runId)}`);assert.equal(hidden.status,404)
})})

test('Sandbox enforces row byte timeout attestation and dynamic queryId policies as actual behavior',async()=>{await withServer(makeRouter(['sandbox.read','sandbox.run']),async(baseUrl)=>{
  await selectProject(baseUrl)
  const rowBound=await startSandbox(baseUrl,'SAFE_READ',{maxRows:1,maxBytes:64000,timeoutMs:5000});assert.equal(rowBound.data.terminationReason,'PAYLOAD_BUDGET');assert.equal(rowBound.data.output.rowCount,1)
  const byteBound=await startSandbox(baseUrl,'SAFE_READ',{maxRows:100,maxBytes:128,timeoutMs:5000});assert.equal(byteBound.data.terminationReason,'PAYLOAD_BUDGET');assert.ok(byteBound.data.output.bytes<=128);assert.equal(byteBound.data.output.bytes,Buffer.byteLength(JSON.stringify(byteBound.data.output.rows),'utf8'))
  const timeout=await startSandbox(baseUrl,'SAFE_READ',{maxRows:100,maxBytes:64000,timeoutMs:100});assert.equal(timeout.data.terminationReason,'TIMEOUT')
  const dynamic=await startSandbox(baseUrl,'DYNAMIC_QUERY_ID');assert.ok(dynamic.data.queryId?.startsWith('query-'))
  const attestation=await startSandbox(baseUrl,'ATTESTATION');assert.equal(attestation.data.status,'BLOCKED');assert.equal(attestation.data.queryId,null);assert.equal(attestation.data.runtimeAttestation.verified,false)
})})

test('P9 eval guarded profiles pass and broken profiles expose every specialist gate',async()=>{await withServer(makeRouter(['eval.read','eval.run']),async(baseUrl)=>{
  await selectProject(baseUrl)
  const reportCases=await (await fetch(`${baseUrl}/api/industry/v1/eval/p9/report/cases`)).json() as {data:unknown[]};assert.equal(reportCases.data.length,10)
  const sandboxCases=await (await fetch(`${baseUrl}/api/industry/v1/eval/p9/sandbox/cases`)).json() as {data:unknown[]};assert.equal(sandboxCases.data.length,8)
  for(const [domain,dataset] of [['report','report-safety-v1'],['sandbox','sandbox-safety-v1']] as const){const created=await fetch(`${baseUrl}/api/industry/v1/eval/p9/${domain}/runs`,{method:'POST',headers:headers(),body:JSON.stringify({datasetId:dataset,variantId:'p9-guarded-v1'})});assert.equal(created.status,201);const body=await created.json() as {data:{metrics:{releaseGate:string;passRate:number}}};assert.equal(body.data.metrics.releaseGate,'PASS');assert.equal(body.data.metrics.passRate,1)}
  const brokenReport=await (await fetch(`${baseUrl}/api/industry/v1/eval/p9/runs/run-p9-report-broken-v0`)).json() as {data:{metrics:{releaseGate:string;hiddenFieldBlockedRate:number;evidenceCoverageRate:number;activeContentBlockedRate:number;externalLinkBlockedRate:number;xlsxMacroBlockedRate:number;pdfActionBlockedRate:number;svgScriptBlockedRate:number;pathTraversalBlockedRate:number;sizeLimitEnforcedRate:number;timeoutEnforcedRate:number}}};assert.equal(brokenReport.data.metrics.releaseGate,'FAIL');assert.equal(brokenReport.data.metrics.hiddenFieldBlockedRate,0);assert.equal(brokenReport.data.metrics.evidenceCoverageRate,.5);for(const key of ['activeContentBlockedRate','externalLinkBlockedRate','xlsxMacroBlockedRate','pdfActionBlockedRate','svgScriptBlockedRate','pathTraversalBlockedRate','sizeLimitEnforcedRate','timeoutEnforcedRate'] as const)assert.equal(brokenReport.data.metrics[key],0)
  const brokenSandbox=await (await fetch(`${baseUrl}/api/industry/v1/eval/p9/runs/run-p9-sandbox-broken-v0`)).json() as {data:{metrics:{releaseGate:string;writeSqlRejectRate:number;selectStarRejectRate:number;loadFileRejectRate:number;systemSchemaRejectRate:number;pythonCapabilityBlockedRate:number;dynamicQueryIdSafetyRate:number;attestationVerifiedRate:number;payloadBudgetEnforcedRate:number}}};assert.equal(brokenSandbox.data.metrics.releaseGate,'FAIL');for(const key of ['writeSqlRejectRate','selectStarRejectRate','loadFileRejectRate','systemSchemaRejectRate','pythonCapabilityBlockedRate','dynamicQueryIdSafetyRate','attestationVerifiedRate','payloadBudgetEnforcedRate'] as const)assert.equal(brokenSandbox.data.metrics[key],0)
  const injected=await fetch(`${baseUrl}/api/industry/v1/eval/p9/report/runs`,{method:'POST',headers:headers(),body:JSON.stringify({datasetId:'report-safety-v1',variantId:'p9-guarded-v1',projectId:'project-2'})});assert.equal(injected.status,400)
})})
