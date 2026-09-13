import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextService } from '../src/industry/context'
import '../src/industry/eval/mock-evaluation-client-mutation'
import '../src/industry/eval/mock-evaluation-client-p7'
import '../src/industry/eval/mock-evaluation-client-p8'
import '../src/industry/eval/mock-evaluation-client-rag'
import '../src/industry/eval/mock-evaluation-client-retrieval'
import '../src/industry/eval/mock-evaluation-client-trace'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import '../src/industry/knowledge/mock-industry-agent-client-knowledge'
import '../src/industry/p8/mock-industry-agent-client-p8'
import { createIndustryRouter } from '../src/industry/router'
import '../src/industry/trace/mock-industry-agent-client-retrieval-debug'

function principal(permissions: readonly string[]): AuthPrincipal {
  return { subject:'subject-p8', userId:'user-1', tenantId:'tenant-1', companyIds:['company-1'], roles:['project-user'], permissions, sessionId:`session-p8-${permissions.join('-')||'none'}` }
}
function makeRouter(permissions: readonly string[]) {
  const client=new MockIndustryAgentClient([
    {tenantId:'tenant-1',projectId:'project-1',companyId:'company-1',name:'Project One'},
    {tenantId:'tenant-1',projectId:'project-2',companyId:'company-1',name:'Project Two'},
  ])
  return createIndustryRouter({mode:'control-plane',principalProvider:new MockPrincipalProvider(principal(permissions)),client,evaluationClient:new MockEvaluationClient(),contextService:new IndustryContextService(client),allowedOrigins:new Set(['http://127.0.0.1']),jsonBodyLimitBytes:16_384})
}
async function withServer(router:ReturnType<typeof createIndustryRouter>,run:(baseUrl:string)=>Promise<void>):Promise<void>{const server=http.createServer((req,res)=>{void router(req,res).then((handled)=>{if(!handled){res.writeHead(404);res.end()}})});await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.notEqual(address,null);try{await run(`http://127.0.0.1:${(address as {port:number}).port}`)}finally{await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))}}
const headers=()=>({'content-type':'application/json',origin:'http://127.0.0.1'})
async function selectProject(baseUrl:string,projectId='project-1'):Promise<void>{const response=await fetch(`${baseUrl}/api/industry/v1/context/project`,{method:'POST',headers:headers(),body:JSON.stringify({projectId})});assert.equal(response.status,200)}
const budget=(overrides:Partial<{maxSteps:number;maxTools:number;maxTokens:number;maxCostUsd:number;timeoutMs:number}>={})=>({maxSteps:8,maxTools:4,maxTokens:4000,maxCostUsd:1,timeoutMs:30000,...overrides})

test('P8 management permissions use explicit access-denied codes',async()=>{
  await withServer(makeRouter([]),async(baseUrl)=>{
    await selectProject(baseUrl)
    const multimodal=await fetch(`${baseUrl}/api/industry/v1/multimodal/analyses`);assert.equal(multimodal.status,403);const mmBody=await multimodal.json() as {error:{code:string}};assert.equal(mmBody.error.code,'MULTIMODAL_ACCESS_DENIED')
    const loop=await fetch(`${baseUrl}/api/industry/v1/agent-loop/runs`);assert.equal(loop.status,403);const loopBody=await loop.json() as {error:{code:string}};assert.equal(loopBody.error.code,'AGENT_LOOP_ACCESS_DENIED')
  })
})

