import { useEffect, useState } from 'react'
import type {
  BaselineAcceptance,
  ReleaseWaiver,
  UnifiedBenchmarkRun,
  UnifiedCorpusManifest,
  UnifiedReleaseDecision,
  UnifiedRunComparison,
} from '../../../../shared/industry/eval/p11'
import { createP11ApiClient, type P11ApiClient } from '../../api/p11-client'
import './eval.css'

const defaultClient=createP11ApiClient()
export interface UnifiedBenchmarkSnapshot {
  manifest: UnifiedCorpusManifest
  runs: readonly UnifiedBenchmarkRun[]
  baseline: BaselineAcceptance|null
  waivers: readonly ReleaseWaiver[]
  selectedRun?: UnifiedBenchmarkRun
  decision?: UnifiedReleaseDecision
  comparison?: UnifiedRunComparison
}

export function UnifiedBenchmarkPage({client=defaultClient,initialSnapshot}:{client?:P11ApiClient;initialSnapshot?:UnifiedBenchmarkSnapshot}){
  const[snapshot,setSnapshot]=useState<UnifiedBenchmarkSnapshot|undefined>(initialSnapshot)
  const[variant,setVariant]=useState<'p11-guarded-v1'|'p11-broken-v0'>('p11-guarded-v1')
  const[waiverReason,setWaiverReason]=useState('外部验证完成前的临时已记录例外。')
  const[waiverExpiresAt,setWaiverExpiresAt]=useState(()=>new Date(Date.now()+24*60*60*1000).toISOString().slice(0,16))
  const[busy,setBusy]=useState(false)
  const[error,setError]=useState<string|null>(null)
  useEffect(()=>{if(initialSnapshot!==undefined)return undefined;let cancelled=false;void load(client).then((value)=>{if(!cancelled)setSnapshot(value)}).catch((reason:unknown)=>{if(!cancelled)setError(messageOf(reason))});return()=>{cancelled=true}},[client,initialSnapshot])
  async function refresh(selectedRunId?:string){const base=await baseSnapshot(client);const selected=base.runs.find((item)=>item.runId===selectedRunId)??base.runs.find((item)=>item.runId==='run-p11-candidate-v2')??base.runs[0];const decision=selected===undefined?undefined:await client.getDecision(selected.runId);const comparison=base.baseline===null||selected===undefined||base.baseline.runId===selected.runId?undefined:await client.compare(base.baseline.runId,selected.runId);setSnapshot({...base,selectedRun:selected,decision,comparison})}
  async function select(run:UnifiedBenchmarkRun){setBusy(true);setError(null);try{const decision=await client.getDecision(run.runId);const comparison=snapshot?.baseline===null||snapshot?.baseline===undefined||snapshot.baseline.runId===run.runId?undefined:await client.compare(snapshot.baseline.runId,run.runId);setSnapshot((value)=>value===undefined?value:{...value,selectedRun:run,decision,comparison})}catch(reason){setError(messageOf(reason))}finally{setBusy(false)}}
  async function start(){if(snapshot===undefined)return;setBusy(true);setError(null);try{const run=await client.startRun({corpusId:snapshot.manifest.corpusId,variantId:variant});await refresh(run.runId)}catch(reason){setError(messageOf(reason))}finally{setBusy(false)}}
  async function acceptBaseline(){const run=snapshot?.selectedRun;if(run===undefined)return;setBusy(true);setError(null);try{await client.acceptBaseline(run.runId);await refresh(run.runId)}catch(reason){setError(messageOf(reason))}finally{setBusy(false)}}
  async function createWaiver(){const run=snapshot?.selectedRun;if(run===undefined||!validLocalDateTime(waiverExpiresAt))return;setBusy(true);setError(null);try{await client.createWaiver(run.runId,{reason:waiverReason,expiresAt:new Date(waiverExpiresAt).toISOString()});await refresh(run.runId)}catch(reason){setError(messageOf(reason))}finally{setBusy(false)}}
  if(snapshot===undefined)return <main className="eval-page"><h1>统一基准评测</h1><p>{error??'正在加载统一基准评测…'}</p></main>
  return <UnifiedBenchmarkView snapshot={snapshot} variant={variant} waiverReason={waiverReason} waiverExpiresAt={waiverExpiresAt} busy={busy} error={error} onVariant={setVariant} onWaiverReason={setWaiverReason} onWaiverExpiresAt={setWaiverExpiresAt} onStart={()=>void start()} onSelect={(run)=>void select(run)} onAcceptBaseline={()=>void acceptBaseline()} onCreateWaiver={()=>void createWaiver()}/>
}

