import { createHash, randomUUID } from 'node:crypto'
import type { ReportArtifact, ReportDownloadGrant } from '../../../../shared/industry/report'
import type { SandboxBudget, SandboxRun, SandboxScenario, StartSandboxRunRequest } from '../../../../shared/industry/sandbox'
import type { TrustedRequestContext } from '../context'
import { IndustryAgentClientError } from '../clients/industry-agent-client'
import { MockIndustryAgentClient } from '../clients/mock-industry-agent-client'

const REPORTS = new WeakMap<MockIndustryAgentClient, Map<string, Map<string, ReportArtifact>>>()
const SANDBOX = new WeakMap<MockIndustryAgentClient, Map<string, Map<string, SandboxRun>>>()
const DEFAULT_BUDGET: SandboxBudget = { maxRows: 100, maxBytes: 64_000, timeoutMs: 5_000 }

declare module '../clients/mock-industry-agent-client' {
  interface MockIndustryAgentClient {
    listReports(context: TrustedRequestContext): Promise<readonly ReportArtifact[]>
    getReport(context: TrustedRequestContext, reportId: string): Promise<ReportArtifact>
    createReportDownloadGrant(context: TrustedRequestContext, reportId: string): Promise<ReportDownloadGrant>
    listSandboxRuns(context: TrustedRequestContext): Promise<readonly SandboxRun[]>
    startSandboxRun(context: TrustedRequestContext, request: StartSandboxRunRequest): Promise<SandboxRun>
    getSandboxRun(context: TrustedRequestContext, runId: string): Promise<SandboxRun>
  }
}

MockIndustryAgentClient.prototype.listReports = async function listReports(context) {
  const projectId = requireProject(context); const store = reportStore(this, projectId); seedReports(store, projectId)
  return structuredClone([...store.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)))
}
MockIndustryAgentClient.prototype.getReport = async function getReport(context, reportId) {
  const projectId=requireProject(context); const store=reportStore(this,projectId); seedReports(store,projectId); const report=store.get(reportId)
  if(report===undefined)throw new IndustryAgentClientError('REPORT_NOT_FOUND','report not found',404)
  return structuredClone(report)
}
MockIndustryAgentClient.prototype.createReportDownloadGrant = async function createReportDownloadGrant(context,reportId) {
  const report=await this.getReport(context,reportId)
  if(report.status!=='READY')throw new IndustryAgentClientError('REPORT_DOWNLOAD_BLOCKED','report is not eligible for download',409)
  return {downloadId:`report-download-${randomUUID()}`,reportId:report.reportId,fileName:report.fileName,contentDisposition:'attachment',authorized:true,expiresAt:new Date(Date.now()+5*60_000).toISOString(),artifactRef:`mock-report-artifact:${report.reportId}:${randomUUID()}`}
}
MockIndustryAgentClient.prototype.listSandboxRuns=async function listSandboxRuns(context){const projectId=requireProject(context);const store=sandboxStore(this,projectId);seedSandbox(store,projectId);return structuredClone([...store.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)))}
MockIndustryAgentClient.prototype.startSandboxRun=async function startSandboxRun(context,request){const projectId=requireProject(context);validateSandboxRequest(request);const run=buildSandboxRun(`sandbox-${randomUUID()}`,projectId,request.goal,request.budget,request.scenario??'SAFE_READ');sandboxStore(this,projectId).set(run.runId,run);return structuredClone(run)}
MockIndustryAgentClient.prototype.getSandboxRun=async function getSandboxRun(context,runId){const projectId=requireProject(context);const store=sandboxStore(this,projectId);seedSandbox(store,projectId);const run=store.get(runId);if(run===undefined)throw new IndustryAgentClientError('SANDBOX_RUN_NOT_FOUND','sandbox run not found',404);return structuredClone(run)}

function reportStore(client:MockIndustryAgentClient,projectId:string):Map<string,ReportArtifact>{let projects=REPORTS.get(client);if(projects===undefined){projects=new Map();REPORTS.set(client,projects)}let store=projects.get(projectId);if(store===undefined){store=new Map();projects.set(projectId,store)}return store}
function sandboxStore(client:MockIndustryAgentClient,projectId:string):Map<string,SandboxRun>{let projects=SANDBOX.get(client);if(projects===undefined){projects=new Map();SANDBOX.set(client,projects)}let store=projects.get(projectId);if(store===undefined){store=new Map();projects.set(projectId,store)}return store}