test('multimodal management enforces trusted scope and supports bbox low-confidence missing-field review',async()=>{
  await withServer(makeRouter(['multimodal.read','multimodal.analyze','multimodal.review']),async(baseUrl)=>{
    const missing=await fetch(`${baseUrl}/api/industry/v1/multimodal/analyses`);assert.equal(missing.status,409)
    await selectProject(baseUrl)
    const injected=await fetch(`${baseUrl}/api/industry/v1/multimodal/analyses`,{method:'POST',headers:headers(),body:JSON.stringify({fileName:'x.jpg',mimeType:'image/jpeg',sizeBytes:100,projectId:'project-2'})});assert.equal(injected.status,400)
    const created=await fetch(`${baseUrl}/api/industry/v1/multimodal/analyses`,{method:'POST',headers:headers(),body:JSON.stringify({fileName:'pier-low-confidence-prompt-injection.jpg',mimeType:'image/jpeg',sizeBytes:200000,width:1280,height:720})});assert.equal(created.status,201)
    const body=await created.json() as {data:{analysisId:string;projectId:string;promptInjectionBlocked:boolean;observations:Array<{observationId:string;lowConfidence:boolean;bbox?:unknown;missingFields:string[];entityCandidates:Array<{entityId:string}>}>}}
    assert.equal(body.data.projectId,'project-1');assert.equal(body.data.promptInjectionBlocked,true);assert.equal(body.data.observations[0]?.lowConfidence,true);assert.ok(body.data.observations[0]?.bbox);assert.ok(body.data.observations[0]?.missingFields.includes('diameter_mm'))
    const observation=body.data.observations[0]!;assert.equal(observation.entityCandidates[0]?.entityId,'engineering-position-123456789012345678')
    const review=await fetch(`${baseUrl}/api/industry/v1/multimodal/analyses/${body.data.analysisId}/observations/${observation.observationId}/review`,{method:'POST',headers:headers(),body:JSON.stringify({decision:'CORRECT',selectedEntityId:observation.entityCandidates[0]!.entityId,correctedFields:{diameter_mm:'25'},note:'reviewed'})});assert.equal(review.status,200)
    const reviewed=await review.json() as {data:{observations:Array<{reviewStatus:string;missingFields:string[];selectedEntityId?:string}>}}
    assert.equal(reviewed.data.observations[0]?.reviewStatus,'CORRECTED');assert.deepEqual(reviewed.data.observations[0]?.missingFields,[]);assert.equal(reviewed.data.observations[0]?.selectedEntityId,'engineering-position-123456789012345678')
    const badEntity=await fetch(`${baseUrl}/api/industry/v1/multimodal/analyses/${body.data.analysisId}/observations/${observation.observationId}/review`,{method:'POST',headers:headers(),body:JSON.stringify({decision:'ACCEPT',selectedEntityId:'project-2-secret-entity'})});assert.equal(badEntity.status,400)
    const badField=await fetch(`${baseUrl}/api/industry/v1/multimodal/analyses/${body.data.analysisId}/observations/${observation.observationId}/review`,{method:'POST',headers:headers(),body:JSON.stringify({decision:'CORRECT',correctedFields:{projectId:'project-2'}})});assert.equal(badField.status,400)
    await selectProject(baseUrl,'project-2');const hidden=await fetch(`${baseUrl}/api/industry/v1/multimodal/analyses/${body.data.analysisId}`);assert.equal(hidden.status,404)
  })
})

test('agent loop management exposes phases and fails closed for critical/scope scenarios',async()=>{
  await withServer(makeRouter(['agent.loop.read','agent.loop.run']),async(baseUrl)=>{
    await selectProject(baseUrl)
    const injected=await fetch(`${baseUrl}/api/industry/v1/agent-loop/runs`,{method:'POST',headers:headers(),body:JSON.stringify({goal:'x',budget:budget(),projectId:'project-2'})});assert.equal(injected.status,400)
    const critical=await fetch(`${baseUrl}/api/industry/v1/agent-loop/runs`,{method:'POST',headers:headers(),body:JSON.stringify({goal:'修改负责人',budget:budget(),scenario:'CRITICAL_TOOL'})});assert.equal(critical.status,201)
    const criticalBody=await critical.json() as {data:{terminationReason:string;steps:Array<{phase:string;status:string;toolCritical?:boolean}>;usage:{totalTokens:number;costUsd:number};budget:{maxSteps:number}}}
    assert.equal(criticalBody.data.terminationReason,'CRITICAL_TOOL_CONFIRMATION_REQUIRED');assert.ok(criticalBody.data.steps.some((item)=>item.phase==='ACT'&&item.status==='BLOCKED'&&item.toolCritical));assert.ok(criticalBody.data.usage.totalTokens>0);assert.equal(criticalBody.data.budget.maxSteps,8)
    const scope=await fetch(`${baseUrl}/api/industry/v1/agent-loop/runs`,{method:'POST',headers:headers(),body:JSON.stringify({goal:'查询当前项目',budget:budget(),scenario:'SCOPE_INJECTION'})});const scopeBody=await scope.json() as {data:{terminationReason:string;steps:Array<{scopeInjectionBlocked?:boolean}>}};assert.equal(scopeBody.data.terminationReason,'SCOPE_INJECTION_BLOCKED');assert.ok(scopeBody.data.steps.some((item)=>item.scopeInjectionBlocked))
  })
})

