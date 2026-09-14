import assert from 'node:assert/strict'
import http from 'node:http'
import test from 'node:test'
import { MockPrincipalProvider, type AuthPrincipal } from '../src/industry/auth'
import { MockIndustryAgentClient } from '../src/industry/clients/mock-industry-agent-client'
import { IndustryContextService } from '../src/industry/context'
import { MockEvaluationClient } from '../src/industry/eval/mock-evaluation-client'
import '../src/industry/p10/mock-industry-agent-client-p10'
import { createIndustryRouter } from '../src/industry/router'

function routerFor(permissions:readonly string[]){const principal:AuthPrincipal={subject:'p10-auth',userId:'u1',tenantId:'t1',companyIds:['c1'],roles:[],permissions,sessionId:'s1'};const client=new MockIndustryAgentClient([{tenantId:'t1',projectId:'p1',companyId:'c1',name:'P1'}]);return createIndustryRouter({mode:'control-plane',principalProvider:new MockPrincipalProvider(principal),client,evaluationClient:new MockEvaluationClient(),contextService:new IndustryContextService(client),allowedOrigins:new Set(['http://127.0.0.1'])})}
async function serve(router:ReturnType<typeof createIndustryRouter>,fn:(base:string)=>Promise<void>){const server=http.createServer((req,res)=>{void router(req,res)});await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');try{await fn(`http://127.0.0.1:${address.port}`)}finally{await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))}}
const headers={'content-type':'application/json',origin:'http://127.0.0.1'}
async function select(base:string){const response=await fetch(`${base}/api/industry/v1/context/project`,{method:'POST',headers,body:JSON.stringify({projectId:'p1'})});assert.equal(response.status,200)}

test('runtime.config.edit alone cannot blind-write config',async()=>{await serve(routerFor(['runtime.config.edit']),async(base)=>{await select(base);const response=await fetch(`${base}/api/industry/v1/runtime/config/drafts`,{method:'POST',headers,body:JSON.stringify({changes:[{component:'AGENT_MODEL',endpointAlias:'candidate'}]})});assert.equal(response.status,403);assert.equal(((await response.json()) as {error:{code:string}}).error.code,'RUNTIME_ACCESS_DENIED')})})

test('runtime.admin can save adapter changes and component version follows v2 alias',async()=>{await serve(routerFor(['runtime.admin']),async(base)=>{await select(base);const created=await fetch(`${base}/api/industry/v1/runtime/config/drafts`,{method:'POST',headers,body:JSON.stringify({changes:[{component:'AGENT_MODEL',adapter:'mock-agent-model-v2'}]})});assert.equal(created.status,201);const draft=await created.json() as {data:{draftId:string}};for(const action of ['validate','save']){const response=await fetch(`${base}/api/industry/v1/runtime/config/drafts/${draft.data.draftId}/${action}`,{method:'POST',headers,body:'{}'});assert.equal(response.status,200)}const inventory=await (await fetch(`${base}/api/industry/v1/runtime`,{headers:{origin:'http://127.0.0.1'}})).json() as {data:{adapters:Array<{component:string;version:string}>}};assert.equal(inventory.data.adapters.find((item)=>item.component==='AGENT_MODEL')?.version,'2.0.0')})})
