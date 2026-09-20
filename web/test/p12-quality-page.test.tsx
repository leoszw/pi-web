import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { OnlineQualityWorkspaceSnapshot } from '../src/features/p12/OnlineQualityPage'
import { OnlineQualityView } from '../src/features/p12/OnlineQualityPage'

const metrics=[
  ['INTENT_DRIFT_RATE','Intent drift'],['CLARIFICATION_RATE','Clarification'],['ZERO_RETRIEVAL_RATE','Zero retrieval'],['LOW_CONFIDENCE_RATE','Low confidence'],['TOOL_ERROR_RATE','Tool error'],['MUTATION_REJECT_RATE','Mutation reject'],['RAG_INSUFFICIENT_EVIDENCE_RATE','RAG insufficient evidence'],['P95_LATENCY_MS','P95 latency'],['AVG_TOKENS','Average tokens'],['AVG_COST_USD','Average cost'],['USER_CORRECTION_RATE','User correction'],
] as const
const snapshot:OnlineQualityWorkspaceSnapshot={
  online:{source:'MOCK_FIXTURE',projectId:'project-1',windowStart:'2026-09-12T00:00:00.000Z',windowEnd:'2026-09-13T00:00:00.000Z',sampleCount:500,metrics:metrics.map(([metricId,label],index)=>({metricId,label,value:index===0?.03:.01,previousValue:.01,delta:index===0?.02:0,unit:metricId==='P95_LATENCY_MS'?'MS':metricId==='AVG_TOKENS'?'TOKENS':metricId==='AVG_COST_USD'?'USD':'RATE',warningThreshold:index===0?.02:.1,failureThreshold:index===0?.05:.2,status:index===0?'WARN':'PASS'})),signals:[{signalId:'s1',type:'INTENT_DRIFT_RATE',title:'Intent drift increased',severity:'WARN',detail:'above threshold',observedValue:.03,threshold:.02,traceIds:['trace-project-1-conversation-001']}]},
  feedback:[{feedbackId:'feedback-1',projectId:'project-1',traceId:'trace-project-1-conversation-001',source:'ONLINE_TRACE',targetDomain:'INTENT',stage:'VERSIONED',sanitizedInput:'CONVERSATION · 行业 Agent 对话',sanitization:{removedSecretPatterns:1,removedPromptContent:true,sourceScopeTrusted:true},humanLabel:{label:'CLARIFICATION_REQUIRED',tags:['intent','clarification'],difficulty:'ADVERSARIAL',labeledBy:'user-1',labeledAt:'2026-09-13T00:00:00.000Z'},review:{approved:true,reviewNote:'checked',reviewedBy:'reviewer-1',reviewedAt:'2026-09-13T00:01:00.000Z'},datasetVersion:{datasetId:'online-feedback-reviewed',version:'1.0.1',status:'REVIEWED',golden:false,createdAt:'2026-09-13T00:02:00.000Z'},createdAt:'2026-09-13T00:00:00.000Z',updatedAt:'2026-09-13T00:02:00.000Z'}],
  health:{source:'MOCK_FIXTURE',projectId:'project-1',datasetId:'online-feedback-reviewed',sourceCaseCount:3,draftCount:1,labeledCount:2,reviewedCount:1,versionedCount:1,reviewedPercent:1/3,hardAdversarialCount:2,hardAdversarialPercent:1,tagDistribution:[{tag:'intent',count:1},{tag:'clarification',count:1}],duplicateCount:1,nearDuplicateCount:2,holdoutLeakageCount:0,labelChurnRate:.08,lastReviewAgeDays:2,issues:[{issueId:'i1',type:'DUPLICATE',severity:'WARN',count:1,detail:'review duplicate'},{issueId:'i2',type:'NEAR_DUPLICATE',severity:'WARN',count:2,detail:'review near duplicates'},{issueId:'i3',type:'LABEL_CHURN',severity:'WARN',count:1,detail:'label churn 8%'}],computedAt:'2026-09-13T00:00:00.000Z'},
  versions:[{datasetId:'online-feedback-reviewed',projectId:'project-1',version:'1.0.1',status:'REVIEWED',golden:false,sourceFeedbackIds:['feedback-1'],caseCount:1,fingerprint:'sha256:1234567890abcdef1234567890abcdef',createdAt:'2026-09-13T00:02:00.000Z',createdBy:'user-1'}],
}

describe('OnlineQualityView',()=>{
  it('renders all P12 monitoring and Dataset Health dimensions with explicit fixture source',()=>{
    const html=renderToStaticMarkup(<OnlineQualityView snapshot={snapshot} error={null} busy={false} traceId="" domain="INTENT" label="" tags="online" difficulty="HARD" notes="" reviewNote=""/>)
    expect(html).toContain('在线质量反馈循环 · P12');expect(html).toContain('500');for(const[,label]of metrics)expect(html).toContain(label)
    expect(html).toContain('MOCK_FIXTURE')
    expect(html).toContain('追踪 → 净化 → 草稿用例 → 人工标注 → 评审 → 数据集版本')
    for(const text of ['已评审 %','困难 / 对抗','重复项','近似重复项','留出集泄露','标注变动','上次评审距今'])expect(html).toContain(text)
    expect(html).toContain('trace-project-1-conversation-001');expect(html).toContain('CLARIFICATION_REQUIRED');expect(html).toContain('Golden:');expect(html).toContain('false')
  })
  it('does not render an executable Golden or promote control',()=>{
    const html=renderToStaticMarkup(<OnlineQualityView snapshot={snapshot} error={null} busy={false} traceId="" domain="INTENT" label="" tags="online" difficulty="HARD" notes="" reviewNote=""/>)
    expect(html).not.toContain('>Make Golden<');expect(html).not.toContain('>Promote to Golden<');expect(html).not.toContain('>Promote<')
    expect(html).toContain('没有 Make Golden / Promote-to-Golden 操作')
  })
})
