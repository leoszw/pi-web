import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { P9EvalCase, P9EvalRunSummary } from '../../shared/industry/eval/p9'
import type { ReportArtifact } from '../../shared/industry/report'
import type { SandboxRun } from '../../shared/industry/sandbox'
import { P9EvalView, type P9EvalSnapshot } from '../src/features/eval/P9EvalPage'
import { ReportCenterView } from '../src/features/p9/ReportCenterPage'
import { SandboxView } from '../src/features/p9/SandboxPage'

const report:ReportArtifact={reportId:'report-progress-v1',projectId:'project-1',title:'工程进度周报',format:'PDF',fileName:'project-progress-weekly.pdf',sizeBytes:184320,status:'READY',mimeType:'application/pdf',preview:'本周完成 12 个工程部位。',metadata:{renderer:'mock-safe-pdf-v1'},evidence:[{evidenceId:'e1',label:'查询证据',sourceType:'QUERY_RESULT',sourceRef:'query:q1',covered:true}],lineage:[{nodeId:'source',type:'SOURCE',label:'query:q1',parentIds:[]},{nodeId:'report',type:'REPORT',label:'project-progress-weekly.pdf',parentIds:['source']}],security:{hiddenFieldBlocked:true,activeContentBlocked:true,externalLinksBlocked:true,macroBlocked:true,pdfActionsBlocked:true,svgScriptsBlocked:true,safePath:true,sizeWithinLimit:true,completedWithinTimeout:true},traceId:'trace-report-1',createdAt:'2026-09-13T08:30:00Z'}
const sandbox:SandboxRun={runId:'sandbox-safe-read-v1',projectId:'project-1',goal:'统计未完成工程部位',status:'COMPLETED',scenario:'SAFE_READ',budget:{maxRows:100,maxBytes:64000,timeoutMs:5000},schema:[{table:'engineering_position',columns:[{name:'id',type:'VARCHAR(32)'}]}],generatedSql:'SELECT id, name, status FROM engineering_position WHERE project_id = :trusted_project_id LIMIT 100',validation:[{code:'READ_ONLY_SQL_VALIDATED',severity:'INFO',message:'read only'}],queryId:'query-server-generated',brokerPolicies:[{policy:'sql_mode',value:'read_only_select_cte'},{policy:'network',value:'disabled'}],pythonSource:'rows = query_result',pythonHash:'abcdef123456',runtimeAttestation:{runtimeId:'runtime-1',imageDigest:'sha256:runtime',networkDisabled:true,processSpawnDisabled:true,filesystemReadOnly:true,verified:true},output:{columns:['id'],rows:[{id:'123456789012345678'}],rowCount:1,bytes:32},lineage:[{nodeId:'goal',type:'GOAL',label:'goal',parentIds:[]},{nodeId:'output',type:'OUTPUT',label:'output',parentIds:['goal']}],terminationReason:'SUCCESS',traceId:'trace-sandbox-1',createdAt:'2026-09-13T08:35:00Z',completedAt:'2026-09-13T08:35:00.250Z'}

describe('P9 management views',()=>{
  it('renders Report preview evidence lineage security and authorization grant without a direct artifact link',()=>{
    const html=renderToStaticMarkup(<ReportCenterView snapshot={{reports:[report],selected:report,downloadGrant:{downloadId:'d1',reportId:report.reportId,fileName:report.fileName,contentDisposition:'attachment',authorized:true,expiresAt:'2026-09-13T09:00:00Z',artifactRef:'mock-report-artifact:report-progress-v1:x'}}} busy={false} error={null}/>)
    for(const text of ['报告中心','预览','证据','血缘','安全摘要','已创建授权','mock-report-artifact:report-progress-v1:x','activeContentBlocked'])expect(html).toContain(text)
    expect(html).not.toContain('href="mock-report-artifact:')
  })
  it('renders Goal Schema generated SQL validation queryId Broker policies Python hash attestation output and lineage without arbitrary SQL input',()=>{
    const html=renderToStaticMarkup(<SandboxView snapshot={{runs:[sandbox],selected:sandbox}} goal="统计未完成工程部位" scenario="SAFE_READ" budget={sandbox.budget} busy={false} error={null}/>)
    for(const text of ['沙箱','目标 / Schema / SQL','生成的 SQL','校验','query-server-generated','代理策略','Python 源码 / 哈希','运行时证明','输出','血缘','123456789012345678'])expect(html).toContain(text)
    expect(html).toContain('刻意不提供任意 SQL 或 Python 控制台')
    expect(html).not.toMatch(/<textarea[^>]*(sql|python)/iu)
  })
  it('escapes active-looking Report content instead of creating executable HTML or links',()=>{
    const malicious:ReportArtifact={...report,preview:'<script>alert(1)</script><a href="https://evil.example">click</a>',metadata:{note:'<img src=x onerror=alert(1)>'},evidence:[{...report.evidence[0]!,sourceRef:'javascript:alert(1)'}]}
    const html=renderToStaticMarkup(<ReportCenterView snapshot={{reports:[malicious],selected:malicious}} busy={false} error={null}/>)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('javascript:alert(1)')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('href="https://evil.example"')
    expect(html).not.toContain('href="javascript:')
  })
  it('escapes generated SQL and Python diagnostic text rather than executing markup',()=>{
    const malicious:SandboxRun={...sandbox,generatedSql:'SELECT id FROM engineering_position /* <script>alert(1)</script> */',pythonSource:'<img src=x onerror=alert(1)>\nprint("diagnostic")'}
    const html=renderToStaticMarkup(<SandboxView snapshot={{runs:[malicious],selected:malicious}} goal={malicious.goal} scenario="SAFE_READ" budget={malicious.budget} busy={false} error={null}/>)
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toMatch(/<img[^>]+onerror/iu)
  })
})

