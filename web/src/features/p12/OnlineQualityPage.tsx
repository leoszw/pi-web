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
  if(snapshot===undefined)return <main className="p12-page"><h1>在线质量</h1><p>{error??'加载在线质量工作区…'}</p></main>
  return <OnlineQualityView snapshot={snapshot} error={error} busy={busy} traceId={traceId} domain={domain} label={label} tags={tags} difficulty={difficulty} notes={notes} reviewNote={reviewNote} onTraceId={setTraceId} onDomain={setDomain} onLabel={setLabel} onTags={setTags} onDifficulty={setDifficulty} onNotes={setNotes} onReviewNote={setReviewNote} onCreate={()=>void act(()=>client.createFeedbackFromTrace({traceId:traceId.trim(),targetDomain:domain}))} onSelect={(item)=>setSnapshot((value)=>value===undefined?value:{...value,selectedFeedback:item})} onDraft={(id)=>void act(()=>client.advanceToDraft(id))} onLabelAction={(id)=>void act(()=>client.labelFeedback(id,{label:label.trim(),tags:tags.split(',').map((item)=>item.trim()).filter(Boolean),difficulty,...(notes.trim()===''?{}:{notes:notes.trim()})}))} onReview={(id)=>void act(()=>client.reviewFeedback(id,{approved:true,...(reviewNote.trim()===''?{}:{reviewNote:reviewNote.trim()})}))} onVersion={(id)=>void act(()=>client.versionFeedback(id))}/>
}

