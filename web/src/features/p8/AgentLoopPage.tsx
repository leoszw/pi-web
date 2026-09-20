import { useEffect, useState } from 'react'
import type { AgentLoopBudget, AgentLoopRun, StartAgentLoopRunRequest } from '../../../../shared/industry/agent-loop'
import { createP8ApiClient, type P8ApiClient } from '../../api/p8-client'
import './p8.css'

const defaultClient = createP8ApiClient()
const DEFAULT_BUDGET: AgentLoopBudget = { maxSteps: 8, maxTools: 4, maxTokens: 4000, maxCostUsd: 1, timeoutMs: 30000 }

export interface AgentLoopSnapshot { runs: readonly AgentLoopRun[]; selected?: AgentLoopRun }

export function AgentLoopPage({ client = defaultClient, initialSnapshot }: { client?: P8ApiClient; initialSnapshot?: AgentLoopSnapshot }) {
  const [snapshot, setSnapshot] = useState<AgentLoopSnapshot | undefined>(initialSnapshot)
  const [goal, setGoal] = useState('查询当前项目未完成工程部位并汇总')
  const [scenario, setScenario] = useState<NonNullable<StartAgentLoopRunRequest['scenario']>>('SUCCESS')
  const [budget, setBudget] = useState<AgentLoopBudget>(DEFAULT_BUDGET)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled=false
    void client.listAgentLoopRuns().then((runs)=>{if(!cancelled)setSnapshot({runs,selected:runs[0]})}).catch((reason:unknown)=>{if(!cancelled)setError(messageOf(reason))})
    return()=>{cancelled=true}
  },[client,initialSnapshot])

  async function start():Promise<void>{setBusy(true);setError(null);try{const selected=await client.startAgentLoopRun({goal,budget,scenario});const runs=await client.listAgentLoopRuns();setSnapshot({runs,selected})}catch(reason){setError(messageOf(reason))}finally{setBusy(false)}}
  async function select(runId:string):Promise<void>{setBusy(true);setError(null);try{const selected=await client.getAgentLoopRun(runId);setSnapshot((value)=>value===undefined?value:{...value,selected})}catch(reason){setError(messageOf(reason))}finally{setBusy(false)}}

  if(snapshot===undefined)return <main className="p8-page"><h1>智能体循环</h1><p>{error??'加载智能体循环运行记录…'}</p></main>
  return <AgentLoopView snapshot={snapshot} goal={goal} scenario={scenario} budget={budget} busy={busy} error={error} onGoalChange={setGoal} onScenarioChange={setScenario} onBudgetChange={setBudget} onStart={()=>void start()} onSelect={(id)=>void select(id)} />
}

