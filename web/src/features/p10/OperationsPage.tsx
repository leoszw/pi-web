import { useEffect, useState } from 'react'
import type { OperationsReadiness } from '../../../../shared/industry/operations'
import { createP10ApiClient, type P10ApiClient } from '../../api/p10-client'
import './p10.css'

const defaultClient=createP10ApiClient()
export function OperationsPage({client=defaultClient,initialSnapshot}:{client?:P10ApiClient;initialSnapshot?:OperationsReadiness}){
  const[snapshot,setSnapshot]=useState<OperationsReadiness|undefined>(initialSnapshot)
  const[error,setError]=useState<string|null>(null)
  useEffect(()=>{if(initialSnapshot!==undefined)return undefined;let cancelled=false;void client.getOperationsReadiness().then((value)=>{if(!cancelled)setSnapshot(value)}).catch((reason:unknown)=>{if(!cancelled)setError(reason instanceof Error?reason.message:String(reason))});return()=>{cancelled=true}},[client,initialSnapshot])
  if(snapshot===undefined)return <main className="p10-page"><h1>Operations</h1><p>{error??'Loading operations readiness…'}</p></main>
  return <OperationsView snapshot={snapshot} error={error}/>
}

export function OperationsView({snapshot,error}:{snapshot:OperationsReadiness;error:string|null}){
  return <main className="p10-page" aria-labelledby="operations-title"><div className="p10-eyebrow">Operations · P10</div><div className="p10-heading-row"><div><h1 id="operations-title">Operations</h1><p>Readiness evidence only. DB and production approvals are external controls and cannot be granted from this page.</p></div><strong data-readiness={snapshot.overall}>{snapshot.overall}</strong></div>{error===null?null:<p role="alert" className="p10-error">{error}</p>}<section className="p10-panel"><h2>Readiness checks</h2><table className="p10-table"><thead><tr><th>Check</th><th>Status</th><th>Detail</th><th>Evidence</th><th>Checked</th></tr></thead><tbody>{snapshot.checks.map((item)=><tr key={item.type} data-status={item.status}><td><strong>{item.label}</strong><br/><code>{item.type}</code></td><td>{item.status}</td><td>{item.detail}</td><td>{item.evidenceRef===undefined?'—':<code>{item.evidenceRef}</code>}</td><td>{item.checkedAt}</td></tr>)}</tbody></table></section><section className="p10-panel"><h2>Approval boundary</h2><p>DB approval and production approval are display-only readiness signals. There are no Approve, Force Pass, Manual PASS, or Promote controls in P10.</p></section></main>
}