export function OnlineQualityView({snapshot,error,busy,traceId,domain,label,tags,difficulty,notes,reviewNote,onTraceId=()=>undefined,onDomain=()=>undefined,onLabel=()=>undefined,onTags=()=>undefined,onDifficulty=()=>undefined,onNotes=()=>undefined,onReviewNote=()=>undefined,onCreate=()=>undefined,onSelect=()=>undefined,onDraft=()=>undefined,onLabelAction=()=>undefined,onReview=()=>undefined,onVersion=()=>undefined}:{snapshot:OnlineQualityWorkspaceSnapshot;error:string|null;busy:boolean;traceId:string;domain:OnlineFeedbackDomain;label:string;tags:string;difficulty:EvalCaseDifficulty;notes:string;reviewNote:string;onTraceId?:(value:string)=>void;onDomain?:(value:OnlineFeedbackDomain)=>void;onLabel?:(value:string)=>void;onTags?:(value:string)=>void;onDifficulty?:(value:EvalCaseDifficulty)=>void;onNotes?:(value:string)=>void;onReviewNote?:(value:string)=>void;onCreate?:()=>void;onSelect?:(item:OnlineFeedbackItem)=>void;onDraft?:(id:string)=>void;onLabelAction?:(id:string)=>void;onReview?:(id:string)=>void;onVersion?:(id:string)=>void}){
  const selected=snapshot.selectedFeedback??snapshot.feedback[0]
  const warningCount=useMemo(()=>snapshot.online.metrics.filter((item)=>item.status!=='PASS').length,[snapshot.online.metrics])
  return <main className="p12-page" aria-labelledby="quality-title">
    <div className="p12-eyebrow">在线质量反馈循环 · P12</div>
    <div className="p12-heading"><div><h1 id="quality-title">在线质量</h1><p>监控质量信号，将受信追踪转化为已评审的评测用例，并版本化精选数据集。在线样本永远不会自动变为 Golden。</p></div><div><strong>{snapshot.online.sampleCount}</strong> 个样本 · <strong>{warningCount}</strong> 条超阈值信号<br/><small>数据来源: {snapshot.online.source}</small></div></div>
    {error===null?null:<p className="p12-error" role="alert">{error}</p>}

    <section className="p12-panel"><h2>在线仪表盘</h2><p>{snapshot.online.windowStart} → {snapshot.online.windowEnd} · 来源 {snapshot.online.source}</p><div className="p12-metric-grid">{snapshot.online.metrics.map((metric)=><article key={metric.metricId} data-status={metric.status}><span>{metric.label}</span><strong>{formatMetric(metric.value,metric.unit)}</strong><small>{metric.status} · Δ {formatDelta(metric.delta,metric.unit)} · 告警 {formatMetric(metric.warningThreshold,metric.unit)}</small></article>)}</div></section>

    <section className="p12-panel"><h2>质量信号</h2><table className="p12-table"><thead><tr><th>信号</th><th>严重度</th><th>观测值</th><th>阈值</th><th>追踪证据</th></tr></thead><tbody>{snapshot.online.signals.map((signal)=><tr key={signal.signalId}><td><strong>{signal.title}</strong><br/><span>{signal.detail}</span></td><td>{signal.severity}</td><td>{signal.observedValue}</td><td>{signal.threshold}</td><td>{signal.traceIds.map((id)=><a key={id} href={`/industry/traces/${encodeURIComponent(id)}`}><code>{id}</code></a>)}</td></tr>)}</tbody></table></section>

    <section className="p12-panel"><h2>追踪 → 草稿评测</h2><p><code>追踪 → 净化 → 草稿用例 → 人工标注 → 评审 → 数据集版本</code></p><div className="p12-form"><label>追踪 ID<input value={traceId} disabled={busy} placeholder="trace-project-1-retrieval-001" onChange={(event)=>onTraceId(event.target.value)}/></label><label>目标领域<select value={domain} disabled={busy} onChange={(event)=>onDomain(event.target.value as OnlineFeedbackDomain)}>{(['INTENT','RETRIEVAL','RAG','TOOL','MUTATION','MEMORY'] as const).map((item)=><option key={item}>{item}</option>)}</select></label><button type="button" disabled={busy||traceId.trim()===''} onClick={onCreate}>净化追踪</button></div><p className="p12-note">仅读取基础追踪。在创建草稿前会排除 Prompt/调试/审计内容。</p></section>

    <section className="p12-panel"><h2>反馈队列</h2>{snapshot.feedback.length===0?<p>暂无在线反馈项。</p>:<table className="p12-table"><thead><tr><th>反馈</th><th>追踪</th><th>领域</th><th>阶段</th><th>净化后输入</th><th /></tr></thead><tbody>{snapshot.feedback.map((item)=><tr key={item.feedbackId} data-selected={selected?.feedbackId===item.feedbackId}><td><code>{item.feedbackId}</code></td><td><a href={`/industry/traces/${encodeURIComponent(item.traceId)}`}><code>{item.traceId}</code></a></td><td>{item.targetDomain}</td><td>{item.stage}</td><td>{item.sanitizedInput}</td><td><button type="button" onClick={()=>onSelect(item)}>查看</button></td></tr>)}</tbody></table>}</section>

    {selected===undefined?null:<section className="p12-panel"><div className="p12-heading"><div><h2>反馈详情</h2><p><code>{selected.feedbackId}</code></p></div><strong>{selected.stage}</strong></div><dl className="p12-definition"><div><dt>项目</dt><dd>{selected.projectId}</dd></div><div><dt>已移除 Prompt</dt><dd>{String(selected.sanitization.removedPromptContent)}</dd></div><div><dt>已移除密钥模式</dt><dd>{selected.sanitization.removedSecretPatterns}</dd></div><div><dt>受信范围</dt><dd>{String(selected.sanitization.sourceScopeTrusted)}</dd></div></dl>
      {selected.stage==='SANITIZED'?<button type="button" disabled={busy} onClick={()=>onDraft(selected.feedbackId)}>创建草稿用例</button>:null}
      {selected.stage==='DRAFT'?<div className="p12-form"><label>人工标注<input value={label} disabled={busy} onChange={(event)=>onLabel(event.target.value)}/></label><label>标签<input value={tags} disabled={busy} onChange={(event)=>onTags(event.target.value)}/></label><label>难度<select value={difficulty} disabled={busy} onChange={(event)=>onDifficulty(event.target.value as EvalCaseDifficulty)}><option>NORMAL</option><option>HARD</option><option>ADVERSARIAL</option></select></label><label>备注<input value={notes} disabled={busy} onChange={(event)=>onNotes(event.target.value)}/></label><button type="button" disabled={busy||label.trim().length<2} onClick={()=>onLabelAction(selected.feedbackId)}>保存人工标注</button></div>:null}
      {selected.stage==='LABELED'?<div className="p12-form"><label>评审备注<input value={reviewNote} disabled={busy} onChange={(event)=>onReviewNote(event.target.value)}/></label><button type="button" disabled={busy} onClick={()=>onReview(selected.feedbackId)}>批准评审</button></div>:null}
      {selected.stage==='REVIEWED'?<button type="button" disabled={busy} onClick={()=>onVersion(selected.feedbackId)}>创建数据集版本</button>:null}
      {selected.humanLabel===undefined?null:<p>标注: <strong>{selected.humanLabel.label}</strong> · {selected.humanLabel.difficulty} · 标签 {selected.humanLabel.tags.join(', ')}</p>}
      {selected.review===undefined?null:<p>由 {selected.review.reviewedBy} 于 {selected.review.reviewedAt} 评审</p>}
      {selected.datasetVersion===undefined?null:<p>数据集版本: <strong>{selected.datasetVersion.version}</strong> · 状态 {selected.datasetVersion.status} · Golden: <strong>{String(selected.datasetVersion.golden)}</strong></p>}
      <p className="p12-note">P12 没有 Make Golden / Promote-to-Golden 操作。版本化的在线用例在单独的治理流程变更前将保持为已评审数据集。</p>
    </section>}

    <section className="p12-panel"><h2>数据集健康</h2><p>数据来源: {snapshot.health.source}</p><div className="p12-health-grid"><article><strong>{pct(snapshot.health.reviewedPercent)}</strong><span>已评审 %</span></article><article><strong>{snapshot.health.hardAdversarialCount}</strong><span>困难 / 对抗</span></article><article><strong>{snapshot.health.duplicateCount}</strong><span>重复项</span></article><article><strong>{snapshot.health.nearDuplicateCount}</strong><span>近似重复项</span></article><article><strong>{snapshot.health.holdoutLeakageCount}</strong><span>留出集泄露</span></article><article><strong>{pct(snapshot.health.labelChurnRate)}</strong><span>标注变动</span></article><article><strong>{snapshot.health.lastReviewAgeDays}d</strong><span>上次评审距今</span></article></div><h3>标签分布</h3><div className="p12-tags">{snapshot.health.tagDistribution.map((item)=><span key={item.tag}>{item.tag} · {item.count}</span>)}</div><h3>健康问题</h3><ul>{snapshot.health.issues.map((issue)=><li key={issue.issueId}>{issue.severity} · {issue.type} · {issue.count} · {issue.detail}</li>)}</ul></section>

    <section className="p12-panel"><h2>数据集版本</h2>{snapshot.versions.length===0?<p>暂无已评审的在线数据集版本。</p>:<table className="p12-table"><thead><tr><th>数据集</th><th>版本</th><th>状态</th><th>用例</th><th>指纹</th><th>Golden</th></tr></thead><tbody>{snapshot.versions.map((version)=><tr key={`${version.datasetId}-${version.version}`}><td>{version.datasetId}</td><td>{version.version}</td><td>{version.status}</td><td>{version.caseCount}</td><td><code>{version.fingerprint.slice(0,20)}</code></td><td>{String(version.golden)}</td></tr>)}</tbody></table>}</section>
  </main>
}

async function load(client:P12ApiClient):Promise<OnlineQualityWorkspaceSnapshot>{const[online,feedback,health,versions]=await Promise.all([client.getOnlineQuality(),client.listFeedback(),client.getDatasetHealth(),client.listDatasetVersions()]);return{online,feedback,health,versions,selectedFeedback:feedback[0]}}
function formatMetric(value:number,unit:'RATE'|'MS'|'TOKENS'|'USD'):string{if(unit==='RATE')return pct(value);if(unit==='MS')return`${Math.round(value)} ms`;if(unit==='TOKENS')return`${Math.round(value)} tokens`;return`$${value.toFixed(3)}`}
function formatDelta(value:number,unit:'RATE'|'MS'|'TOKENS'|'USD'):string{return`${value>=0?'+':''}${formatMetric(value,unit)}`}
function pct(value:number):string{return`${(value*100).toFixed(1)}%`}
function messageOf(reason:unknown):string{return reason instanceof Error?reason.message:String(reason)}