export function AgentLoopView({snapshot,goal,scenario,budget,busy,error,onGoalChange=()=>undefined,onScenarioChange=()=>undefined,onBudgetChange=()=>undefined,onStart=()=>undefined,onSelect=()=>undefined}:{
  snapshot:AgentLoopSnapshot;goal:string;scenario:NonNullable<StartAgentLoopRunRequest['scenario']>;budget:AgentLoopBudget;busy:boolean;error:string|null
  onGoalChange?:(value:string)=>void;onScenarioChange?:(value:NonNullable<StartAgentLoopRunRequest['scenario']>)=>void;onBudgetChange?:(value:AgentLoopBudget)=>void;onStart?:()=>void;onSelect?:(runId:string)=>void
}){
  return <main className="p8-page" aria-labelledby="agent-loop-title">
    <header className="p8-heading"><div><span>行业智能体 · P8</span><h1 id="agent-loop-title">智能体循环运行浏览器</h1><p>确定性模拟 Plan → Act → Verify → Replan → Terminate 运行,具有受限的步数、工具、Token、成本、超时与终止原因。</p></div><nav><a href="/industry/multimodal">多模态</a><a href="/industry/eval/agent-loop">智能体循环评测</a></nav></header>
    {error===null?null:<p role="alert" className="p8-error">{error}</p>}
    <section className="p8-panel"><h2>开始模拟运行</h2><label>目标<textarea value={goal} disabled={busy} onChange={(event)=>onGoalChange(event.target.value)} /></label><label>场景<select value={scenario} disabled={busy} onChange={(event)=>onScenarioChange(event.target.value as NonNullable<StartAgentLoopRunRequest['scenario']>)}>{['SUCCESS','REPLAN','MAX_STEPS','MAX_TOOLS','TOKEN_COST','TIMEOUT','USAGE_INCOMPLETE','SCOPE_INJECTION','CRITICAL_TOOL'].map((item)=><option key={item}>{item}</option>)}</select></label><div className="p8-form-grid"><BudgetInput label="最大步数" value={budget.maxSteps} disabled={busy} onChange={(maxSteps)=>onBudgetChange({...budget,maxSteps})}/><BudgetInput label="最大工具数" value={budget.maxTools} disabled={busy} onChange={(maxTools)=>onBudgetChange({...budget,maxTools})}/><BudgetInput label="最大 Token 数" value={budget.maxTokens} disabled={busy} onChange={(maxTokens)=>onBudgetChange({...budget,maxTokens})}/><BudgetInput label="最大成本(USD)" value={budget.maxCostUsd} disabled={busy} onChange={(maxCostUsd)=>onBudgetChange({...budget,maxCostUsd})}/><BudgetInput label="超时(ms)" value={budget.timeoutMs} disabled={busy} onChange={(timeoutMs)=>onBudgetChange({...budget,timeoutMs})}/></div><button type="button" disabled={busy||goal.trim()===''} onClick={onStart}>运行模拟循环</button></section>
    <section className="p8-panel"><h2>运行记录</h2><div className="p8-table-wrap"><table className="p8-table"><thead><tr><th>运行</th><th>目标</th><th>状态</th><th>终止</th><th>用量</th><th /></tr></thead><tbody>{snapshot.runs.map((run)=><tr key={run.runId} data-selected={snapshot.selected?.runId===run.runId}><td><code>{run.runId}</code></td><td>{run.goal}</td><td>{run.status}</td><td>{run.terminationReason}</td><td>{run.usage.steps} 步 · {run.usage.toolCalls} 工具 · {run.usage.totalTokens} Token · ${run.usage.costUsd.toFixed(3)}</td><td><button type="button" disabled={busy} onClick={()=>onSelect(run.runId)}>查看</button></td></tr>)}</tbody></table></div></section>
    {snapshot.selected===undefined?null:<RunInspector run={snapshot.selected}/>} 
  </main>
}

function RunInspector({run}:{run:AgentLoopRun}){
  return <><section className="p8-summary-grid" aria-label="智能体循环摘要"><Metric label="终止" value={run.terminationReason}/><Metric label="步数" value={`${run.usage.steps}/${run.budget.maxSteps}`}/><Metric label="工具" value={`${run.usage.toolCalls}/${run.budget.maxTools}`}/><Metric label="Token" value={`${run.usage.totalTokens}/${run.budget.maxTokens}`}/><Metric label="成本" value={`$${run.usage.costUsd.toFixed(3)} / $${run.budget.maxCostUsd.toFixed(2)}`}/><Metric label="耗时" value={`${run.usage.elapsedMs}/${run.budget.timeoutMs} ms`}/><Metric label="用量完整" value={String(run.usage.complete)}/><Metric label="追踪" value={run.traceId}/></section><section className="p8-panel"><h2>Plan / Act / Verify / Replan / Terminate</h2><ol className="p8-loop-steps">{run.steps.map((step)=><li key={step.sequenceNo} data-phase={step.phase} data-status={step.status}><span>#{step.sequenceNo}</span><div><strong>{step.phase} · {step.title}</strong><p>{step.detail}</p><small>{step.toolName===undefined?'无工具':`${step.toolName}${step.toolCritical?' · CRITICAL':''}`} · {step.tokenUsage} Token · ${step.costUsd.toFixed(3)}{step.scopeInjectionBlocked?' · SCOPE BLOCKED':''}</small></div></li>)}</ol>{run.terminationReason==='CRITICAL_TOOL_CONFIRMATION_REQUIRED'?<p className="p8-warning"><strong>关键工具未执行。</strong> 显式变更确认必须通过 P4 变更中心完成。</p>:null}</section></>
}
function Metric({label,value}:{label:string;value:string}){return <article><strong>{value}</strong><span>{label}</span></article>}
function BudgetInput({label,value,disabled,onChange}:{label:string;value:number;disabled:boolean;onChange:(value:number)=>void}){return <label>{label}<input type="number" value={value} disabled={disabled} onChange={(event)=>onChange(Number(event.target.value))}/></label>}
function messageOf(reason:unknown):string{return reason instanceof Error?reason.message:String(reason)}