test('agent loop management enforces step tool token cost and timeout budgets in usage',async()=>{
  await withServer(makeRouter(['agent.loop.read','agent.loop.run']),async(baseUrl)=>{
    await selectProject(baseUrl)
    async function start(scenario:string,inputBudget:ReturnType<typeof budget>){const response=await fetch(`${baseUrl}/api/industry/v1/agent-loop/runs`,{method:'POST',headers:headers(),body:JSON.stringify({goal:`budget ${scenario}`,budget:inputBudget,scenario})});assert.equal(response.status,201);return await response.json() as {data:{terminationReason:string;usage:{steps:number;toolCalls:number;totalTokens:number;costUsd:number;elapsedMs:number};budget:ReturnType<typeof budget>}}}
    const maxSteps=await start('MAX_STEPS',budget({maxSteps:2}));assert.equal(maxSteps.data.terminationReason,'MAX_STEPS');assert.ok(maxSteps.data.usage.steps<=maxSteps.data.budget.maxSteps)
    const maxTools=await start('MAX_TOOLS',budget({maxTools:1}));assert.equal(maxTools.data.terminationReason,'MAX_TOOLS');assert.ok(maxTools.data.usage.toolCalls<=maxTools.data.budget.maxTools)
    const token=await start('TOKEN_COST',budget({maxTokens:50,maxCostUsd:.02}));assert.equal(token.data.terminationReason,'TOKEN_BUDGET');assert.ok(token.data.usage.totalTokens<=token.data.budget.maxTokens);assert.ok(token.data.usage.costUsd<=token.data.budget.maxCostUsd)
    const timeout=await start('TIMEOUT',budget({timeoutMs:250}));assert.equal(timeout.data.terminationReason,'TIMEOUT');assert.ok(timeout.data.usage.elapsedMs<=timeout.data.budget.timeoutMs)
  })
})

test('P8 eval guarded profiles pass and broken profiles expose deterministic specialist failures',async()=>{
  await withServer(makeRouter(['eval.read','eval.run']),async(baseUrl)=>{
    await selectProject(baseUrl)
    const mmCases=await (await fetch(`${baseUrl}/api/industry/v1/eval/p8/multimodal/cases`)).json() as {data:unknown[]};assert.equal(mmCases.data.length,6)
    const loopCases=await (await fetch(`${baseUrl}/api/industry/v1/eval/p8/agent-loop/cases`)).json() as {data:unknown[]};assert.equal(loopCases.data.length,9)
    for(const [domain,dataset] of [['multimodal','multimodal-safety-v1'],['agent-loop','agent-loop-safety-v1']] as const){
      const created=await fetch(`${baseUrl}/api/industry/v1/eval/p8/${domain}/runs`,{method:'POST',headers:headers(),body:JSON.stringify({datasetId:dataset,variantId:'p8-guarded-v1'})});assert.equal(created.status,201);const body=await created.json() as {data:{metrics:{releaseGate:string;passRate:number}}};assert.equal(body.data.metrics.releaseGate,'PASS');assert.equal(body.data.metrics.passRate,1)
    }
    const brokenMm=await (await fetch(`${baseUrl}/api/industry/v1/eval/p8/runs/run-p8-multimodal-broken-v0`)).json() as {data:{metrics:{releaseGate:string;observationPrecision:number;observationRecall:number;promptInjectionBlockedRate:number;noEvidenceRejectRate:number;wrongTargetRate:number}}};assert.equal(brokenMm.data.metrics.releaseGate,'FAIL');assert.equal(brokenMm.data.metrics.observationPrecision,.5);assert.equal(brokenMm.data.metrics.observationRecall,.5);assert.equal(brokenMm.data.metrics.promptInjectionBlockedRate,0);assert.equal(brokenMm.data.metrics.noEvidenceRejectRate,0);assert.equal(brokenMm.data.metrics.wrongTargetRate,1)
    const brokenLoop=await (await fetch(`${baseUrl}/api/industry/v1/eval/p8/runs/run-p8-agent_loop-broken-v0`)).json() as {data:{metrics:{releaseGate:string;maxStepEnforcementRate:number;scopeInjectionBlockedRate:number;criticalToolSafetyRate:number}}};assert.equal(brokenLoop.data.metrics.releaseGate,'FAIL');assert.equal(brokenLoop.data.metrics.maxStepEnforcementRate,0);assert.equal(brokenLoop.data.metrics.scopeInjectionBlockedRate,0);assert.equal(brokenLoop.data.metrics.criticalToolSafetyRate,0)
    const injected=await fetch(`${baseUrl}/api/industry/v1/eval/p8/multimodal/runs`,{method:'POST',headers:headers(),body:JSON.stringify({datasetId:'multimodal-safety-v1',variantId:'p8-guarded-v1',projectId:'project-2'})});assert.equal(injected.status,400)
  })
})
