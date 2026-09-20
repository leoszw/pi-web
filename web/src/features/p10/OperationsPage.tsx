import { useEffect, useState } from 'react'
import type { OperationsReadiness } from '../../../../shared/industry/operations'
import { createP10ApiClient, type P10ApiClient } from '../../api/p10-client'
import './p10.css'

const defaultClient=createP10ApiClient()
export function OperationsPage({client=defaultClient,initialSnapshot}:{client?:P10ApiClient;initialSnapshot?:OperationsReadiness}){
  const[snapshot,setSnapshot]=useState<OperationsReadiness|undefined>(initialSnapshot)
  const[error,setError]=useState<string|null>(null)
  useEffect(()=>{if(initialSnapshot!==undefined)return undefined;let cancelled=false;void client.getOperationsReadiness().then((value)=>{if(!cancelled)setSnapshot(value)}).catch((reason:unknown)=>{if(!cancelled)setError(reason instanceof Error?reason.message:String(reason))});return()=>{cancelled=true}},[client,initialSnapshot])
  if(snapshot===undefined)return <main className="p10-page"><h1>运维</h1><p>{error??'正在加载运维就绪状态…'}</p></main>
  return <OperationsView snapshot={snapshot} error={error}/>
}

export function OperationsView({snapshot,error}:{snapshot:OperationsReadiness;error:string|null}){
  return <main className="p10-page" aria-labelledby="operations-title"><div className="p10-eyebrow">运维 · P10</div><div className="p10-heading-row"><div><h1 id="operations-title">运维</h1><p>仅为就绪状态证据。数据库与生产审批属于外部管控，无法在此页面授予。</p></div><strong data-readiness={snapshot.overall}>{snapshot.overall}</strong></div>{error===null?null:<p role="alert" className="p10-error">{error}</p>}<section className="p10-panel"><h2>就绪检查</h2><table className="p10-table"><thead><tr><th>检查</th><th>状态</th><th>详情</th><th>证据</th><th>已检查</th></tr></thead><tbody>{snapshot.checks.map((item)=><tr key={item.type} data-status={item.status}><td><strong>{item.label}</strong><br/><code>{item.type}</code></td><td>{item.status}</td><td>{item.detail}</td><td>{item.evidenceRef===undefined?'—':<code>{item.evidenceRef}</code>}</td><td>{item.checkedAt}</td></tr>)}</tbody></table></section><section className="p10-panel"><h2>审批边界</h2><p>数据库审批与生产审批仅为展示用的就绪信号。P10 中没有批准、强制通过、手动通过或提升控件。</p></section></main>
}
