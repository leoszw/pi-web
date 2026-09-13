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
import '../src/industry/p10/mock-industry-agent-client-p10'
import { createIndustryRouter } from '../src/industry/router'
import '../src/industry/trace/mock-industry-agent-client-retrieval-debug'

function principal(permissions:readonly string[]):AuthPrincipal{return{subject:'subject-p10',userId:'user-1',tenantId:'tenant-1',companyIds:['company-1'],roles:['project-user'],permissions,sessionId:`session-p10-${permissions.join('-')||'none'}`}}
function makeRouter(permissions:readonly string[]){const client=new MockIndustryAgentClient([{tenantId:'tenant-1',projectId:'project-1',companyId:'company-1',name:'Project One'},{tenantId:'tenant-1',projectId:'project-2',companyId:'company-1',name:'Project Two'}]);return createIndustryRouter({mode:'control-plane',principalProvider:new MockPrincipalProvider(principal(permissions)),client,evaluationClient:new MockEvaluationClient(),contextService:new IndustryContextService(client),allowedOrigins:new Set(['http://127.0.0.1']),jsonBodyLimitBytes:16_384})}
async function withServer(router:ReturnType<typeof createIndustryRouter>,run:(baseUrl:string)=>Promise<void>):Promise<void>{const server=http.createServer((req,res)=>{void router(req,res).then((handled)=>{if(!handled){res.writeHead(404);res.end()}})});await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.notEqual(address,null);try{await run(`http://127.0.0.1:${(address as {port:number}).port}`)}finally{await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))}}
const headers=()=>({'content-type':'application/json',origin:'http://127.0.0.1'})
async function selectProject(baseUrl:string,projectId='project-1'){const response=await fetch(`${baseUrl}/api/industry/v1/context/project`,{method:'POST',headers:headers(),body:JSON.stringify({projectId})});assert.equal(response.status,200)}
async function post(baseUrl:string,path:string,body:unknown){return fetch(`${baseUrl}${path}`,{method:'POST',headers:headers(),body:JSON.stringify(body)})}
async function createDraft(baseUrl:string,changes:unknown[]){const response=await post(baseUrl,'/api/industry/v1/runtime/config/drafts',{changes});assert.equal(response.status,201);return await response.json() as {data:{draftId:string;status:string;baseVersion:number;eligibleForPromote:boolean}}}

test('runtime and operations require explicit permissions and active project',async()=>{
  await withServer(makeRouter([]),async(baseUrl)=>{await selectProject(baseUrl);const runtime=await fetch(`${baseUrl}/api/industry/v1/runtime`);assert.equal(runtime.status,403);assert.equal(((await runtime.json()) as {error:{code:string}}).error.code,'RUNTIME_ACCESS_DENIED');const operations=await fetch(`${baseUrl}/api/industry/v1/operations/readiness`);assert.equal(operations.status,403);assert.equal(((await operations.json()) as {error:{code:string}}).error.code,'OPERATIONS_ACCESS_DENIED')})
  await withServer(makeRouter(['runtime.read']),async(baseUrl)=>{const response=await fetch(`${baseUrl}/api/industry/v1/runtime`);assert.equal(response.status,409)})
})

test('runtime inventory exposes exactly ten adapter statuses without secret values',async()=>{await withServer(makeRouter(['runtime.read']),async(baseUrl)=>{
  await selectProject(baseUrl);const response=await fetch(`${baseUrl}/api/industry/v1/runtime`);assert.equal(response.status,200);const text=await response.text();const body=JSON.parse(text) as {data:{configVersion:number;adapters:Array<{component:string;secret:Record<string,unknown>}>}};assert.equal(body.data.configVersion,1);assert.equal(body.data.adapters.length,10);assert.deepEqual(new Set(body.data.adapters.map((item)=>item.component)),new Set(['AGENT_MODEL','EMBEDDING','RERANKER','OPENSEARCH','PARSER','OBJECT_STORAGE','MULTIMODAL','RENDERER','SANDBOX','TRACE_AUDIT']));for(const adapter of body.data.adapters){assert.equal('value'in adapter.secret,false);assert.equal('apiKey'in adapter.secret,false);assert.equal('token'in adapter.secret,false);assert.ok(['configured','source','reference','lastUpdatedAt'].every((key)=>key in adapter.secret||key==='reference'||key==='lastUpdatedAt'))}assert.equal(/sk-[a-z0-9]|password=|authorization:/iu.test(text),false)
})})