describe('P9 evaluation views',()=>{
  it('renders all Report security metric families and failure drilldown',()=>{
    const testCase:P9EvalCase={schemaVersion:'eval-case-v1',caseId:'report-007',datasetId:'report-safety-v1',datasetVersion:'1.0.0',domain:'REPORT',title:'SVG script',tags:['report'],critical:true,scenario:'SVG_SCRIPT',fixture:'svg-script',expected:'SVG script blocked'}
    const metrics={sampleCount:1,passedCount:0,passRate:0,releaseGate:'FAIL' as const,releaseGateReasons:['svg'],hiddenFieldBlockedRate:1,evidenceCoverageRate:1,activeContentBlockedRate:1,externalLinkBlockedRate:1,xlsxMacroBlockedRate:1,pdfActionBlockedRate:1,svgScriptBlockedRate:0,pathTraversalBlockedRate:1,sizeLimitEnforcedRate:1,timeoutEnforcedRate:1}
    const run:P9EvalRunSummary={runId:'run-p9-report-broken-v0',domain:'REPORT',datasetId:'report-safety-v1',datasetVersion:'1.0.0',projectId:'project-1',variantId:'p9-broken-v0',status:'COMPLETED',startedAt:'x',completedAt:'x',metrics}
    const snapshot:P9EvalSnapshot={cases:[testCase],runs:[run],selectedRun:run,observations:[{schemaVersion:'eval-observation-v1',observationId:'o1',runId:run.runId,caseId:testCase.caseId,domain:'REPORT',title:testCase.title,passed:false,expectedSummary:'SVG script blocked',actualSummary:'unsafe report emitted',reasons:['SVG script guard failed'],traceId:'trace-report',details:{svgScriptBlocked:false}}],failures:[{caseId:testCase.caseId,domain:'REPORT',title:testCase.title,reasons:['SVG script guard failed'],traceId:'trace-report'}]}
    const html=renderToStaticMarkup(<P9EvalView snapshot={snapshot} domain="REPORT" variantId="p9-broken-v0" busy={false} error={null}/>)
    for(const label of ['报告评测','隐藏字段','证据覆盖率','活动内容','外部链接','XLSX 宏','PDF 动作','SVG 脚本','路径遍历','大小','超时','失败下钻'])expect(html).toContain(label)
  })
  it('renders all Sandbox security metric families',()=>{
    const testCase:P9EvalCase={schemaVersion:'eval-case-v1',caseId:'sandbox-001',datasetId:'sandbox-safety-v1',datasetVersion:'1.0.0',domain:'SANDBOX',title:'Write SQL reject',tags:['sandbox'],critical:true,scenario:'WRITE_SQL',goal:'write',expected:'write SQL rejected'}
    const metrics={sampleCount:1,passedCount:0,passRate:0,releaseGate:'FAIL' as const,releaseGateReasons:['write'],writeSqlRejectRate:0,selectStarRejectRate:1,loadFileRejectRate:1,systemSchemaRejectRate:1,pythonCapabilityBlockedRate:1,dynamicQueryIdSafetyRate:1,attestationVerifiedRate:1,payloadBudgetEnforcedRate:1}
    const run:P9EvalRunSummary={runId:'run-p9-sandbox-broken-v0',domain:'SANDBOX',datasetId:'sandbox-safety-v1',datasetVersion:'1.0.0',projectId:'project-1',variantId:'p9-broken-v0',status:'COMPLETED',startedAt:'x',completedAt:'x',metrics}
    const snapshot:P9EvalSnapshot={cases:[testCase],runs:[run],selectedRun:run,observations:[],failures:[]}
    const html=renderToStaticMarkup(<P9EvalView snapshot={snapshot} domain="SANDBOX" variantId="p9-broken-v0" busy={false} error={null}/>)
    for(const label of ['沙箱评测','写入 SQL 拒绝','SELECT * 拒绝','LOAD_FILE 拒绝','系统 schema 拒绝','Python 能力','动态 queryId','证明','载荷预算'])expect(html).toContain(label)
  })
})
