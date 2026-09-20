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
  if (error !== null) return <main className="trace-page"><h1>追踪</h1><p role="alert">{error}</p></main>
  if (snapshot === undefined) return <main className="trace-page"><h1>追踪</h1><p>加载追踪数据中…</p></main>
  return <TracePageView snapshot={snapshot} traceId={traceId} tab={tab} onTabChange={setTab} />
}

export function TracePageView({ snapshot, traceId, tab, onTabChange = () => undefined }: { snapshot: TracePageSnapshot; traceId?: string; tab: TraceTab; onTabChange?: (tab: TraceTab) => void }) {
  if (traceId === undefined) return <TraceList traces={snapshot.traces} />
  const detail = snapshot.detail
  if (detail === undefined) return <main className="trace-page"><h1>追踪</h1><p>追踪详情不可用。</p></main>
  return <main className="trace-page" aria-labelledby="trace-title">
    <header className="trace-heading">
      <div><span>行业智能体 · P7</span><h1 id="trace-title">{detail.summary.name}</h1><p><code>{detail.summary.traceId}</code> · {detail.summary.kind} · {detail.summary.status}</p></div>
      <nav><a href="/industry/traces">全部追踪</a>{detail.summary.kind === 'RETRIEVAL' && detail.debug !== undefined ? <a href={retrievalDebugPath(detail.summary.traceId)}>打开检索调试</a> : null}<a href="/industry/eval">评测</a></nav>
    </header>
    <div className="trace-tabs" role="tablist" aria-label="追踪详情标签">{(['overview', 'timeline', 'tree', 'raw'] as const).map((item) => <button type="button" key={item} data-active={tab === item} onClick={() => onTabChange(item)}>{tabLabel(item)}</button>)}</div>
    {tab === 'overview' ? <><Overview detail={detail} stats={snapshot.stats} /><TraceAddToEvalDraft traceId={detail.summary.traceId} /></> : null}
    {tab === 'timeline' ? <Timeline events={snapshot.timeline ?? []} /> : null}
    {tab === 'tree' ? <SpanTree tree={snapshot.tree} /> : null}
    {tab === 'raw' ? <RawDebug detail={detail} /> : null}
  </main>
}

