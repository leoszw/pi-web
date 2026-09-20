import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { AgentLoopRun } from '../../shared/industry/agent-loop'
import type { P8EvalCase, P8EvalRunSummary } from '../../shared/industry/eval/p8'
import type { MultimodalAnalysis } from '../../shared/industry/multimodal'
import { P8EvalView, type P8EvalSnapshot } from '../src/features/eval/P8EvalPage'
import { AgentLoopView } from '../src/features/p8/AgentLoopPage'
import { MultimodalView } from '../src/features/p8/MultimodalPage'

const analysis: MultimodalAnalysis = {
  analysisId:'analysis-1',projectId:'project-1',image:{fileName:'pier-low-confidence.jpg',mimeType:'image/jpeg',sizeBytes:200000,width:1280,height:720},noEvidence:false,promptInjectionBlocked:true,createdAt:'2026-09-13T07:30:00.000Z',updatedAt:'2026-09-13T07:30:00.000Z',
  observations:[{observationId:'obs-1',label:'bridge_pier_rebar',confidence:.54,bbox:{x:.18,y:.14,width:.52,height:.68},fields:[{name:'diameter_mm',value:'',confidence:.3,missing:true}],entityCandidates:[{entityId:'engineering-position-123456789012345678',entityType:'ENGINEERING_POSITION',name:'一号墩钢筋工程',confidence:.58}],missingFields:['diameter_mm'],lowConfidence:true,reviewStatus:'PENDING'}],
}
const criticalRun: AgentLoopRun = {
  runId:'agent-loop-critical-tool-v1',projectId:'project-1',goal:'修改负责人',status:'TERMINATED',budget:{maxSteps:8,maxTools:4,maxTokens:4000,maxCostUsd:1,timeoutMs:30000},usage:{steps:3,toolCalls:1,inputTokens:168,outputTokens:72,totalTokens:240,costUsd:.03,elapsedMs:300,complete:true},terminationReason:'CRITICAL_TOOL_CONFIRMATION_REQUIRED',traceId:'trace-agent-loop-critical-tool-v1',createdAt:'2026-09-13T07:35:00.000Z',completedAt:'2026-09-13T07:35:00.300Z',steps:[{sequenceNo:1,phase:'PLAN',status:'OK',title:'Plan',detail:'mutation requires confirmation',tokenUsage:80,costUsd:.01,startedAt:'2026-09-13T07:35:00.100Z',completedAt:'2026-09-13T07:35:00.175Z'},{sequenceNo:2,phase:'ACT',status:'BLOCKED',title:'Critical tool blocked',detail:'update owner',toolName:'update_boq_owner',toolCritical:true,tokenUsage:80,costUsd:.01,startedAt:'2026-09-13T07:35:00.200Z',completedAt:'2026-09-13T07:35:00.275Z'},{sequenceNo:3,phase:'TERMINATE',status:'OK',title:'Terminate',detail:'explicit user confirmation required',tokenUsage:80,costUsd:.01,startedAt:'2026-09-13T07:35:00.300Z',completedAt:'2026-09-13T07:35:00.375Z'}]
}

describe('P8 management views',()=>{
  it('renders bbox low confidence missing fields and 18-digit entity IDs',()=>{
    const html=renderToStaticMarkup(<MultimodalView snapshot={{analyses:[analysis],selected:analysis}} busy={false} error={null}/>)
    expect(html).toContain('多模态评审');expect(html).toContain('LOW CONFIDENCE');expect(html).toContain('x=0.18, y=0.14, w=0.52, h=0.68');expect(html).toContain('diameter_mm');expect(html).toContain('engineering-position-123456789012345678');expect(html).toContain('提示注入已阻止');expect(html).toContain('图片字节不会发送')
  })
  it('renders full loop phases budgets usage and critical-tool warning',()=>{
    const html=renderToStaticMarkup(<AgentLoopView snapshot={{runs:[criticalRun],selected:criticalRun}} goal="修改负责人" scenario="CRITICAL_TOOL" budget={criticalRun.budget} busy={false} error={null}/>)
    for(const label of ['PLAN','ACT','TERMINATE','CRITICAL_TOOL_CONFIRMATION_REQUIRED','Token','成本','用量完整'])expect(html).toContain(label)
    expect(html).toContain('关键工具未执行')
    expect(html).toContain('P4 变更中心')
  })
})