test('runtime config follows Draft Validate Diff Save version bump Eval eligible flow',async()=>{await withServer(makeRouter(['runtime.read','runtime.config.edit']),async(baseUrl)=>{
  await selectProject(baseUrl)
  const injected=await post(baseUrl,'/api/industry/v1/runtime/config/drafts',{changes:[{component:'AGENT_MODEL',endpointAlias:'candidate'}],projectId:'project-2'});assert.equal(injected.status,400)
  const secretField=await post(baseUrl,'/api/industry/v1/runtime/config/drafts',{changes:[{component:'AGENT_MODEL',endpointAlias:'candidate',secret:'plaintext'}]});assert.equal(secretField.status,400)
  for(const badAlias of ['https://model.example?token=secret','sk-live-123','agent-token-primary','password-prod','api_key_prod']){const bad=await post(baseUrl,'/api/industry/v1/runtime/config/drafts',{changes:[{component:'AGENT_MODEL',endpointAlias:badAlias}]});assert.equal(bad.status,400);assert.equal(((await bad.json()) as {error:{code:string}}).error.code,'RUNTIME_CONFIG_VALUE_INVALID')}
  const created=await createDraft(baseUrl,[{component:'AGENT_MODEL',adapter:'mock-agent-model-v2',endpointAlias:'agent-model-candidate'}]);assert.equal(created.data.status,'DRAFT');assert.equal(created.data.baseVersion,1);assert.equal(created.data.eligibleForPromote,false)
  const saveTooEarly=await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${created.data.draftId}/save`,{});assert.equal(saveTooEarly.status,409)
  const injectedAction=await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${created.data.draftId}/validate`,{promote:true});assert.equal(injectedAction.status,400)
  const validated=await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${created.data.draftId}/validate`,{});assert.equal(validated.status,200);const validatedBody=await validated.json() as {data:{status:string;diff:Array<{field:string;before:string;after:string}>;validationIssues:unknown[]}};assert.equal(validatedBody.data.status,'VALIDATED');assert.equal(validatedBody.data.validationIssues.length,0);assert.deepEqual(validatedBody.data.diff.map((item)=>item.field),['adapter','endpointAlias'])
  const saved=await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${created.data.draftId}/save`,{});assert.equal(saved.status,200);const savedBody=await saved.json() as {data:{status:string;savedVersion:number}};assert.equal(savedBody.data.status,'SAVED');assert.equal(savedBody.data.savedVersion,2)
  const inventory=await (await fetch(`${baseUrl}/api/industry/v1/runtime`)).json() as {data:{configVersion:number;adapters:Array<{component:string;adapter:string;endpointAlias:string}>}};assert.equal(inventory.data.configVersion,2);const agent=inventory.data.adapters.find((item)=>item.component==='AGENT_MODEL');assert.equal(agent?.adapter,'mock-agent-model-v2');assert.equal(agent?.endpointAlias,'agent-model-candidate')
  const evaluated=await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${created.data.draftId}/eval`,{});assert.equal(evaluated.status,200);const evalBody=await evaluated.json() as {data:{status:string;eligibleForPromote:boolean;evalResult:{status:string;checks:unknown[]}}};assert.equal(evalBody.data.status,'EVALUATED');assert.equal(evalBody.data.evalResult.status,'PASS');assert.equal(evalBody.data.evalResult.checks.length,10);assert.equal(evalBody.data.eligibleForPromote,true)
  const noPromoteRoute=await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${created.data.draftId}/promote`,{});assert.equal(noPromoteRoute.status,404)
})})

