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

  if(snapshot===undefined)return <main className="p8-page"><h1>Agent Loop</h1><p>{error??'Loading agent loop runs…'}</p></main>
  return <AgentLoopView snapshot={snapshot} goal={goal} scenario={scenario} budget={budget} busy={busy} error={error} onGoalChange={setGoal} onScenarioChange={setScenario} onBudgetChange={setBudget} onStart={()=>void start()} onSelect={(id)=>void select(id)} />
}

export function AgentLoopView({snapshot,goal,scenario,budget,busy,error,onGoalChange=()=>undefined,onScenarioChange=()=>undefined,onBudgetChange=()=>undefined,onStart=()=>undefined,onSelect=()=>undefined}:{
  snapshot:AgentLoopSnapshot;goal:string;scenario:NonNullable<StartAgentLoopRunRequest['scenario']>;budget:AgentLoopBudget;busy:boolean;error:string|null
  onGoalChange?:(value:string)=>void;onScenarioChange?:(value:NonNullable<StartAgentLoopRunRequest['scenario']>)=>void;onBudgetChange?:(value:AgentLoopBudget)=>void;onStart?:()=>void;onSelect?:(runId:string)=>void
}){
  return <main className="p8-page" aria-labelledby="agent-loop-title">
    <header className="p8-heading"><div><span>Industry Agent · P8</span><h1 id="agent-loop-title">Agent Loop Run Explorer</h1><p>Deterministic mock Plan → Act → Verify → Replan → Terminate runs with bounded steps, tools, tokens, cost, timeout, and termination reasons.</p></div><nav><a href="/industry/multimodal">Multimodal</a><a href="/industry/eval/agent-loop">Agent Loop Eval</a></nav></header>
    {error===null?null:<p role="alert" className="p8-error">{error}</p>}
    <section className="p8-panel"><h2>Start mock run</h2><label>Goal<textarea value={goal} disabled={busy} onChange={(event)=>onGoalChange(event.target.value)} /></label><label>Scenario<select value={scenario} disabled={busy} onChange={(event)=>onScenarioChange(event.target.value as NonNullable<StartAgentLoopRunRequest['scenario']>)}>{['SUCCESS','REPLAN','MAX_STEPS','MAX_TOOLS','TOKEN_COST','TIMEOUT','USAGE_INCOMPLETE','SCOPE_INJECTION','CRITICAL_TOOL'].map((item)=><option key={item}>{item}</option>)}</select></label><div className="p8-form-grid"><BudgetInput label="Max steps" value={budget.maxSteps} disabled={busy} onChange={(maxSteps)=>onBudgetChange({...budget,maxSteps})}/><BudgetInput label="Max tools" value={budget.maxTools} disabled={busy} onChange={(maxTools)=>onBudgetChange({...budget,maxTools})}/><BudgetInput label="Max tokens" value={budget.maxTokens} disabled={busy} onChange={(maxTokens)=>onBudgetChange({...budget,maxTokens})}/><BudgetInput label="Max cost USD" value={budget.maxCostUsd} disabled={busy} onChange={(maxCostUsd)=>onBudgetChange({...budget,maxCostUsd})}/><BudgetInput label="Timeout ms" value={budget.timeoutMs} disabled={busy} onChange={(timeoutMs)=>onBudgetChange({...budget,timeoutMs})}/></div><button type="button" disabled={busy||goal.trim()===''} onClick={onStart}>Run mock loop</button></section>
    <section className="p8-panel"><h2>Runs</h2><div className="p8-table-wrap"><table className="p8-table"><thead><tr><th>Run</th><th>Goal</th><th>Status</th><th>Termination</th><th>Usage</th><th /></tr></thead><tbody>{snapshot.runs.map((run)=><tr key={run.runId} data-selected={snapshot.selected?.runId===run.runId}><td><code>{run.runId}</code></td><td>{run.goal}</td><td>{run.status}</td><td>{run.terminationReason}</td><td>{run.usage.steps} steps · {run.usage.toolCalls} tools · {run.usage.totalTokens} tokens · ${run.usage.costUsd.toFixed(3)}</td><td><button type="button" disabled={busy} onClick={()=>onSelect(run.runId)}>Inspect</button></td></tr>)}</tbody></table></div></section>
    {snapshot.selected===undefined?null:<RunInspector run={snapshot.selected}/>} 
  </main>
}

function RunInspector({run}:{run:AgentLoopRun}){
  return <><section className="p8-summary-grid" aria-label="Agent loop summary"><Metric label="Termination" value={run.terminationReason}/><Metric label="Steps" value={`${run.usage.steps}/${run.budget.maxSteps}`}/><Metric label="Tools" value={`${run.usage.toolCalls}/${run.budget.maxTools}`}/><Metric label="Tokens" value={`${run.usage.totalTokens}/${run.budget.maxTokens}`}/><Metric label="Cost" value={`$${run.usage.costUsd.toFixed(3)} / $${run.budget.maxCostUsd.toFixed(2)}`}/><Metric label="Elapsed" value={`${run.usage.elapsedMs}/${run.budget.timeoutMs} ms`}/><Metric label="Usage complete" value={String(run.usage.complete)}/><Metric label="Trace" value={run.traceId}/></section><section className="p8-panel"><h2>Plan / Act / Verify / Replan / Terminate</h2><ol className="p8-loop-steps">{run.steps.map((step)=><li key={step.sequenceNo} data-phase={step.phase} data-status={step.status}><span>#{step.sequenceNo}</span><div><strong>{step.phase} · {step.title}</strong><p>{step.detail}</p><small>{step.toolName===undefined?'no tool':`${step.toolName}${step.toolCritical?' · CRITICAL':''}`} · {step.tokenUsage} tokens · ${step.costUsd.toFixed(3)}{step.scopeInjectionBlocked?' · SCOPE BLOCKED':''}</small></div></li>)}</ol>{run.terminationReason==='CRITICAL_TOOL_CONFIRMATION_REQUIRED'?<p className="p8-warning"><strong>Critical tool was not executed.</strong> Explicit mutation confirmation must happen through the P4 Mutation Center.</p>:null}</section></>
}
function Metric({label,value}:{label:string;value:string}){return <article><strong>{value}</strong><span>{label}</span></article>}
function BudgetInput({label,value,disabled,onChange}:{label:string;value:number;disabled:boolean;onChange:(value:number)=>void}){return <label>{label}<input type="number" value={value} disabled={disabled} onChange={(event)=>onChange(Number(event.target.value))}/></label>}
function messageOf(reason:unknown):string{return reason instanceof Error?reason.message:String(reason)}
