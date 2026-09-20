import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { OperationsReadiness } from '../../shared/industry/operations'
import type { RuntimeAdapterStatus, RuntimeConfigDraft, RuntimeInventory } from '../../shared/industry/runtime'
import { OperationsView } from '../src/features/p10/OperationsPage'
import { RuntimeView } from '../src/features/p10/RuntimePage'

const components=['AGENT_MODEL','EMBEDDING','RERANKER','OPENSEARCH','PARSER','OBJECT_STORAGE','MULTIMODAL','RENDERER','SANDBOX','TRACE_AUDIT'] as const
const adapters:RuntimeAdapterStatus[]=components.map((component,index)=>({component,label:component.replace('_',' '),adapter:`mock-${component.toLowerCase()}-v1`,endpointAlias:`endpoint-${index}`,configured:true,health:'HEALTHY',version:'1.0.0',lastCheckAt:'2026-09-13T09:00:00Z',secret:index%2===0?{configured:true,source:'env',reference:`${component.toLowerCase()}-secret-ref`,lastUpdatedAt:'2026-09-13T09:00:00Z'}:{configured:false,source:'none'}}))
const inventory:RuntimeInventory={environment:'MOCK',configVersion:2,adapters,checkedAt:'2026-09-13T09:00:00Z'}
const draft:RuntimeConfigDraft={draftId:'runtime-draft-1',projectId:'project-1',baseVersion:1,status:'EVALUATED',changes:[{component:'AGENT_MODEL',adapter:'mock-agent-model-v2',endpointAlias:'agent-model-candidate'}],validationIssues:[],diff:[{component:'AGENT_MODEL',field:'adapter',before:'mock-agent_model-v1',after:'mock-agent-model-v2'},{component:'AGENT_MODEL',field:'endpointAlias',before:'endpoint-0',after:'agent-model-candidate'}],savedVersion:2,evalResult:{status:'PASS',runId:'runtime-eval-1',completedAt:'2026-09-13T09:01:00Z',checks:[{name:'AGENT_MODEL readiness',passed:true,detail:'healthy'}]},eligibleForPromote:true,createdAt:'2026-09-13T09:00:00Z',updatedAt:'2026-09-13T09:01:00Z'}
const operations:OperationsReadiness={environment:'MOCK',projectId:'project-1',overall:'NOT_READY',lastUpdatedAt:'2026-09-13T09:02:00Z',checks:[
  {type:'CI',label:'CI',status:'PASS',detail:'defined',evidenceRef:'ci://mock/latest',checkedAt:'x'},
  {type:'ADAPTER_READINESS',label:'Adapter readiness',status:'PASS',detail:'healthy',checkedAt:'x'},
  {type:'STAGING_INFRA',label:'Staging infra',status:'PENDING',detail:'not connected',checkedAt:'x'},
  {type:'TRACE_AUDIT',label:'Trace / Audit',status:'PASS',detail:'ready',checkedAt:'x'},
  {type:'EVAL_GATE',label:'Eval gate',status:'PASS',detail:'P1-P9 available',checkedAt:'x'},
  {type:'E2E',label:'E2E',status:'PENDING',detail:'not executed',checkedAt:'x'},
  {type:'RENDERER',label:'Renderer',status:'PASS',detail:'ready',checkedAt:'x'},
  {type:'SANDBOX',label:'Sandbox',status:'PASS',detail:'ready',checkedAt:'x'},
  {type:'DB_APPROVAL',label:'DB approval',status:'BLOCKED',detail:'not granted',checkedAt:'x'},
  {type:'PRODUCTION_APPROVAL',label:'Production approval',status:'BLOCKED',detail:'external approval required',checkedAt:'x'},
]}

describe('P10 Runtime view',()=>{
  it('renders all ten adapters with required runtime fields and secret references only',()=>{
    const html=renderToStaticMarkup(<RuntimeView snapshot={{inventory,drafts:[draft],selectedDraft:draft}} component="AGENT_MODEL" adapter="" endpointAlias="" busy={false} error={null}/>)
    for(const text of ['运行时 / 适配器 · P10','适配器','端点别名','已配置','健康','版本','上次检查','密钥来源','10/10 个运行时组件已存在','AGENT_MODEL','TRACE_AUDIT','env · 已配置','agent_model-secret-ref'])expect(html).toContain(text)
    expect(html).not.toContain('apiKey');expect(html).not.toContain('password=');expect(html).not.toContain('sk-')
  })
  it('renders the full config draft flow and eligibility without a promote action',()=>{
    const html=renderToStaticMarkup(<RuntimeView snapshot={{inventory,drafts:[draft],selectedDraft:draft}} component="AGENT_MODEL" adapter="" endpointAlias="" busy={false} error={null}/>)
    for(const text of ['草稿 → 校验 → 差异 → 保存 → 版本提升 → 评测 → 可提升','EVALUATED','mock-agent-model-v2','agent-model-candidate','可提升:','是','P11 负责统一基准评测/发布门禁'])expect(html).toContain(text)
    expect(html).not.toMatch(/<button[^>]*>\s*Promote\s*<\/button>/u)
  })
})

describe('P10 Operations view',()=>{
  it('renders all readiness families and keeps approvals display-only',()=>{
    const html=renderToStaticMarkup(<OperationsView snapshot={operations} error={null}/>)
    for(const text of ['运维 · P10','CI','Adapter readiness','Staging infra','Trace / Audit','Eval gate','E2E','Renderer','Sandbox','DB approval','Production approval','NOT_READY','展示用的就绪信号'])expect(html).toContain(text)
    expect(html).not.toMatch(/<button[^>]*>[^<]*(Approve|Force Pass|Manual PASS|Promote)/iu)
  })
})
