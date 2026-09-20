import { useEffect, useMemo, useState } from 'react'
import { RETRIEVAL_STAGE_ORDER, type RetrievalStage } from '../../../../shared/industry/eval/retrieval'
import type { RetrievalDebugResult } from '../../../../shared/industry/retrieval-debug'
import { createIndustryTraceApiClient, type IndustryTraceApiClient } from '../../api/trace-client'
import './retrieval-debug.css'

const defaultClient = createIndustryTraceApiClient()

const STAGE_LABELS: Record<RetrievalStage, string> = {
  SEMANTIC_PARSE: '语义解析',
  HARD_FILTERS: '硬过滤',
  EXACT: '精确',
  BM25: 'BM25',
  DENSE: '密集',
  ENTITY_AWARE: '实体感知',
  RRF: 'RRF',
  RERANKER: '重排器',
  BUSINESS_FEATURE: '业务特征',
  FINAL: '最终',
}

export function RetrievalDebugPage({
  traceId,
  client = defaultClient,
  initialResult,
}: {
  traceId: string
  client?: IndustryTraceApiClient
  initialResult?: RetrievalDebugResult
}) {
  const [result, setResult] = useState<RetrievalDebugResult | undefined>(initialResult)
  const [selectedStage, setSelectedStage] = useState<RetrievalStage>('FINAL')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialResult !== undefined) return undefined
    let cancelled = false
    void client.getRetrievalDebug(traceId)
      .then((value) => { if (!cancelled) setResult(value) })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { cancelled = true }
  }, [client, initialResult, traceId])

  if (error !== null) return <main className="retrieval-debug"><h1>检索调试</h1><p role="alert">{error}</p></main>
  if (result === undefined) return <main className="retrieval-debug"><h1>检索调试</h1><p>加载追踪检索链中…</p></main>
  return <RetrievalDebugView result={result} selectedStage={selectedStage} onStageChange={setSelectedStage} />
}

export function RetrievalDebugView({
  result,
  selectedStage,
  onStageChange = () => undefined,
}: {
  result: RetrievalDebugResult
  selectedStage: RetrievalStage
  onStageChange?: (stage: RetrievalStage) => void
}) {
  const stage = useMemo(() => result.stages.find((item) => item.stage === selectedStage), [result.stages, selectedStage])
  return <main className="retrieval-debug" aria-labelledby="retrieval-debug-title">
    <header className="retrieval-debug__heading">
      <div><span>行业智能体 · P5</span><h1 id="retrieval-debug-title">检索调试</h1><p>单追踪排查。这不是数据集评测——它是单追踪诊断快照，而非评测、对比或发布流程。</p></div>
      <nav><a href={`/industry/traces/${encodeURIComponent(result.traceId)}`}>返回追踪</a><a href="/industry/eval/playground/retrieval">打开检索评测</a></nav>
    </header>

    <section className="retrieval-debug__panel">
      <h2>追踪上下文</h2>
      <dl className="retrieval-debug__context">
        {Object.entries(result.queryContext).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{Array.isArray(value) ? value.join(' → ') : String(value)}</dd></div>)}
      </dl>
      <p><strong>追踪:</strong> <code>{result.traceId}</code></p>
      <ul>{result.notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </section>

    <section className="retrieval-debug__panel">
      <h2>检索管道</h2>
      <div className="retrieval-debug__stages">{RETRIEVAL_STAGE_ORDER.map((item, index) => {
        const snapshot = result.stages.find((entry) => entry.stage === item)
        return <button type="button" key={item} data-selected={item === selectedStage} onClick={() => onStageChange(item)}><span>{index + 1}</span><strong>{STAGE_LABELS[item]}</strong><small>{snapshot?.candidates.length ?? 0} 候选</small></button>
      })}</div>
    </section>

    <section className="retrieval-debug__panel">
      <div className="retrieval-debug__section-heading"><h2>{STAGE_LABELS[selectedStage]}</h2><span>{stage?.candidates.length ?? 0} 候选</span></div>
      {stage?.notes?.map((note) => <p key={note}>{note}</p>)}
      {stage?.removedEntityIds === undefined || stage.removedEntityIds.length === 0 ? null : <p className="retrieval-debug__removed"><strong>已移除:</strong> {stage.removedEntityIds.join(', ')}</p>}
      <div className="retrieval-debug__scroll"><table className="retrieval-debug__table"><thead><tr><th>排名</th><th>实体</th><th>名称 / 标志</th><th>源分支</th><th>精确</th><th>BM25</th><th>密集</th><th>实体</th><th>RRF</th><th>重排</th><th>业务</th><th>最终</th><th>原因</th></tr></thead><tbody>{(stage?.candidates ?? []).map((candidate) => <tr key={candidate.entityId} data-hard-negative={candidate.hardNegative === true}><td>{candidate.rank}</td><td><code>{candidate.entityId}</code></td><td><strong>{candidate.name}</strong>{candidate.hardNegative ? <span className="retrieval-debug__flag">硬负样本</span> : null}{candidate.criticalSpecConflict ? <span className="retrieval-debug__flag" data-danger="true">关键规格冲突</span> : null}</td><td>{candidate.sourceArm.join(', ')}</td><Score value={candidate.exactScore} /><Score value={candidate.bm25Score} /><Score value={candidate.denseScore} /><Score value={candidate.entityAwareScore} /><Score value={candidate.rrfScore} /><Score value={candidate.rerankScore} /><Score value={candidate.businessScore} /><Score value={candidate.finalScore} /><td>{candidate.reason.join(' · ')}</td></tr>)}</tbody></table></div>
    </section>
  </main>
}

function Score({ value }: { value?: number }) {
  return <td>{value === undefined ? '—' : value.toFixed(3)}</td>
}