export function UnifiedBenchmarkView({snapshot,variant,waiverReason,waiverExpiresAt,busy,error,onVariant=()=>undefined,onWaiverReason=()=>undefined,onWaiverExpiresAt=()=>undefined,onStart=()=>undefined,onSelect=()=>undefined,onAcceptBaseline=()=>undefined,onCreateWaiver=()=>undefined}:{snapshot:UnifiedBenchmarkSnapshot;variant:'p11-guarded-v1'|'p11-broken-v0';waiverReason:string;waiverExpiresAt:string;busy:boolean;error:string|null;onVariant?:(value:'p11-guarded-v1'|'p11-broken-v0')=>void;onWaiverReason?:(value:string)=>void;onWaiverExpiresAt?:(value:string)=>void;onStart?:()=>void;onSelect?:(run:UnifiedBenchmarkRun)=>void;onAcceptBaseline?:()=>void;onCreateWaiver?:()=>void}){
  const run=snapshot.selectedRun??snapshot.runs[0]
  const decision=snapshot.decision
  const activeWaiver=decision?.waiver
  return <main className="eval-page" aria-labelledby="p11-title">
    <div className="eval-eyebrow">统一基准评测 / 发布门禁 · P11</div>
    <div className="eval-heading-row"><div><h1 id="p11-title">统一基准评测</h1><p>Phase 11 语料、显式基线接受、对比证据，以及来自已配置评测适配器的发布门禁证据。浏览器不会计算或覆盖门禁状态。</p></div><div><strong>{snapshot.manifest.totalCaseCount}</strong> 用例 · <code>{snapshot.manifest.version}</code></div></div>
    {error===null?null:<p role="alert">{error}</p>}

    <section className="eval-panel"><h2>语料清单</h2><div className="eval-summary-grid"><article><strong>{snapshot.manifest.totalCaseCount}</strong><span>金标准 / 困难</span></article><article><strong>{snapshot.manifest.goldenCount}</strong><span>金标准</span></article><article><strong>{snapshot.manifest.hardCount}</strong><span>困难</span></article><article><strong>{snapshot.manifest.criticalCaseCount}</strong><span>关键 E2E</span></article></div><p>状态: <strong>{snapshot.manifest.status}</strong> · 需要完全覆盖: <strong>{snapshot.manifest.fullCoverageRequired?'是':'否'}</strong> · 来源: <code>{snapshot.manifest.source}</code></p><p>指纹: <code>{snapshot.manifest.fingerprint}</code></p><table className="eval-table"><thead><tr><th>领域</th><th>用例</th></tr></thead><tbody>{snapshot.manifest.domainCounts.map((item)=><tr key={item.domain}><td>{item.domain}</td><td>{item.caseCount}</td></tr>)}</tbody></table></section>

    <section className="eval-panel"><div className="eval-heading-row"><div><h2>基准运行</h2><p>受保护运行代表完整/可复现的发布证据；破损运行演练失败关闭路径。</p></div><div><select aria-label="基准配置" value={variant} disabled={busy} onChange={(event)=>onVariant(event.target.value as 'p11-guarded-v1'|'p11-broken-v0')}><option value="p11-guarded-v1">p11-guarded-v1</option><option value="p11-broken-v0">p11-broken-v0</option></select> <button type="button" disabled={busy} onClick={onStart}>运行统一基准评测</button></div></div><table className="eval-table"><thead><tr><th>运行</th><th>覆盖率</th><th>关键 E2E</th><th>门禁</th><th>可复现</th><th>基线</th><th /></tr></thead><tbody>{snapshot.runs.map((item)=><tr key={item.runId} data-selected={run?.runId===item.runId}><td><code>{item.runId}</code></td><td>{(item.coverageRate*100).toFixed(1)}% ({item.coveredCaseCount}/1030)</td><td>{item.criticalE2E.passed?'PASS':'FAIL'} · {item.criticalE2E.passedCount}/{item.criticalE2E.total}</td><td><strong>{item.releaseGate.status}</strong> · 来源 {item.releaseGate.source}</td><td>{item.reproducibility.complete?'完整':'不完整'}</td><td>{snapshot.baseline?.runId===item.runId?'已接受':'—'}</td><td><button type="button" disabled={busy} onClick={()=>onSelect(item)}>查看</button></td></tr>)}</tbody></table></section>

    {run===undefined?null:<section className="eval-panel"><div className="eval-heading-row"><div><h2>发布门禁</h2><p><code>{run.runId}</code></p></div><strong>{decision?.releaseDisposition??run.releaseGate.status}</strong></div><p>{run.releaseGate.source==='PI'?'PI 门禁':'模拟 PI 门禁'}: <strong>{run.releaseGate.status}</strong> · 来源 <strong>{run.releaseGate.source}</strong> · 规则 <code>{run.releaseGate.ruleVersion}</code></p>{run.releaseGate.reasons.length===0?<p>无门禁失败项。</p>:<ul>{run.releaseGate.reasons.map((reason)=><li key={reason}>{reason}</li>)}</ul>}<p>覆盖率: {run.coveredCaseCount}/1030 · 数据集已评审: {run.datasetReviewed?'是':'否'} · 关键 E2E: {run.criticalE2E.passed?'PASS':'FAIL'} · 可复现性: {run.reproducibility.complete?'完整':'不完整'}</p>{run.reproducibility.missing.length===0?null:<p>缺失可复现性: {run.reproducibility.missing.join(', ')}</p>}<p>基线合格: <strong>{decision?.baselineEligible?'YES':'NO'}</strong></p>{decision?.baselineBlockReasons.length?<ul>{decision.baselineBlockReasons.map((reason)=><li key={reason}>{reason}</li>)}</ul>:null}{decision?.baselineEligible&&snapshot.baseline?.runId!==run.runId?<button type="button" disabled={busy} onClick={onAcceptBaseline}>显式接受为基线</button>:null}<p><strong>无手动通过。</strong>UI 无法变更适配器拥有的门禁。豁免是一条单独的例外记录，原始门禁仍为未通过。</p><h3>指标</h3><table className="eval-table"><thead><tr><th>指标</th><th>值</th><th>回归阈值</th><th>关键</th></tr></thead><tbody>{run.metrics.map((item)=><tr key={item.metricId}><td>{item.label}<br/><code>{item.metricId}</code></td><td>{item.value.toFixed(4)}</td><td>{item.regressionThreshold.toFixed(4)}</td><td>{item.critical?'是':'否'}</td></tr>)}</tbody></table></section>}

    {run?.releaseGate.status==='FAIL'&&activeWaiver===undefined?<section className="eval-panel"><h2>创建豁免</h2><p>豁免不会变更门禁=未通过，也无法使本次运行基线合格。</p><label>原因<textarea value={waiverReason} disabled={busy} onChange={(event)=>onWaiverReason(event.target.value)}/></label><label>过期时间<input type="datetime-local" value={waiverExpiresAt} disabled={busy} onChange={(event)=>onWaiverExpiresAt(event.target.value)}/></label><button type="button" disabled={busy||waiverReason.trim().length<20||!validLocalDateTime(waiverExpiresAt)} onClick={onCreateWaiver}>创建单独豁免</button></section>:null}

    <section className="eval-panel"><h2>当前基线</h2>{snapshot.baseline===null?<p>未接受基线。</p>:<p><code>{snapshot.baseline.runId}</code> · 显式={String(snapshot.baseline.explicit)} · 由 {snapshot.baseline.acceptedBy} 接受 · {snapshot.baseline.acceptedAt}</p>}</section>

    {snapshot.comparison===undefined?null:<section className="eval-panel"><h2>对比</h2><p><code>{snapshot.comparison.baselineRunId}</code> → <code>{snapshot.comparison.candidateRunId}</code></p><h3>指标增量 / 阈值</h3><table className="eval-table"><thead><tr><th>指标</th><th>基线</th><th>候选</th><th>增量</th><th>阈值</th><th>回归</th></tr></thead><tbody>{snapshot.comparison.metricDeltas.map((item)=><tr key={item.metricId}><td>{item.label}</td><td>{item.baseline.toFixed(4)}</td><td>{item.candidate.toFixed(4)}</td><td>{item.delta.toFixed(4)}</td><td>{item.regressionThreshold.toFixed(4)}</td><td>{item.regressed?'YES':'NO'}</td></tr>)}</tbody></table><h3>改善 / 退化用例</h3><ul>{snapshot.comparison.caseMovements.map((item)=><li key={item.caseId}><strong>{item.movement}</strong> · {item.domain} · {item.caseId} · {item.title} · {item.baselineScore}→{item.candidateScore}</li>)}</ul><h3>版本差异</h3><ul>{snapshot.comparison.versionDiff.map((item)=><li key={item.component}>{item.component}: <code>{item.before}</code> → <code>{item.after}</code> · 已变更={String(item.changed)}</li>)}</ul><h3>排名变动</h3><ul>{snapshot.comparison.rankMovements.map((item)=><li key={`${item.caseId}-${item.entityId}`}>{item.caseId} · 实体 <code>{item.entityId}</code> · 排名 {item.beforeRank}→{item.afterRank} · Δ {item.delta}</li>)}</ul><h3>统计置信区间</h3><p>{snapshot.comparison.statisticalCI.method} · 95% 置信区间 [{snapshot.comparison.statisticalCI.lower.toFixed(4)}, {snapshot.comparison.statisticalCI.upper.toFixed(4)}] · n={snapshot.comparison.statisticalCI.sampleCount} · {snapshot.comparison.statisticalCI.conclusive?'CONCLUSIVE':'INCONCLUSIVE'}</p></section>}

    <section className="eval-panel"><h2>豁免</h2>{snapshot.waivers.length===0?<p>无豁免。</p>:<table className="eval-table"><thead><tr><th>运行</th><th>状态</th><th>原始门禁</th><th>处置</th><th>原因</th><th>过期时间</th></tr></thead><tbody>{snapshot.waivers.map((item)=><tr key={item.waiverId}><td><code>{item.runId}</code></td><td>{item.status}</td><td>{item.originalGate}</td><td>{item.releaseDisposition}</td><td>{item.reason}</td><td>{item.expiresAt}</td></tr>)}</tbody></table>}</section>
  </main>
}

async function baseSnapshot(client:P11ApiClient){const[manifest,runs,baseline,waivers]=await Promise.all([client.getCorpus(),client.listRuns(),client.getBaseline(),client.listWaivers()]);return{manifest,runs,baseline,waivers}}
async function load(client:P11ApiClient):Promise<UnifiedBenchmarkSnapshot>{const base=await baseSnapshot(client);const selected=base.runs.find((item)=>item.runId==='run-p11-candidate-v2')??base.runs[0];const decision=selected===undefined?undefined:await client.getDecision(selected.runId);const comparison=base.baseline===null||selected===undefined||base.baseline.runId===selected.runId?undefined:await client.compare(base.baseline.runId,selected.runId);return{...base,selectedRun:selected,decision,comparison}}
function validLocalDateTime(value:string):boolean{return value.trim()!==''&&Number.isFinite(Date.parse(value))}
function messageOf(reason:unknown):string{return reason instanceof Error?reason.message:String(reason)}
