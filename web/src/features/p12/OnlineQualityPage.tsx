import { useEffect, useMemo, useState } from 'react'
import type {
  DatasetHealthSummary,
  EvalCaseDifficulty,
  OnlineDatasetVersion,
  OnlineFeedbackDomain,
  OnlineFeedbackItem,
  OnlineQualitySnapshot,
} from '../../../../shared/industry/eval/p12'
import { createP12ApiClient, type P12ApiClient } from '../../api/p12-client'
import './p12.css'

const defaultClient=createP12ApiClient()
export interface OnlineQualityWorkspaceSnapshot{online:OnlineQualitySnapshot;feedback:readonly OnlineFeedbackItem[];health:DatasetHealthSummary;versions:readonly OnlineDatasetVersion[];selectedFeedback?:OnlineFeedbackItem}

export function OnlineQualityPage({client=defaultClient,initialSnapshot}:{client?:P12ApiClient;initialSnapshot?:OnlineQualityWorkspaceSnapshot}){
  const[snapshot,setSnapshot]=useState<OnlineQualityWorkspaceSnapshot|undefined>(initialSnapshot)
  const[error,setError]=useState<string|null>(null)
  const[busy,setBusy]=useState(false)
  const[traceId,setTraceId]=useState('')
  const[domain,setDomain]=useState<OnlineFeedbackDomain>('INTENT')
  const[label,setLabel]=useState('')
  const[tags,setTags]=useState('online')
  const[difficulty,setDifficulty]=useState<EvalCaseDifficulty>('HARD')
  const[notes,setNotes]=useState('')
  const[reviewNote,setReviewNote]=useState('')
  useEffect(()=>{if(initialSnapshot!==undefined)return undefined;let cancelled=false;void load(client).then((value)=>{if(!cancelled)setSnapshot(value)}).catch((reason:unknown)=>{if(!cancelled)setError(messageOf(reason))});return()=>{cancelled=true}},[client,initialSnapshot])
  async function refresh(selected?:OnlineFeedbackItem){const[online,feedback,health,versions]=await Promise.all([client.getOnlineQuality(),client.listFeedback(),client.getDatasetHealth(),client.listDatasetVersions()]);setSnapshot({online,feedback,health,versions,selectedFeedback:selected??feedback.find((item)=>item.feedbackId===snapshot?.selectedFeedback?.feedbackId)??feedback[0]})}
  async function act(run:()=>Promise<OnlineFeedbackItem>){setBusy(true);setError(null);try{const item=await run();await refresh(item)}catch(reason){setError(messageOf(reason))}finally{setBusy(false)}}
  if(snapshot===undefined)return <main className="p12-page"><h1>Online Quality</h1><p>{error??'Loading online quality workspace…'}</p></main>
  return <OnlineQualityView snapshot={snapshot} error={error} busy={busy} traceId={traceId} domain={domain} label={label} tags={tags} difficulty={difficulty} notes={notes} reviewNote={reviewNote} onTraceId={setTraceId} onDomain={setDomain} onLabel={setLabel} onTags={setTags} onDifficulty={setDifficulty} onNotes={setNotes} onReviewNote={setReviewNote} onCreate={()=>void act(()=>client.createFeedbackFromTrace({traceId:traceId.trim(),targetDomain:domain}))} onSelect={(item)=>setSnapshot((value)=>value===undefined?value:{...value,selectedFeedback:item})} onDraft={(id)=>void act(()=>client.advanceToDraft(id))} onLabelAction={(id)=>void act(()=>client.labelFeedback(id,{label:label.trim(),tags:tags.split(',').map((item)=>item.trim()).filter(Boolean),difficulty,...(notes.trim()===''?{}:{notes:notes.trim()})}))} onReview={(id)=>void act(()=>client.reviewFeedback(id,{approved:true,...(reviewNote.trim()===''?{}:{reviewNote:reviewNote.trim()})}))} onVersion={(id)=>void act(()=>client.versionFeedback(id))}/>
}

