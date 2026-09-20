import { useEffect, useMemo, useState } from 'react'
import type {
  RagEvalCase,
  RagEvalFailureSummary,
  RagEvalObservation,
  RagEvalRunSummary,
  RagEvalVariant,
} from '../../../../shared/industry/eval/rag'
import { createEvaluationApiClient, type EvaluationApiClient } from '../../api/industry-client'
import { ragEvalRunPath } from '../../app/routes'
import './eval.css'

const defaultClient = createEvaluationApiClient()
const DATASET_ID = 'rag-safety-v1'

export interface RagEvalSnapshot {
  cases: readonly RagEvalCase[]
  runs: readonly RagEvalRunSummary[]
  selectedRun?: RagEvalRunSummary
  observations: readonly RagEvalObservation[]
  failures: readonly RagEvalFailureSummary[]
  selectedCaseId?: string
}

export function RagEvalPage({ runId, client = defaultClient, initialSnapshot }: { runId?: string; client?: EvaluationApiClient; initialSnapshot?: RagEvalSnapshot }) {
  const [snapshot, setSnapshot] = useState<RagEvalSnapshot | undefined>(initialSnapshot)
  const [variantId, setVariantId] = useState<RagEvalVariant>('rag-guarded-v1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void loadSnapshot(client, runId).then((value) => { if (!cancelled) setSnapshot(value) }).catch((reason: unknown) => { if (!cancelled) setError(messageOf(reason)) })
    return () => { cancelled = true }
  }, [client, initialSnapshot, runId])

  async function startRun(): Promise<void> {
    setBusy(true); setError(null)
    try {
      const run = await client.startRagEvalRun({ datasetId: DATASET_ID, variantId })
      const [observations, failures, runs] = await Promise.all([client.listRagEvalObservations(run.runId), client.listRagEvalFailures(run.runId), client.listRagEvalRuns()])
      setSnapshot((current) => ({ cases: current?.cases ?? [], runs, selectedRun: run, observations, failures, selectedCaseId: failures[0]?.caseId ?? observations[0]?.caseId }))
    } catch (reason) { setError(messageOf(reason)) } finally { setBusy(false) }
  }

  async function selectRun(nextRunId: string): Promise<void> {
    setBusy(true); setError(null)
    try {
      const [selectedRun, observations, failures] = await Promise.all([client.getRagEvalRun(nextRunId), client.listRagEvalObservations(nextRunId), client.listRagEvalFailures(nextRunId)])
      setSnapshot((current) => current === undefined ? current : { ...current, selectedRun, observations, failures, selectedCaseId: failures[0]?.caseId ?? observations[0]?.caseId })
    } catch (reason) { setError(messageOf(reason)) } finally { setBusy(false) }
  }

  if (snapshot === undefined) return <main className="eval-page"><h1>RAG 评测</h1>{error === null ? <p>正在加载 RAG 评测…</p> : <p role="alert">{error}</p>}</main>
  return <RagEvalView snapshot={snapshot} variantId={variantId} busy={busy} error={error} onVariantChange={setVariantId} onStartRun={() => void startRun()} onSelectRun={(id) => void selectRun(id)} onSelectCase={(caseId) => setSnapshot((value) => value === undefined ? value : { ...value, selectedCaseId: caseId })} />
}

