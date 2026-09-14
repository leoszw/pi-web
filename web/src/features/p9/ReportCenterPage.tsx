import { useEffect, useState } from 'react'
import type { ReportArtifact, ReportDownloadGrant } from '../../../../shared/industry/report'
import { createP9ApiClient, type P9ApiClient } from '../../api/p9-client'
import './p9.css'

const defaultClient=createP9ApiClient()
export interface ReportCenterSnapshot{reports:readonly ReportArtifact[];selected?:ReportArtifact;downloadGrant?:ReportDownloadGrant}

export function ReportCenterPage({client=defaultClient,initialSnapshot}:{client?:P9ApiClient;initialSnapshot?:ReportCenterSnapshot}){
  const[snapshot,setSnapshot]=useState<ReportCenterSnapshot|undefined>(initialSnapshot);const[busy,setBusy]=useState(false);const[error,setError]=useState<string|null>(null)
  useEffect(()=>{if(initialSnapshot!==undefined)return undefined;let cancelled=false;void client.listReports().then((reports)=>{if(!cancelled)setSnapshot({reports,selected:reports[0]})}).catch((reason:unknown)=>{if(!cancelled)setError(messageOf(reason))});return()=>{cancelled=true}},[client,initialSnapshot])
  async function select(reportId:string):Promise<void>{setBusy(true);setError(null);try{const selected=await client.getReport(reportId);setSnapshot((value)=>value===undefined?value:{...value,selected,downloadGrant:undefined})}catch(reason){setError(messageOf(reason))}finally{setBusy(false)}}
  async function authorizeDownload():Promise<void>{if(snapshot?.selected===undefined)return;setBusy(true);setError(null);try{const downloadGrant=await client.requestReportDownload(snapshot.selected.reportId);setSnapshot((value)=>value===undefined?value:{...value,downloadGrant})}catch(reason){setError(messageOf(reason))}finally{setBusy(false)}}
  if(snapshot===undefined)return <main className="p9-page"><h1>Report Center</h1><p>{error??'Loading reports…'}</p></main>
  return <ReportCenterView snapshot={snapshot} busy={busy} error={error} onSelect={(id)=>void select(id)} onAuthorizeDownload={()=>void authorizeDownload()}/>
}

export function ReportCenterView({snapshot,busy,error,onSelect=()=>undefined,onAuthorizeDownload=()=>undefined}:{snapshot:ReportCenterSnapshot;busy:boolean;error:string|null;onSelect?:(id:string)=>void;onAuthorizeDownload?:()=>void}){
  const report=snapshot.selected
  return <main className="p9-page"><div className="p9-eyebrow">P9 · Report Center</div><div className="p9-heading"><div><h1>Report Center</h1><p>Preview, metadata, evidence, lineage, and authorized download. Mock artifacts only; no filesystem path is exposed.</p></div><a href="/industry/eval/report">Report Eval</a></div>{error===null?null:<p role="alert">{error}</p>}
    <section className="p9-panel"><h2>Reports</h2><table><thead><tr><th>Title</th><th>Format</th><th>Size</th><th>Status</th><th /></tr></thead><tbody>{snapshot.reports.map((item)=><tr key={item.reportId}><td>{item.title}<br/><code>{item.reportId}</code></td><td>{item.format}</td><td>{item.sizeBytes.toLocaleString()} B</td><td>{item.status}</td><td><button type="button" disabled={busy} onClick={()=>onSelect(item.reportId)}>Inspect</button></td></tr>)}</tbody></table></section>
    {report===undefined?null:<><section className="p9-panel"><div className="p9-heading"><div><h2>{report.title}</h2><p><code>{report.fileName}</code> · {report.mimeType}</p></div><button type="button" disabled={busy||report.status!=='READY'} onClick={onAuthorizeDownload}>Request authorized download</button></div><h3>Preview</h3><p className="p9-preview">{report.preview}</p><dl className="p9-grid">{Object.entries(report.metadata).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>{snapshot.downloadGrant===undefined?null:<div className="p9-grant" data-download-authorized="true"><strong>Authorized grant created</strong><p>Expires {snapshot.downloadGrant.expiresAt}</p><code>{snapshot.downloadGrant.artifactRef}</code><p>Content-Disposition: {snapshot.downloadGrant.contentDisposition}</p></div>}</section>
    <section className="p9-panel"><h2>Evidence</h2><table><thead><tr><th>Label</th><th>Source</th><th>Ref</th><th>Covered</th></tr></thead><tbody>{report.evidence.map((item)=><tr key={item.evidenceId}><td>{item.label}</td><td>{item.sourceType}</td><td><code>{item.sourceRef}</code></td><td>{item.covered?'YES':'NO'}</td></tr>)}</tbody></table></section>
    <section className="p9-panel"><h2>Lineage</h2><ol>{report.lineage.map((node)=><li key={node.nodeId}><strong>{node.type}</strong> · {node.label} <span>← {node.parentIds.length===0?'root':node.parentIds.join(', ')}</span></li>)}</ol></section>
    <section className="p9-panel"><h2>Security summary</h2><div className="p9-security">{Object.entries(report.security).map(([key,value])=><span key={key} data-safe={value}>{key}: {String(value)}</span>)}</div></section></>}
  </main>
}
function messageOf(reason:unknown):string{return reason instanceof Error?reason.message:String(reason)}