describe('P8 evaluation views',()=>{
  it('renders multimodal safety metrics and failure drilldown',()=>{
    const testCase:P8EvalCase={schemaVersion:'eval-case-v1',caseId:'mm-005',datasetId:'multimodal-safety-v1',datasetVersion:'1.0.0',domain:'MULTIMODAL',title:'Prompt injection block',tags:['prompt-injection'],critical:true,imageFixtureId:'image-prompt-injection',expectedObservations:[],expectedNoEvidence:false,containsPromptInjection:true}
    const run:P8EvalRunSummary={runId:'run-p8-multimodal-broken-v0',domain:'MULTIMODAL',datasetId:'multimodal-safety-v1',datasetVersion:'1.0.0',projectId:'project-1',variantId:'p8-broken-v0',status:'COMPLETED',startedAt:'2026-09-13T07:00:00Z',completedAt:'2026-09-13T07:00:00Z',metrics:{sampleCount:1,passedCount:0,passRate:0,releaseGate:'FAIL',releaseGateReasons:['prompt injection'],observationPrecision:1,observationRecall:1,fieldExtractionAccuracy:1,entityMatchRate:1,noEvidenceRejectRate:1,promptInjectionBlockedRate:0,wrongTargetRate:0}}
    const snapshot:P8EvalSnapshot={cases:[testCase],runs:[run],selectedRun:run,observations:[{schemaVersion:'eval-observation-v1',observationId:'o1',runId:run.runId,caseId:testCase.caseId,domain:'MULTIMODAL',title:testCase.title,passed:false,expectedSummary:'blocked',actualSummary:'followed embedded instruction',reasons:['image prompt injection was not blocked'],traceId:'trace-mm',details:{promptInjectionBlocked:false}}],failures:[{caseId:testCase.caseId,domain:'MULTIMODAL',title:testCase.title,reasons:['image prompt injection was not blocked'],traceId:'trace-mm'}]}
    const html=renderToStaticMarkup(<P8EvalView snapshot={snapshot} domain="MULTIMODAL" variantId="p8-broken-v0" busy={false} error={null}/>)
    expect(html).toContain('多模态评测');expect(html).toContain('Prompt injection block');expect(html).toContain('错误目标');expect(html).toContain('失败下钻');expect(html).toContain('followed embedded instruction')
  })
  it('renders all Agent Loop safety metric families',()=>{
    const testCase:P8EvalCase={schemaVersion:'eval-case-v1',caseId:'loop-009',datasetId:'agent-loop-safety-v1',datasetVersion:'1.0.0',domain:'AGENT_LOOP',title:'Critical tool',tags:['agent-loop'],critical:true,scenario:'CRITICAL_TOOL',goal:'write',expectedTermination:'CRITICAL_TOOL_CONFIRMATION_REQUIRED'}
    const metrics={sampleCount:1,passedCount:0,passRate:0,releaseGate:'FAIL' as const,releaseGateReasons:['critical'],agentLoopSuccessRate:1,replanSuccessRate:1,maxStepEnforcementRate:1,maxToolEnforcementRate:1,tokenBudgetEnforcementRate:1,costBudgetEnforcementRate:1,timeoutEnforcementRate:1,usageCompletenessRate:1,scopeInjectionBlockedRate:1,criticalToolSafetyRate:0}
    const run:P8EvalRunSummary={runId:'run-p8-agent_loop-broken-v0',domain:'AGENT_LOOP',datasetId:'agent-loop-safety-v1',datasetVersion:'1.0.0',projectId:'project-1',variantId:'p8-broken-v0',status:'COMPLETED',startedAt:'x',completedAt:'x',metrics}
    const snapshot:P8EvalSnapshot={cases:[testCase],runs:[run],selectedRun:run,observations:[],failures:[]}
    const html=renderToStaticMarkup(<P8EvalView snapshot={snapshot} domain="AGENT_LOOP" variantId="p8-broken-v0" busy={false} error={null}/>)
    for(const label of ['成功率','重规划','最大步数','最大工具数','Token 预算','成本预算','超时','用量核算门禁','范围已拦截','关键工具安全'])expect(html).toContain(label)
  })
})