function TraceList({ traces }: { traces: readonly TraceSummary[] }) {
  return <main className="trace-page" aria-labelledby="trace-list-title"><header className="trace-heading"><div><span>行业智能体 · P7</span><h1 id="trace-list-title">追踪浏览器</h1><p>项目级请求追踪、审计证据、Token 用量统计、调试检查及评测草稿采集。</p></div><nav><a href="/industry">工作区</a><a href="/industry/eval">评测</a></nav></header><section className="trace-panel"><h2>最近的追踪</h2><div className="trace-table-wrap"><table className="trace-table"><thead><tr><th>追踪</th><th>类型</th><th>状态</th><th>耗时</th><th>跨度</th><th>开始时间</th></tr></thead><tbody>{traces.map((trace) => <tr key={trace.traceId}><td><a href={`/industry/traces/${encodeURIComponent(trace.traceId)}`}>{trace.name}</a><br /><code>{trace.traceId}</code></td><td>{trace.kind}</td><td>{trace.status}</td><td>{trace.durationMs} ms</td><td>{trace.spanCount}</td><td>{trace.startedAt}</td></tr>)}</tbody></table></div></section></main>
}
function Overview({ detail, stats }: { detail: TraceDetail; stats?: TraceStats }) {
  return <><section className="trace-summary-grid" aria-label="追踪统计"><Metric label="耗时" value={stats === undefined ? `${detail.summary.durationMs} ms` : `${stats.durationMs} ms`} /><Metric label="查询延迟" value={stats === undefined ? '—' : `${stats.queryLatencyMs} ms`} /><Metric label="LLM 调用次数" value={stats?.llmCallCount ?? '—'} /><Metric label="工具调用次数" value={stats?.toolCallCount ?? '—'} /><Metric label="输入 Token 数" value={stats?.tokenUsage.inputTokens ?? '—'} /><Metric label="输出 Token 数" value={stats?.tokenUsage.outputTokens ?? '—'} /><Metric label="Token 总数" value={stats?.tokenUsage.totalTokens ?? '—'} /><Metric label="错误数" value={stats?.errorCount ?? '—'} /></section><section className="trace-panel"><h2>跨度</h2><div className="trace-table-wrap"><table className="trace-table"><thead><tr><th>跨度</th><th>类型</th><th>状态</th><th>耗时</th><th>父级</th></tr></thead><tbody>{detail.spans.map((span) => <tr key={span.spanId}><td><strong>{span.name}</strong><br /><code>{span.spanId}</code></td><td>{span.kind}</td><td>{span.status}</td><td>{span.durationMs} ms</td><td><code>{span.parentSpanId ?? '根节点'}</code></td></tr>)}</tbody></table></div></section><section className="trace-panel trace-access"><h2>已授权的追踪界面</h2><p>调试: <strong>{detail.debug === undefined ? '否' : '是'}</strong> · 提示词: <strong>{detail.prompts === undefined ? '否' : '是'}</strong> · 审计: <strong>{detail.audit === undefined ? '否' : '是'}</strong></p></section></>
}
function Timeline({ events }: { events: readonly TraceTimelineEvent[] }) { return <section className="trace-panel"><h2>时间线</h2>{events.length === 0 ? <p>无时间线事件。</p> : <ol className="trace-timeline">{events.map((event) => <li key={event.eventId}><span>#{event.sequenceNo}</span><div><strong>{event.type}</strong><p>{maskTraceText(event.title)}</p>{event.detail === undefined ? null : <small>{maskTraceText(event.detail)}</small>}<small>{event.timestamp}{event.spanId === undefined ? '' : ` · ${event.spanId}`}</small></div></li>)}</ol>}</section> }
function SpanTree({ tree }: { tree?: TraceTree }) { return <section className="trace-panel"><h2>跨度树</h2>{tree === undefined || tree.roots.length === 0 ? <p>无跨度树。</p> : <ul className="trace-tree">{tree.roots.map((node) => <TreeNode key={node.span.spanId} node={node} />)}</ul>}</section> }
function TreeNode({ node }: { node: TraceTreeNode }) { return <li><div><strong>{node.span.name}</strong><span>{node.span.kind} · {node.span.durationMs} ms</span></div>{node.children.length === 0 ? null : <ul>{node.children.map((child) => <TreeNode key={child.span.spanId} node={child} />)}</ul>}</li> }
function RawDebug({ detail }: { detail: TraceDetail }) { return <section className="trace-raw-grid"><article className="trace-panel"><h2>原始 / 调试</h2><p>经过 Web 端二次脱敏处理后渲染。</p><pre>{maskedJson(detail.debug ?? { unavailable: '需要 trace.read.debug 权限' })}</pre></article><article className="trace-panel"><h2>提示词</h2>{detail.prompts === undefined ? <p>需要 trace.read.prompt 权限。</p> : <pre>{maskedJson(detail.prompts)}</pre>}</article><article className="trace-panel"><h2>审计</h2>{detail.audit === undefined ? <p>需要 audit.read 权限。</p> : <pre>{maskedJson(detail.audit)}</pre>}</article></section> }
function Metric({ label, value }: { label: string; value: string | number }) { return <article><strong>{value}</strong><span>{label}</span></article> }
function tabLabel(tab: TraceTab): string { if (tab === 'overview') return '概览'; if (tab === 'timeline') return '时间线'; if (tab === 'tree') return '跨度树'; return '原始 / 调试' }
async function loadSnapshot(client: IndustryTraceApiClient, traceId: string | undefined): Promise<TracePageSnapshot> {
  const traces = await client.listTraces(); if (traceId === undefined) return { traces }
  const [detail, timeline, tree, stats] = await Promise.all([client.getTrace(traceId), client.getTimeline(traceId), client.getTree(traceId), client.getStats(traceId)])
  return { traces, detail, timeline, tree, stats }
}