export function OnlineQualityView({snapshot,error,busy,traceId,domain,label,tags,difficulty,notes,reviewNote,onTraceId=()=>undefined,onDomain=()=>undefined,onLabel=()=>undefined,onTags=()=>undefined,onDifficulty=()=>undefined,onNotes=()=>undefined,onReviewNote=()=>undefined,onCreate=()=>undefined,onSelect=()=>undefined,onDraft=()=>undefined,onLabelAction=()=>undefined,onReview=()=>undefined,onVersion=()=>undefined}:{snapshot:OnlineQualityWorkspaceSnapshot;error:string|null;busy:boolean;traceId:string;domain:OnlineFeedbackDomain;label:string;tags:string;difficulty:EvalCaseDifficulty;notes:string;reviewNote:string;onTraceId?:(value:string)=>void;onDomain?:(value:OnlineFeedbackDomain)=>void;onLabel?:(value:string)=>void;onTags?:(value:string)=>void;onDifficulty?:(value:EvalCaseDifficulty)=>void;onNotes?:(value:string)=>void;onReviewNote?:(value:string)=>void;onCreate?:()=>void;onSelect?:(item:OnlineFeedbackItem)=>void;onDraft?:(id:string)=>void;onLabelAction?:(id:string)=>void;onReview?:(id:string)=>void;onVersion?:(id:string)=>void}){
  const selected=snapshot.selectedFeedback??snapshot.feedback[0]
  const warningCount=useMemo(()=>snapshot.online.metrics.filter((item)=>item.status!=='PASS').length,[snapshot.online.metrics])
  return <main className="p12-page" aria-labelledby="quality-title">
    <div className="p12-eyebrow">Online Quality Feedback Loop · P12</div>
    <div className="p12-heading"><div><h1 id="quality-title">Online Quality</h1><p>Monitor production-quality signals, turn trusted traces into reviewed eval cases, and version curated datasets. Online samples never become Golden automatically.</p></div><div><strong>{snapshot.online.sampleCount}</strong> samples · <strong>{warningCount}</strong> signals above threshold</div></div>
    {error===null?null:<p className="p12-error" role="alert">{error}</p>}

    <section className="p12-panel"><h2>Online Dashboard</h2><p>{snapshot.online.windowStart} → {snapshot.online.windowEnd}</p><div className="p12-metric-grid">{snapshot.online.metrics.map((metric)=><article key={metric.metricId} data-status={metric.status}><span>{metric.label}</span><strong>{formatMetric(metric.value,metric.unit)}</strong><small>{metric.status} · Δ {formatDelta(metric.delta,metric.unit)} · warn {formatMetric(metric.warningThreshold,metric.unit)}</small></article>)}</div></section>

    <section className="p12-panel"><h2>Quality signals</h2><table className="p12-table"><thead><tr><th>Signal</th><th>Severity</th><th>Observed</th><th>Threshold</th><th>Trace evidence</th></tr></thead><tbody>{snapshot.online.signals.map((signal)=><tr key={signal.signalId}><td><strong>{signal.title}</strong><br/><span>{signal.detail}</span></td><td>{signal.severity}</td><td>{signal.observedValue}</td><td>{signal.threshold}</td><td>{signal.traceIds.map((id)=><a key={id} href={`/industry/traces/${encodeURIComponent(id)}`}><code>{id}</code></a>)}</td></tr>)}</tbody></table></section>

    <section className="p12-panel"><h2>Trace → Draft Eval</h2><p><code>Trace → sanitize → Draft Case → Human Label → Review → Dataset Version</code></p><div className="p12-form"><label>Trace ID<input value={traceId} disabled={busy} placeholder="trace-project-1-retrieval-001" onChange={(event)=>onTraceId(event.target.value)}/></label><label>Target domain<select value={domain} disabled={busy} onChange={(event)=>onDomain(event.target.value as OnlineFeedbackDomain)}>{(['INTENT','RETRIEVAL','RAG','TOOL','MUTATION','MEMORY'] as const).map((item)=><option key={item}>{item}</option>)}</select></label><button type="button" disabled={busy||traceId.trim()===''} onClick={onCreate}>Sanitize Trace</button></div><p className="p12-note">Only Basic Trace is read. Prompt/debug/audit content is excluded before draft creation.</p></section>

    <section className="p12-panel"><h2>Feedback queue</h2>{snapshot.feedback.length===0?<p>No online feedback items.</p>:<table className="p12-table"><thead><tr><th>Feedback</th><th>Trace</th><th>Domain</th><th>Stage</th><th>Sanitized input</th><th /></tr></thead><tbody>{snapshot.feedback.map((item)=><tr key={item.feedbackId} data-selected={selected?.feedbackId===item.feedbackId}><td><code>{item.feedbackId}</code></td><td><a href={`/industry/traces/${encodeURIComponent(item.traceId)}`}><code>{item.traceId}</code></a></td><td>{item.targetDomain}</td><td>{item.stage}</td><td>{item.sanitizedInput}</td><td><button type="button" onClick={()=>onSelect(item)}>Inspect</button></td></tr>)}</tbody></table>}</section>

    {selected===undefined?null:<section className="p12-panel"><div className="p12-heading"><div><h2>Feedback detail</h2><p><code>{selected.feedbackId}</code></p></div><strong>{selected.stage}</strong></div><dl className="p12-definition"><div><dt>Project</dt><dd>{selected.projectId}</dd></div><div><dt>Prompt removed</dt><dd>{String(selected.sanitization.removedPromptContent)}</dd></div><div><dt>Secret patterns removed</dt><dd>{selected.sanitization.removedSecretPatterns}</dd></div><div><dt>Trusted scope</dt><dd>{String(selected.sanitization.sourceScopeTrusted)}</dd></div></dl>
      {selected.stage==='SANITIZED'?<button type="button" disabled={busy} onClick={()=>onDraft(selected.feedbackId)}>Create Draft Case</button>:null}
      {selected.stage==='DRAFT'?<div className="p12-form"><label>Human label<input value={label} disabled={busy} onChange={(event)=>onLabel(event.target.value)}/></label><label>Tags<input value={tags} disabled={busy} onChange={(event)=>onTags(event.target.value)}/></label><label>Difficulty<select value={difficulty} disabled={busy} onChange={(event)=>onDifficulty(event.target.value as EvalCaseDifficulty)}><option>NORMAL</option><option>HARD</option><option>ADVERSARIAL</option></select></label><label>Notes<input value={notes} disabled={busy} onChange={(event)=>onNotes(event.target.value)}/></label><button type="button" disabled={busy||label.trim().length<2} onClick={()=>onLabelAction(selected.feedbackId)}>Save Human Label</button></div>:null}
      {selected.stage==='LABELED'?<div className="p12-form"><label>Review note<input value={reviewNote} disabled={busy} onChange={(event)=>onReviewNote(event.target.value)}/></label><button type="button" disabled={busy} onClick={()=>onReview(selected.feedbackId)}>Approve Review</button></div>:null}
      {selected.stage==='REVIEWED'?<button type="button" disabled={busy} onClick={()=>onVersion(selected.feedbackId)}>Create Dataset Version</button>:null}
      {selected.humanLabel===undefined?null:<p>Label: <strong>{selected.humanLabel.label}</strong> · {selected.humanLabel.difficulty} · tags {selected.humanLabel.tags.join(', ')}</p>}
      {selected.review===undefined?null:<p>Reviewed by {selected.review.reviewedBy} at {selected.review.reviewedAt}</p>}
      {selected.datasetVersion===undefined?null:<p>Dataset version: <strong>{selected.datasetVersion.version}</strong> · status {selected.datasetVersion.status} · Golden: <strong>{String(selected.datasetVersion.golden)}</strong></p>}
      <p className="p12-note">P12 has no Make Golden / Promote-to-Golden action. Versioned online cases remain reviewed datasets until a separate governed process changes them.</p>
    </section>}

    <section className="p12-panel"><h2>Dataset Health</h2><div className="p12-health-grid"><article><strong>{pct(snapshot.health.reviewedPercent)}</strong><span>Reviewed %</span></article><article><strong>{snapshot.health.hardAdversarialCount}</strong><span>Hard / adversarial</span></article><article><strong>{snapshot.health.duplicateCount}</strong><span>Duplicates</span></article><article><strong>{snapshot.health.nearDuplicateCount}</strong><span>Near duplicates</span></article><article><strong>{snapshot.health.holdoutLeakageCount}</strong><span>Holdout leakage</span></article><article><strong>{pct(snapshot.health.labelChurnRate)}</strong><span>Label churn</span></article><article><strong>{snapshot.health.lastReviewAgeDays}d</strong><span>Last review age</span></article></div><h3>Tag distribution</h3><div className="p12-tags">{snapshot.health.tagDistribution.map((item)=><span key={item.tag}>{item.tag} · {item.count}</span>)}</div><h3>Health issues</h3><ul>{snapshot.health.issues.map((issue)=><li key={issue.issueId}>{issue.severity} · {issue.type} · {issue.count} · {issue.detail}</li>)}</ul></section>

    <section className="p12-panel"><h2>Dataset Versions</h2>{snapshot.versions.length===0?<p>No reviewed online dataset versions yet.</p>:<table className="p12-table"><thead><tr><th>Dataset</th><th>Version</th><th>Status</th><th>Cases</th><th>Fingerprint</th><th>Golden</th></tr></thead><tbody>{snapshot.versions.map((version)=><tr key={`${version.datasetId}-${version.version}`}><td>{version.datasetId}</td><td>{version.version}</td><td>{version.status}</td><td>{version.caseCount}</td><td><code>{version.fingerprint.slice(0,20)}</code></td><td>{String(version.golden)}</td></tr>)}</tbody></table>}</section>
  </main>
}

async function load(client:P12ApiClient):Promise<OnlineQualityWorkspaceSnapshot>{const[online,feedback,health,versions]=await Promise.all([client.getOnlineQuality(),client.listFeedback(),client.getDatasetHealth(),client.listDatasetVersions()]);return{online,feedback,health,versions,selectedFeedback:feedback[0]}}
function formatMetric(value:number,unit:'RATE'|'MS'|'TOKENS'|'USD'):string{if(unit==='RATE')return pct(value);if(unit==='MS')return`${Math.round(value)} ms`;if(unit==='TOKENS')return`${Math.round(value)} tokens`;return`$${value.toFixed(3)}`}
function formatDelta(value:number,unit:'RATE'|'MS'|'TOKENS'|'USD'):string{return`${value>=0?'+':''}${formatMetric(value,unit)}`}
function pct(value:number):string{return`${(value*100).toFixed(1)}%`}
function messageOf(reason:unknown):string{return reason instanceof Error?reason.message:String(reason)}
