import { useEffect, useState } from 'react'
import type { SandboxBudget, SandboxRun, SandboxScenario } from '../../../../shared/industry/sandbox'
import { createP9ApiClient, type P9ApiClient } from '../../api/p9-client'
import './p9.css'

const defaultClient=createP9ApiClient()
const defaultBudget:SandboxBudget={maxRows:100,maxBytes:64000,timeoutMs:5000}
export interface SandboxSnapshot{runs:readonly SandboxRun[];selected?:SandboxRun}

export function SandboxPage({client=defaultClient,initialSnapshot}:{client?:P9ApiClient;initialSnapshot?:SandboxSnapshot}){
  const[snapshot,setSnapshot]=useState<SandboxSnapshot|undefined>(initialSnapshot);const[goal,setGoal]=useState('统计当前项目未完成工程部位');const[scenario,setScenario]=useState<SandboxScenario>('SAFE_READ');const[budget,setBudget]=useState<SandboxBudget>(defaultBudget);const[busy,setBusy]=useState(false);const[error,setError]=useState<string|null>(null)
  useEffect(()=>{if(initialSnapshot!==undefined)return undefined;let cancelled=false;void client.listSandboxRuns().then((runs)=>{if(!cancelled)setSnapshot({runs,selected:runs[0]})}).catch((reason:unknown)=>{if(!cancelled)setError(messageOf(reason))});return()=>{cancelled=true}},[client,initialSnapshot])
  async function start():Promise<void>{setBusy(true);setError(null);try{const selected=await client.startSandboxRun({goal,budget,scenario});const runs=await client.listSandboxRuns();setSnapshot({runs,selected})}catch(reason){setError(messageOf(reason))}finally{setBusy(false)}}
  async function select(runId:string):Promise<void>{setBusy(true);setError(null);try{const selected=await client.getSandboxRun(runId);setSnapshot((value)=>value===undefined?value:{...value,selected})}catch(reason){setError(messageOf(reason))}finally{setBusy(false)}}
  if(snapshot===undefined)return <main className="p9-page"><h1>Sandbox</h1><p>{error??'Loading sandbox runs…'}</p></main>
  return <SandboxView snapshot={snapshot} goal={goal} scenario={scenario} budget={budget} busy={busy} error={error} onGoalChange={setGoal} onScenarioChange={setScenario} onBudgetChange={setBudget} onStart={()=>void start()} onSelect={(id)=>void select(id)}/>
}

export function SandboxView({snapshot,goal,scenario,budget,busy,error,onGoalChange=()=>undefined,onScenarioChange=()=>undefined,onBudgetChange=()=>undefined,onStart=()=>undefined,onSelect=()=>undefined}:{snapshot:SandboxSnapshot;goal:string;scenario:SandboxScenario;budget:SandboxBudget;busy:boolean;error:string|null;onGoalChange?:(value:string)=>void;onScenarioChange?:(value:SandboxScenario)=>void;onBudgetChange?:(value:SandboxBudget)=>void;onStart?:()=>void;onSelect?:(id:string)=>void}){
  const run=snapshot.selected
  return <main className="p9-page"><div className="p9-eyebrow">P9 · Sandbox</div><div className="p9-heading"><div><h1>Sandbox</h1><p>Goal-driven, read-only mock sandbox. There is deliberately no arbitrary SQL or Python console.</p></div><a href="/industry/eval/sandbox">Sandbox Eval</a></div>{error===null?null:<p role="alert">{error}</p>}
    <section className="p9-panel"><h2>Start run</h2><label>Goal<textarea aria-label="Sandbox goal" value={goal} onChange={(event)=>onGoalChange(event.target.value)}/></label><label>Mock scenario<select aria-label="Sandbox scenario" value={scenario} onChange={(event)=>onScenarioChange(event.target.value as SandboxScenario)}>{['SAFE_READ','WRITE_SQL','SELECT_STAR','LOAD_FILE','SYSTEM_SCHEMA','PYTHON_IMPORT_OPEN_NETWORK_PROCESS','DYNAMIC_QUERY_ID','ATTESTATION','PAYLOAD_BUDGET'].map((item)=><option key={item} value={item}>{item}</option>)}</select></label><div className="p9-budget"><label>Max rows<input type="number" value={budget.maxRows} onChange={(event)=>onBudgetChange({...budget,maxRows:Number(event.target.value)})}/></label><label>Max bytes<input type="number" value={budget.maxBytes} onChange={(event)=>onBudgetChange({...budget,maxBytes:Number(event.target.value)})}/></label><label>Timeout ms<input type="number" value={budget.timeoutMs} onChange={(event)=>onBudgetChange({...budget,timeoutMs:Number(event.target.value)})}/></label></div><button type="button" disabled={busy||goal.trim()===''} onClick={onStart}>Run bounded sandbox</button><p className="p9-note">The browser never submits SQL, Python source, queryId, projectId, tenantId, or userId.</p></section>
    <section className="p9-panel"><h2>Runs</h2><table><thead><tr><th>Run</th><th>Scenario</th><th>Status</th><th>Termination</th><th /></tr></thead><tbody>{snapshot.runs.map((item)=><tr key={item.runId}><td><code>{item.runId}</code></td><td>{item.scenario}</td><td>{item.status}</td><td>{item.terminationReason}</td><td><button type="button" disabled={busy} onClick={()=>onSelect(item.runId)}>Inspect</button></td></tr>)}</tbody></table></section>
    {run===undefined?null:<><section className="p9-panel"><h2>Goal / Schema / SQL</h2><p>{run.goal}</p><h3>Schema</h3><pre>{JSON.stringify(run.schema,null,2)}</pre><h3>Generated SQL</h3><pre>{run.generatedSql}</pre><h3>Validation</h3><ul>{run.validation.map((item)=><li key={item.code} data-block={item.severity==='BLOCK'}><strong>{item.severity}</strong> · {item.code} · {item.message}</li>)}</ul><h3>queryId</h3><code>{run.queryId??'BLOCKED BEFORE QUERY'}</code></section>
    <section className="p9-panel"><h2>Broker policies</h2><dl className="p9-grid">{run.brokerPolicies.map((item)=><div key={item.policy}><dt>{item.policy}</dt><dd>{item.value}</dd></div>)}</dl></section>
    <section className="p9-panel"><h2>Python source / hash</h2><pre>{run.pythonSource}</pre><code>{run.pythonHash}</code><h3>Runtime attestation</h3><pre>{JSON.stringify(run.runtimeAttestation,null,2)}</pre></section>
    <section className="p9-panel"><h2>Output</h2><p>{run.output.rowCount} rows · {run.output.bytes} bytes</p><pre>{JSON.stringify(run.output.rows,null,2)}</pre></section>
    <section className="p9-panel"><h2>Lineage</h2><ol>{run.lineage.map((node)=><li key={node.nodeId}><strong>{node.type}</strong> · {node.label} ← {node.parentIds.length===0?'root':node.parentIds.join(', ')}</li>)}</ol><p>Trace: <code>{run.traceId}</code></p></section></>}
  </main>
}
function messageOf(reason:unknown):string{return reason instanceof Error?reason.message:String(reason)}