test('validation rejects no-op unhealthy and stale drafts and save revokes old eligibility',async()=>{await withServer(makeRouter(['runtime.read','runtime.config.edit']),async(baseUrl)=>{
  await selectProject(baseUrl)
  const noop=await createDraft(baseUrl,[{component:'PARSER',endpointAlias:'parser-primary'}]);const noopValidation=await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${noop.data.draftId}/validate`,{});assert.equal(noopValidation.status,200);const noopBody=await noopValidation.json() as {data:{validationIssues:Array<{code:string}>}};assert.ok(noopBody.data.validationIssues.some((item)=>item.code==='RUNTIME_CONFIG_NOOP'));assert.equal((await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${noop.data.draftId}/save`,{})).status,409)
  const bad=await createDraft(baseUrl,[{component:'OPENSEARCH',adapter:'broken-opensearch'}]);const badValidation=await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${bad.data.draftId}/validate`,{});const badBody=await badValidation.json() as {data:{validationIssues:Array<{severity:string}>}};assert.ok(badBody.data.validationIssues.some((item)=>item.severity==='ERROR'));assert.equal((await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${bad.data.draftId}/save`,{})).status,409)
  const first=await createDraft(baseUrl,[{component:'PARSER',endpointAlias:'parser-a'}]);const stale=await createDraft(baseUrl,[{component:'RENDERER',endpointAlias:'renderer-b'}]);await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${first.data.draftId}/validate`,{});await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${first.data.draftId}/save`,{});await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${first.data.draftId}/eval`,{});const staleValidate=await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${stale.data.draftId}/validate`,{});assert.equal(staleValidate.status,409);assert.equal(((await staleValidate.json()) as {error:{code:string}}).error.code,'RUNTIME_CONFIG_VERSION_CONFLICT')
  const second=await createDraft(baseUrl,[{component:'RENDERER',endpointAlias:'renderer-c'}]);await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${second.data.draftId}/validate`,{});await post(baseUrl,`/api/industry/v1/runtime/config/drafts/${second.data.draftId}/save`,{});const drafts=await (await fetch(`${baseUrl}/api/industry/v1/runtime/config/drafts`)).json() as {data:Array<{draftId:string;eligibleForPromote:boolean}>};assert.equal(drafts.data.find((item)=>item.draftId===first.data.draftId)?.eligibleForPromote,false)
})})

test('runtime drafts are project isolated and operations approvals stay blocked while unexecuted checks stay pending',async()=>{await withServer(makeRouter(['runtime.read','runtime.config.edit','operations.read']),async(baseUrl)=>{
  await selectProject(baseUrl);const created=await createDraft(baseUrl,[{component:'SANDBOX',endpointAlias:'sandbox-candidate'}]);await selectProject(baseUrl,'project-2');const hidden=await fetch(`${baseUrl}/api/industry/v1/runtime/config/drafts/${encodeURIComponent(created.data.draftId)}`);assert.equal(hidden.status,404)
  const operations=await fetch(`${baseUrl}/api/industry/v1/operations/readiness`);assert.equal(operations.status,200);const body=await operations.json() as {data:{overall:string;checks:Array<{type:string;status:string}>}};assert.equal(body.data.overall,'NOT_READY');assert.equal(body.data.checks.length,10);assert.equal(body.data.checks.find((item)=>item.type==='CI')?.status,'PENDING');assert.equal(body.data.checks.find((item)=>item.type==='EVAL_GATE')?.status,'PENDING');assert.equal(body.data.checks.find((item)=>item.type==='DB_APPROVAL')?.status,'BLOCKED');assert.equal(body.data.checks.find((item)=>item.type==='PRODUCTION_APPROVAL')?.status,'BLOCKED')
  const approve=await post(baseUrl,'/api/industry/v1/operations/production-approval',{});assert.equal(approve.status,404)
})})
