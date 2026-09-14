import { useEffect, useState } from 'react'
import type { TraceDetail, TraceStats, TraceSummary, TraceTimelineEvent, TraceTree, TraceTreeNode } from '../../../../shared/industry/trace'
import { createIndustryTraceApiClient, type IndustryTraceApiClient } from '../../api/trace-client'
import { retrievalDebugPath } from '../../app/routes'
import { TraceAddToEvalDraft } from './TraceAddToEvalDraft'
import { maskTraceText, maskedJson } from './trace-redaction'
import './trace.css'

const defaultClient = createIndustryTraceApiClient()
export interface TracePageSnapshot { traces: readonly TraceSummary[]; detail?: TraceDetail; timeline?: readonly TraceTimelineEvent[]; tree?: TraceTree; stats?: TraceStats }
type TraceTab = 'overview' | 'timeline' | 'tree' | 'raw'

export function TracePage({ traceId, client = defaultClient, initialSnapshot }: { traceId?: string; client?: IndustryTraceApiClient; initialSnapshot?: TracePageSnapshot }) {
  const [snapshot, setSnapshot] = useState<TracePageSnapshot | undefined>(initialSnapshot)
  const [tab, setTab] = useState<TraceTab>('overview')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void loadSnapshot(client, traceId).then((value) => { if (!cancelled) setSnapshot(value) }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { cancelled = true }
  }, [client, initialSnapshot, traceId])
  if (error !== null) return <main className="trace-page"><h1>Trace</h1><p role="alert">{error}</p></main>
  if (snapshot === undefined) return <main className="trace-page"><h1>Trace</h1><p>Loading trace data…</p></main>
  return <TracePageView snapshot={snapshot} traceId={traceId} tab={tab} onTabChange={setTab} />
}

export function TracePageView({ snapshot, traceId, tab, onTabChange = () => undefined }: { snapshot: TracePageSnapshot; traceId?: string; tab: TraceTab; onTabChange?: (tab: TraceTab) => void }) {
  if (traceId === undefined) return <TraceList traces={snapshot.traces} />
  const detail = snapshot.detail
  if (detail === undefined) return <main className="trace-page"><h1>Trace</h1><p>Trace detail is unavailable.</p></main>
  return <main className="trace-page" aria-labelledby="trace-title">
    <header className="trace-heading">
      <div><span>Industry Agent · P7</span><h1 id="trace-title">{detail.summary.name}</h1><p><code>{detail.summary.traceId}</code> · {detail.summary.kind} · {detail.summary.status}</p></div>
      <nav><a href="/industry/traces">All traces</a>{detail.summary.kind === 'RETRIEVAL' && detail.debug !== undefined ? <a href={retrievalDebugPath(detail.summary.traceId)}>Open Retrieval Debug</a> : null}<a href="/industry/eval">Evaluation</a></nav>
    </header>
    <div className="trace-tabs" role="tablist" aria-label="Trace detail tabs">{(['overview', 'timeline', 'tree', 'raw'] as const).map((item) => <button type="button" key={item} data-active={tab === item} onClick={() => onTabChange(item)}>{tabLabel(item)}</button>)}</div>
    {tab === 'overview' ? <><Overview detail={detail} stats={snapshot.stats} /><TraceAddToEvalDraft traceId={detail.summary.traceId} /></> : null}
    {tab === 'timeline' ? <Timeline events={snapshot.timeline ?? []} /> : null}
    {tab === 'tree' ? <SpanTree tree={snapshot.tree} /> : null}
    {tab === 'raw' ? <RawDebug detail={detail} /> : null}
  </main>
}