export function RagEvalView({
  snapshot, variantId, busy, error, onVariantChange = () => undefined, onStartRun = () => undefined,
  onSelectRun = () => undefined, onSelectCase = () => undefined,
}: {
  snapshot: RagEvalSnapshot
  variantId: RagEvalVariant
  busy: boolean
  error: string | null
  onVariantChange?: (value: RagEvalVariant) => void
  onStartRun?: () => void
  onSelectRun?: (runId: string) => void
  onSelectCase?: (caseId: string) => void
}) {
  const run = snapshot.selectedRun
  const metrics = run?.metrics
  const observationsByCase = useMemo(() => new Map(snapshot.observations.map((item) => [item.caseId, item])), [snapshot.observations])
  const selectedObservation = snapshot.observations.find((item) => item.caseId === snapshot.selectedCaseId) ?? snapshot.observations[0]

  return <main className="eval-page" aria-labelledby="rag-eval-title">
    <div className="eval-eyebrow">评测工作台 · P6</div>
    <div className="eval-heading-row"><div><h1 id="rag-eval-title">RAG 检索 + 答案评测</h1><p>确定性检索、ACL、接地性、引用、不支持断言与证据不足评测。</p></div><div className="eval-heading-actions"><a className="eval-primary-link" href="/industry/knowledge">知识库</a><a href="/industry/eval">评测</a></div></div>
    {error === null ? null : <p role="alert" className="eval-error">{error}</p>}

    <section className="eval-panel"><div className="eval-heading-row"><div><h2>批次运行</h2><p>数据集 <code>{DATASET_ID}</code> · 检索与答案安全门禁。</p></div><div className="eval-heading-actions"><select aria-label="RAG 评测变体" value={variantId} disabled={busy} onChange={(event) => onVariantChange(event.target.value as RagEvalVariant)}><option value="rag-broken-v0">rag-broken-v0</option><option value="rag-guarded-v1">rag-guarded-v1</option></select><button type="button" disabled={busy} onClick={onStartRun}>运行 RAG 评测</button></div></div></section>

    {metrics === undefined ? <section className="eval-panel"><p>选择或开始一次运行以查看 RAG 指标。</p></section> : <>
      <section className="eval-summary-grid" aria-label="RAG 评测摘要">
        <Metric label="发布门禁" value={metrics.releaseGate} critical={metrics.releaseGate === 'FAIL'} />
        <Metric label="Recall@1" value={percent(metrics.recallAt1)} critical={metrics.recallAt1 < 1} />
        <Metric label="Recall@3" value={percent(metrics.recallAt3)} critical={metrics.recallAt3 < 1} />
        <Metric label="Recall@5" value={percent(metrics.recallAt5)} critical={metrics.recallAt5 < 1} />
        <Metric label="MRR" value={metrics.mrr.toFixed(3)} critical={metrics.mrr < 1} />
        <Metric label="nDCG@5" value={metrics.ndcgAt5.toFixed(3)} critical={metrics.ndcgAt5 < 1} />
        <Metric label="文档命中" value={percent(metrics.documentHitRate)} critical={metrics.documentHitRate < 1} />
        <Metric label="分块命中" value={percent(metrics.chunkHitRate)} critical={metrics.chunkHitRate < 1} />
        <Metric label="重复率" value={percent(metrics.duplicateRate)} critical={metrics.duplicateRate > 0} />
        <Metric label="ACL 泄露" value={percent(metrics.aclLeakageRate)} critical={metrics.aclLeakageRate > 0} />
        <Metric label="接地性" value={percent(metrics.groundedness)} critical={metrics.groundedness < 1} />
        <Metric label="引用正确性" value={percent(metrics.citationCorrectness)} critical={metrics.citationCorrectness < 1} />
        <Metric label="引用完整性" value={percent(metrics.citationCompleteness)} critical={metrics.citationCompleteness < 1} />
        <Metric label="答案相关性" value={percent(metrics.answerRelevance)} critical={metrics.answerRelevance < 1} />
        <Metric label="不支持断言" value={percent(metrics.unsupportedClaimRate)} critical={metrics.unsupportedClaimRate > 0} />
        <Metric label="证据不足" value={percent(metrics.insufficientEvidenceCorrectness)} critical={metrics.insufficientEvidenceCorrectness < 1} />
      </section>
      {metrics.releaseGateReasons.length === 0 ? <section className="eval-panel"><strong>发布门禁 通过</strong><p>所有确定性 RAG 检索、ACL、答案与引用门禁均已通过。</p></section> : <section className="eval-panel"><h2>发布门禁 未通过</h2><ul>{metrics.releaseGateReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></section>}
    </>}

    <section className="eval-panel"><h2>运行记录</h2><table className="eval-table"><thead><tr><th>运行</th><th>变体</th><th>项目</th><th>门禁</th><th>通过</th><th>打开</th></tr></thead><tbody>{snapshot.runs.map((item) => <tr key={item.runId} data-selected={run?.runId === item.runId}><td><code>{item.runId}</code></td><td>{item.variantId}</td><td>{item.projectId}</td><td>{item.metrics.releaseGate}</td><td>{item.metrics.passedCount}/{item.metrics.sampleCount}</td><td><button type="button" disabled={busy} onClick={() => onSelectRun(item.runId)}>查看</button> <a href={ragEvalRunPath(item.runId)}>结果页</a></td></tr>)}</tbody></table></section>

    <section className="eval-panel"><h2>RAG 数据集</h2><table className="eval-table"><thead><tr><th>问题</th><th>期望证据</th><th>划分</th><th>结果</th><th /></tr></thead><tbody>{snapshot.cases.map((testCase) => { const observation = observationsByCase.get(testCase.caseId); return <tr key={testCase.caseId}><td>{testCase.question}<br /><code>{testCase.caseId}</code></td><td>{testCase.expectedInsufficientEvidence ? 'INSUFFICIENT_EVIDENCE' : testCase.expectedEvidence.map((item) => `${item.section} 第${item.page}页`).join(', ')}</td><td>{testCase.split}</td><td>{observation === undefined ? '—' : observation.passed ? 'PASS' : 'FAIL'}</td><td><button type="button" onClick={() => onSelectCase(testCase.caseId)}>引用检查器</button></td></tr> })}</tbody></table></section>

    <section className="eval-panel"><h2>失败下钻</h2>{snapshot.failures.length === 0 ? <p>所选运行中没有失败的 RAG 用例。</p> : snapshot.failures.map((failure) => <article className="eval-panel" key={failure.caseId} data-rag-failure={failure.caseId}><div className="eval-heading-row"><div><strong>{failure.question}</strong><p><code>{failure.caseId}</code></p></div><button type="button" onClick={() => onSelectCase(failure.caseId)}>查看引用</button></div><ul>{failure.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p>ACL 泄露: <strong>{failure.aclLeakage ? '是' : '否'}</strong> · 不支持断言: <strong>{percent(failure.unsupportedClaimRate)}</strong></p></article>)}</section>

    {selectedObservation === undefined ? null : <CitationInspector observation={selectedObservation} />}
  </main>
}

function CitationInspector({ observation }: { observation: RagEvalObservation }) {
  return <section className="eval-panel" data-citation-inspector={observation.caseId}>
    <h2>引用检查器</h2>
    <h3>问题</h3><p>{observation.question}</p>
    <h3>期望证据</h3>{observation.expectedEvidence.length === 0 ? <p>无期望证据;正确行为为证据不足处理。</p> : <ul>{observation.expectedEvidence.map((item) => <li key={item.chunkId}><code>{item.documentId}</code> · {item.section} · 第{item.page}页 · {item.sourceVersion} · <code>{item.chunkId}</code></li>)}</ul>}
    <h3>已检索分块</h3><table className="eval-table"><thead><tr><th>排名</th><th>分块</th><th>父上下文</th><th>页 / 章节</th><th>来源版本</th><th>ACL</th></tr></thead><tbody>{observation.retrievedChunks.map((chunk) => <tr key={`${chunk.rank}-${chunk.chunkId}`}><td>{chunk.rank}<br />{chunk.score.toFixed(3)}</td><td>{chunk.text}<br /><code>{chunk.chunkId}</code>{chunk.duplicateOfChunkId === undefined ? null : <><br /><small>重复于 {chunk.duplicateOfChunkId}</small></>}</td><td>{chunk.parentContext}</td><td>第{chunk.page}页<br />{chunk.section}</td><td>{chunk.sourceVersion}</td><td>{chunk.aclAllowed ? '允许' : '泄露'}</td></tr>)}</tbody></table>
    <h3>答案</h3><p>{observation.answer}</p>
    <h3>断言 → 引用</h3>{observation.claims.length === 0 ? <p>未发出断言。</p> : <table className="eval-table"><thead><tr><th>断言</th><th>引用</th><th>支持</th></tr></thead><tbody>{observation.claims.map((claim) => <tr key={claim.claimId}><td>{claim.text}</td><td>{claim.citationChunkIds.length === 0 ? '—' : claim.citationChunkIds.map((id) => <code key={id}>{id} </code>)}</td><td>{claim.supported ? '是' : '否'}</td></tr>)}</tbody></table>}
    <p><small>追踪: <code>{observation.traceId}</code></small></p>
  </section>
}

function Metric({ label, value, critical = false }: { label: string; value: string; critical?: boolean }) { return <article data-critical={critical}><strong>{value}</strong><span>{label}</span></article> }

async function loadSnapshot(client: EvaluationApiClient, runId: string | undefined): Promise<RagEvalSnapshot> {
  const [cases, runs] = await Promise.all([client.listRagEvalCases(), client.listRagEvalRuns()])
  const selectedId = runId ?? runs.find((item) => item.runId === 'run-rag-broken-v0')?.runId ?? runs[0]?.runId
  if (selectedId === undefined) return { cases, runs, observations: [], failures: [] }
  const [selectedRun, observations, failures] = await Promise.all([client.getRagEvalRun(selectedId), client.listRagEvalObservations(selectedId), client.listRagEvalFailures(selectedId)])
  return { cases, runs, selectedRun, observations, failures, selectedCaseId: failures[0]?.caseId ?? observations[0]?.caseId }
}

function percent(value: number): string { return `${(value * 100).toFixed(1)}%` }
function messageOf(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