function seedReports(store:Map<string,ReportArtifact>,projectId:string):void{
  if(store.size>0)return
  const baseSecurity={hiddenFieldBlocked:true,activeContentBlocked:true,externalLinksBlocked:true,macroBlocked:true,pdfActionsBlocked:true,svgScriptsBlocked:true,safePath:true,sizeWithinLimit:true,completedWithinTimeout:true}
  const pdf:ReportArtifact={reportId:'report-progress-v1',projectId,title:'工程进度周报',format:'PDF',fileName:'project-progress-weekly.pdf',sizeBytes:184_320,status:'READY',mimeType:'application/pdf',preview:'本周完成 12 个工程部位，未完成 3 个。所有结论均可追溯到查询结果与知识证据。',metadata:{reportVersion:'1.0.0',renderer:'mock-safe-pdf-v1',locale:'zh-CN'},evidence:[{evidenceId:'evidence-query-1',label:'未完成工程部位查询',sourceType:'QUERY_RESULT',sourceRef:'query:p9-progress-1',covered:true},{evidenceId:'evidence-rag-1',label:'施工规范引用',sourceType:'RAG_CHUNK',sourceRef:'chunk:spec-v3-42',covered:true}],lineage:[{nodeId:'source-query',type:'SOURCE',label:'query:p9-progress-1',parentIds:[]},{nodeId:'source-rag',type:'SOURCE',label:'chunk:spec-v3-42',parentIds:[]},{nodeId:'transform-summary',type:'TRANSFORM',label:'weekly-progress-summary',parentIds:['source-query','source-rag']},{nodeId:'report',type:'REPORT',label:'project-progress-weekly.pdf',parentIds:['transform-summary']}],security:baseSecurity,traceId:`trace-report-${projectId}-progress`,createdAt:'2026-09-13T08:30:00.000Z'}
  const xlsx:ReportArtifact={...pdf,reportId:'report-boq-v1',title:'工程量清单快照',format:'XLSX',fileName:'boq-snapshot.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',sizeBytes:98_304,preview:'只包含授权列：清单编码、名称、规格、数量、单位。隐藏字段未导出。',metadata:{reportVersion:'1.0.0',renderer:'mock-safe-xlsx-v1',locale:'zh-CN'},evidence:[{evidenceId:'evidence-query-2',label:'清单查询快照',sourceType:'QUERY_RESULT',sourceRef:'query:p9-boq-1',covered:true}],lineage:[{nodeId:'source-query',type:'SOURCE',label:'query:p9-boq-1',parentIds:[]},{nodeId:'report',type:'REPORT',label:'boq-snapshot.xlsx',parentIds:['source-query']}],traceId:`trace-report-${projectId}-boq`,createdAt:'2026-09-13T08:31:00.000Z'}
  store.set(pdf.reportId,pdf);store.set(xlsx.reportId,xlsx)
}
function seedSandbox(store:Map<string,SandboxRun>,projectId:string):void{if(store.size>0)return;const safe=buildSandboxRun('sandbox-safe-read-v1',projectId,'统计当前项目未完成工程部位',DEFAULT_BUDGET,'SAFE_READ');const blocked=buildSandboxRun('sandbox-write-blocked-v1',projectId,'尝试修改工程部位状态',DEFAULT_BUDGET,'WRITE_SQL');store.set(safe.runId,safe);store.set(blocked.runId,blocked)}