function TraceList({ traces }: { traces: readonly TraceSummary[] }) {
  return <main className="trace-page" aria-labelledby="trace-list-title"><header className="trace-heading"><div><span>Industry Agent · P7</span><h1 id="trace-list-title">Trace Explorer</h1><p>Project-scoped request traces, audit evidence, token accounting, debug inspection, and Eval Draft capture.</p></div><nav><a href="/industry">Workspace</a><a href="/industry/eval">Evaluation</a></nav></header><section className="trace-panel"><h2>Recent traces</h2><div className="trace-table-wrap"><table className="trace-table"><thead><tr><th>Trace</th><th>Kind</th><th>Status</th><th>Duration</th><th>Spans</th><th>Started</th></tr></thead><tbody>{traces.map((trace) => <tr key={trace.traceId}><td><a href={`/industry/traces/${encodeURIComponent(trace.traceId)}`}>{trace.name}</a><br /><code>{trace.traceId}</code></td><td>{trace.kind}</td><td>{trace.status}</td><td>{trace.durationMs} ms</td><td>{trace.spanCount}</td><td>{trace.startedAt}</td></tr>)}</tbody></table></div></section></main>
}
function Overview({ detail, stats }: { detail: TraceDetail; stats?: TraceStats }) {
  return <><section className="trace-summary-grid" aria-label="Trace stats"><Metric label="Duration" value={stats === undefined ? `${detail.summary.durationMs} ms` : `${stats.durationMs} ms`} /><Metric label="Query latency" value={stats === undefined ? '—' : `${stats.queryLatencyMs} ms`} /><Metric label="LLM calls" value={stats?.llmCallCount ?? '—'} /><Metric label="Tool calls" value={stats?.toolCallCount ?? '—'} /><Metric label="Input tokens" value={stats?.tokenUsage.inputTokens ?? '—'} /><Metric label="Output tokens" value={stats?.tokenUsage.outputTokens ?? '—'} /><Metric label="Total tokens" value={stats?.tokenUsage.totalTokens ?? '—'} /><Metric label="Errors" value={stats?.errorCount ?? '—'} /></section><section className="trace-panel"><h2>Spans</h2><div className="trace-table-wrap"><table className="trace-table"><thead><tr><th>Span</th><th>Kind</th><th>Status</th><th>Duration</th><th>Parent</th></tr></thead><tbody>{detail.spans.map((span) => <tr key={span.spanId}><td><strong>{span.name}</strong><br /><code>{span.spanId}</code></td><td>{span.kind}</td><td>{span.status}</td><td>{span.durationMs} ms</td><td><code>{span.parentSpanId ?? 'root'}</code></td></tr>)}</tbody></table></div></section><section className="trace-panel trace-access"><h2>Granted trace surfaces</h2><p>Debug: <strong>{detail.debug === undefined ? 'NO' : 'YES'}</strong> · Prompt: <strong>{detail.prompts === undefined ? 'NO' : 'YES'}</strong> · Audit: <strong>{detail.audit === undefined ? 'NO' : 'YES'}</strong></p></section></>
}
function Timeline({ events }: { events: readonly TraceTimelineEvent[] }) { return <section className="trace-panel"><h2>Timeline</h2>{events.length === 0 ? <p>No timeline events.</p> : <ol className="trace-timeline">{events.map((event) => <li key={event.eventId}><span>#{event.sequenceNo}</span><div><strong>{event.type}</strong><p>{maskTraceText(event.title)}</p>{event.detail === undefined ? null : <small>{maskTraceText(event.detail)}</small>}<small>{event.timestamp}{event.spanId === undefined ? '' : ` · ${event.spanId}`}</small></div></li>)}</ol>}</section> }
function SpanTree({ tree }: { tree?: TraceTree }) { return <section className="trace-panel"><h2>Span Tree</h2>{tree === undefined || tree.roots.length === 0 ? <p>No span tree.</p> : <ul className="trace-tree">{tree.roots.map((node) => <TreeNode key={node.span.spanId} node={node} />)}</ul>}</section> }
function TreeNode({ node }: { node: TraceTreeNode }) { return <li><div><strong>{node.span.name}</strong><span>{node.span.kind} · {node.span.durationMs} ms</span></div>{node.children.length === 0 ? null : <ul>{node.children.map((child) => <TreeNode key={child.span.spanId} node={child} />)}</ul>}</li> }
function RawDebug({ detail }: { detail: TraceDetail }) { return <section className="trace-raw-grid"><article className="trace-panel"><h2>Raw / Debug</h2><p>Rendered through a second web-side masking pass.</p><pre>{maskedJson(detail.debug ?? { unavailable: 'trace.read.debug permission required' })}</pre></article><article className="trace-panel"><h2>Prompt</h2>{detail.prompts === undefined ? <p>trace.read.prompt permission required.</p> : <pre>{maskedJson(detail.prompts)}</pre>}</article><article className="trace-panel"><h2>Audit</h2>{detail.audit === undefined ? <p>audit.read permission required.</p> : <pre>{maskedJson(detail.audit)}</pre>}</article></section> }
function Metric({ label, value }: { label: string; value: string | number }) { return <article><strong>{value}</strong><span>{label}</span></article> }
function tabLabel(tab: TraceTab): string { if (tab === 'overview') return 'Overview'; if (tab === 'timeline') return 'Timeline'; if (tab === 'tree') return 'Span Tree'; return 'Raw / Debug' }
async function loadSnapshot(client: IndustryTraceApiClient, traceId: string | undefined): Promise<TracePageSnapshot> {
  const traces = await client.listTraces(); if (traceId === undefined) return { traces }
  const [detail, timeline, tree, stats] = await Promise.all([client.getTrace(traceId), client.getTimeline(traceId), client.getTree(traceId), client.getStats(traceId)])
  return { traces, detail, timeline, tree, stats }
}