function buildSandboxRun(runId:string,projectId:string,goal:string,budget:SandboxBudget,scenario:SandboxScenario):SandboxRun{
  const createdAt='2026-09-13T08:35:00.000Z'
  const schema=[{table:'engineering_position',columns:[{name:'id',type:'VARCHAR(32)'},{name:'name',type:'VARCHAR(255)'},{name:'status',type:'VARCHAR(32)'},{name:'project_id',type:'VARCHAR(32)'}]}]
  let generatedSql="SELECT id, name, status FROM engineering_position WHERE project_id = :trusted_project_id AND status <> 'DONE' LIMIT 100"
  let pythonSource='rows = query_result\nsummary = {"count": len(rows)}'
  let terminationReason:SandboxRun['terminationReason']='SUCCESS'
  const validation:SandboxRun['validation'][number][]=[]
  let attestationVerified=true
  if(scenario==='WRITE_SQL'){generatedSql="UPDATE engineering_position SET status = 'DONE' WHERE project_id = :trusted_project_id";validation.push(block('WRITE_SQL_REJECTED','write SQL is prohibited'));terminationReason='SQL_POLICY_BLOCKED'}
  else if(scenario==='SELECT_STAR'){generatedSql='SELECT * FROM engineering_position WHERE project_id = :trusted_project_id';validation.push(block('SELECT_STAR_REJECTED','SELECT * is prohibited'));terminationReason='SQL_POLICY_BLOCKED'}
  else if(scenario==='LOAD_FILE'){generatedSql="SELECT LOAD_FILE('/etc/passwd')";validation.push(block('LOAD_FILE_REJECTED','LOAD_FILE is prohibited'));terminationReason='SQL_POLICY_BLOCKED'}
  else if(scenario==='SYSTEM_SCHEMA'){generatedSql='SELECT table_name FROM information_schema.tables';validation.push(block('SYSTEM_SCHEMA_REJECTED','system schemas are prohibited'));terminationReason='SQL_POLICY_BLOCKED'}
  else if(scenario==='PYTHON_IMPORT_OPEN_NETWORK_PROCESS'){pythonSource='import os, socket, subprocess\nopen("/etc/passwd")';validation.push(block('PYTHON_CAPABILITY_REJECTED','import/open/network/process capabilities are prohibited'));terminationReason='PYTHON_POLICY_BLOCKED'}
  else if(scenario==='ATTESTATION'){attestationVerified=false;validation.push(block('ATTESTATION_FAILED','runtime attestation did not verify'));terminationReason='ATTESTATION_FAILED'}
  else if(scenario==='PAYLOAD_BUDGET'){validation.push({code:'PAYLOAD_BUDGET_ENFORCED',severity:'INFO',message:'output stopped at configured row/byte budget'});terminationReason='PAYLOAD_BUDGET'}
  else validation.push({code:'READ_ONLY_SQL_VALIDATED',severity:'INFO',message:'SQL is read-only, scoped, explicit-column, and bounded'})
  const blockedRun=validation.some((item)=>item.severity==='BLOCK')
  const queryId=blockedRun?null:`query-${randomUUID()}`
  const candidates=[{id:'123456789012345678',name:'一号墩钢筋工程',status:'IN_PROGRESS'},{id:'223456789012345678',name:'二号墩基础',status:'PENDING'}]
  const rowLimited=blockedRun?[]:candidates.slice(0,Math.min(candidates.length,budget.maxRows))
  const rows=fitRowsToByteBudget(rowLimited,budget.maxBytes)
  const bytes=Buffer.byteLength(JSON.stringify(rows),'utf8')
  if(!blockedRun&&(rows.length<rowLimited.length||rows.length<candidates.length&&scenario==='PAYLOAD_BUDGET'))terminationReason='PAYLOAD_BUDGET'
  const attestation={runtimeId:'mock-sandbox-runtime-v1',imageDigest:'sha256:mock-sandbox-runtime-v1',networkDisabled:true,processSpawnDisabled:true,filesystemReadOnly:true,verified:attestationVerified}
  const status:SandboxRun['status']=blockedRun?'BLOCKED':terminationReason==='SUCCESS'?'COMPLETED':'TERMINATED'
  return{runId,projectId,goal,status,scenario,budget:{...budget},schema,generatedSql,validation,queryId,brokerPolicies:[{policy:'sql_mode',value:'read_only_select_cte'},{policy:'project_scope',value:'trusted_context_only'},{policy:'select_star',value:'deny'},{policy:'system_schema',value:'deny'},{policy:'network',value:'disabled'},{policy:'process_spawn',value:'disabled'}],pythonSource,pythonHash:createHash('sha256').update(pythonSource).digest('hex'),runtimeAttestation:attestation,output:{columns:['id','name','status'],rows,rowCount:rows.length,bytes},lineage:[{nodeId:'goal',type:'GOAL',label:goal,parentIds:[]},{nodeId:'sql',type:'SQL',label:'generated SQL',parentIds:['goal']},{nodeId:'query',type:'QUERY',label:queryId??'blocked before query',parentIds:['sql']},{nodeId:'python',type:'PYTHON',label:'post-process',parentIds:['query']},{nodeId:'output',type:'OUTPUT',label:'sandbox output',parentIds:['python']}],terminationReason,traceId:`trace-${runId}`,createdAt,completedAt:new Date(Date.parse(createdAt)+Math.min(budget.timeoutMs,250)).toISOString()}
}

function fitRowsToByteBudget(rows:readonly Readonly<Record<string,string|number|null>>[],maxBytes:number):readonly Readonly<Record<string,string|number|null>>[]{const accepted:Readonly<Record<string,string|number|null>>[]=[];for(const row of rows){const next=[...accepted,row];if(Buffer.byteLength(JSON.stringify(next),'utf8')>maxBytes)break;accepted.push(row)}return accepted}
function validateSandboxRequest(request:StartSandboxRunRequest):void{if(request.goal.trim()===''||request.goal.length>2000)throw new IndustryAgentClientError('SANDBOX_GOAL_INVALID','sandbox goal is required and must be at most 2000 characters',400);const{maxRows,maxBytes,timeoutMs}=request.budget;if(!Number.isInteger(maxRows)||maxRows<1||maxRows>10_000)throw new IndustryAgentClientError('SANDBOX_BUDGET_INVALID','maxRows must be between 1 and 10000',400);if(!Number.isInteger(maxBytes)||maxBytes<128||maxBytes>10_000_000)throw new IndustryAgentClientError('SANDBOX_BUDGET_INVALID','maxBytes is invalid',400);if(!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>60_000)throw new IndustryAgentClientError('SANDBOX_BUDGET_INVALID','timeoutMs is invalid',400)}
function block(code:string,message:string):SandboxRun['validation'][number]{return{code,severity:'BLOCK',message}}
function requireProject(context:TrustedRequestContext):string{if(context.projectId===null)throw new IndustryAgentClientError('INDUSTRY_PROJECT_REQUIRED','active project is required',409);return context.projectId}
