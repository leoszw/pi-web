import { useEffect, useState } from 'react'
import type {
  CreateMultimodalAnalysisRequest,
  MultimodalAnalysis,
  MultimodalObservation,
  ReviewMultimodalObservationRequest,
} from '../../../../shared/industry/multimodal'
import { createP8ApiClient, type P8ApiClient } from '../../api/p8-client'
import './p8.css'

const defaultClient = createP8ApiClient()

export interface MultimodalSnapshot {
  analyses: readonly MultimodalAnalysis[]
  selected?: MultimodalAnalysis
}

export function MultimodalPage({ client = defaultClient, initialSnapshot }: { client?: P8ApiClient; initialSnapshot?: MultimodalSnapshot }) {
  const [snapshot, setSnapshot] = useState<MultimodalSnapshot | undefined>(initialSnapshot)
  const [file, setFile] = useState<CreateMultimodalAnalysisRequest | undefined>()
  const [previewUrl, setPreviewUrl] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void client.listMultimodalAnalyses().then((analyses) => { if (!cancelled) setSnapshot({ analyses, selected: analyses[0] }) }).catch((reason: unknown) => { if (!cancelled) setError(messageOf(reason)) })
    return () => { cancelled = true }
  }, [client, initialSnapshot])

  useEffect(() => () => { if (previewUrl !== undefined) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  function selectLocalFile(next: File | undefined): void {
    if (previewUrl !== undefined) URL.revokeObjectURL(previewUrl)
    if (next === undefined) { setFile(undefined); setPreviewUrl(undefined); return }
    setFile({ fileName: next.name, mimeType: next.type || mimeFromName(next.name), sizeBytes: next.size })
    setPreviewUrl(URL.createObjectURL(next))
  }

  async function analyze(): Promise<void> {
    if (file === undefined) return
    setBusy(true); setError(null)
    try {
      const selected = await client.createMultimodalAnalysis(file)
      const analyses = await client.listMultimodalAnalyses()
      setSnapshot({ analyses, selected })
    } catch (reason) { setError(messageOf(reason)) } finally { setBusy(false) }
  }

  async function selectAnalysis(analysisId: string): Promise<void> {
    setBusy(true); setError(null)
    try { const selected = await client.getMultimodalAnalysis(analysisId); setSnapshot((value) => value === undefined ? value : { ...value, selected }) }
    catch (reason) { setError(messageOf(reason)) } finally { setBusy(false) }
  }

  async function review(observationId: string, input: ReviewMultimodalObservationRequest): Promise<void> {
    const selected = snapshot?.selected
    if (selected === undefined) return
    setBusy(true); setError(null)
    try {
      const next = await client.reviewMultimodalObservation(selected.analysisId, observationId, input)
      setSnapshot((value) => value === undefined ? value : { analyses: value.analyses.map((item) => item.analysisId === next.analysisId ? next : item), selected: next })
    } catch (reason) { setError(messageOf(reason)) } finally { setBusy(false) }
  }

  if (snapshot === undefined) return <main className="p8-page"><h1>多模态评审</h1><p>{error ?? '加载多模态工作区…'}</p></main>
  return <MultimodalView snapshot={snapshot} file={file} previewUrl={previewUrl} busy={busy} error={error} onFileChange={selectLocalFile} onAnalyze={() => void analyze()} onSelect={(id) => void selectAnalysis(id)} onReview={(id,input) => void review(id,input)} />
}

export function MultimodalView({ snapshot, file, previewUrl, busy, error, onFileChange = () => undefined, onAnalyze = () => undefined, onSelect = () => undefined, onReview = () => undefined }: {
  snapshot: MultimodalSnapshot
  file?: CreateMultimodalAnalysisRequest
  previewUrl?: string
  busy: boolean
  error: string | null
  onFileChange?: (file: File | undefined) => void
  onAnalyze?: () => void
  onSelect?: (analysisId: string) => void
  onReview?: (observationId: string, request: ReviewMultimodalObservationRequest) => void
}) {
  return <main className="p8-page" aria-labelledby="multimodal-title">
    <header className="p8-heading"><div><span>行业智能体 · P8</span><h1 id="multimodal-title">多模态评审</h1><p>本地图片预览,包含模拟元数据分析、观察、bbox、置信度、字段缺口与实体评审。图片字节不会发送到 P8 模拟 API。</p></div><nav><a href="/industry/agent-loop">智能体循环</a><a href="/industry/eval/multimodal">多模态评测</a></nav></header>
    {error === null ? null : <p role="alert" className="p8-error">{error}</p>}
    <section className="p8-panel"><h2>图片输入</h2><label className="p8-file">选择图片<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => onFileChange(event.currentTarget.files?.[0])} /></label>{file === undefined ? <p>未选择本地图片。</p> : <dl className="p8-kv"><div><dt>名称</dt><dd>{file.fileName}</dd></div><div><dt>MIME</dt><dd>{file.mimeType}</dd></div><div><dt>大小</dt><dd>{file.sizeBytes} 字节</dd></div></dl>}{previewUrl === undefined ? null : <div className="p8-preview"><img src={previewUrl} alt="本地预览" /></div>}<button type="button" disabled={busy || file === undefined} onClick={onAnalyze}>分析元数据夹具</button></section>
    <section className="p8-panel"><h2>分析</h2><div className="p8-table-wrap"><table className="p8-table"><thead><tr><th>分析</th><th>图片</th><th>项目</th><th>观察</th><th>安全</th><th /></tr></thead><tbody>{snapshot.analyses.map((analysis) => <tr key={analysis.analysisId} data-selected={snapshot.selected?.analysisId === analysis.analysisId}><td><code>{analysis.analysisId}</code></td><td>{analysis.image.fileName}</td><td><code>{analysis.projectId}</code></td><td>{analysis.observations.length}</td><td>{analysis.noEvidence ? 'NO_EVIDENCE' : analysis.promptInjectionBlocked ? 'INJECTION_BLOCKED' : 'NORMAL'}</td><td><button type="button" disabled={busy} onClick={() => onSelect(analysis.analysisId)}>查看</button></td></tr>)}</tbody></table></div></section>
    {snapshot.selected === undefined ? null : <AnalysisInspector analysis={snapshot.selected} busy={busy} onReview={onReview} />}
  </main>
}

function AnalysisInspector({ analysis, busy, onReview }: { analysis: MultimodalAnalysis; busy: boolean; onReview: (id: string, request: ReviewMultimodalObservationRequest) => void }) {
  return <section className="p8-panel"><h2>观察评审</h2><p><code>{analysis.analysisId}</code> · 提示注入已阻止: <strong>{String(analysis.promptInjectionBlocked)}</strong> · 无证据: <strong>{String(analysis.noEvidence)}</strong></p>{analysis.observations.length === 0 ? <p>未接受任何视觉证据。</p> : analysis.observations.map((observation) => <ObservationCard key={observation.observationId} observation={observation} busy={busy} onReview={onReview} />)}</section>
}

function ObservationCard({ observation, busy, onReview }: { observation: MultimodalObservation; busy: boolean; onReview: (id: string, request: ReviewMultimodalObservationRequest) => void }) {
  const [entityId, setEntityId] = useState(observation.selectedEntityId ?? observation.entityCandidates[0]?.entityId ?? '')
  const [corrections, setCorrections] = useState<Record<string,string>>({})
  const bbox = observation.bbox
  return <article className="p8-observation" data-low-confidence={observation.lowConfidence}>
    <div className="p8-heading-row"><div><strong>{observation.label}</strong><p>置信度 {(observation.confidence * 100).toFixed(1)}% · {observation.reviewStatus}</p></div>{observation.lowConfidence ? <mark>LOW CONFIDENCE</mark> : null}</div>
    <dl className="p8-kv"><div><dt>BBox</dt><dd>{bbox === undefined ? '—' : `x=${bbox.x}, y=${bbox.y}, w=${bbox.width}, h=${bbox.height}`}</dd></div><div><dt>缺失</dt><dd>{observation.missingFields.join(', ') || '—'}</dd></div></dl>
    <div className="p8-table-wrap"><table className="p8-table"><thead><tr><th>字段</th><th>值</th><th>置信度</th><th>修正</th></tr></thead><tbody>{observation.fields.map((field) => <tr key={field.name}><td>{field.name}</td><td>{field.missing ? 'MISSING' : field.value}</td><td>{(field.confidence*100).toFixed(1)}%</td><td>{field.missing || observation.lowConfidence ? <input aria-label={`修正 ${field.name}`} value={corrections[field.name] ?? ''} disabled={busy} onChange={(event) => setCorrections((value) => ({...value,[field.name]:event.target.value}))} /> : '—'}</td></tr>)}</tbody></table></div>
    <label>实体评审<select aria-label="实体候选" value={entityId} disabled={busy} onChange={(event) => setEntityId(event.target.value)}><option value="">无实体</option>{observation.entityCandidates.map((candidate) => <option key={candidate.entityId} value={candidate.entityId}>{candidate.name} · {candidate.entityId} · {(candidate.confidence*100).toFixed(1)}%</option>)}</select></label>
    <div className="p8-actions"><button type="button" disabled={busy} onClick={() => onReview(observation.observationId,{decision:'ACCEPT',...(entityId===''?{}:{selectedEntityId:entityId})})}>接受</button><button type="button" disabled={busy || Object.values(corrections).every((value)=>value.trim()==='')} onClick={() => onReview(observation.observationId,{decision:'CORRECT',...(entityId===''?{}:{selectedEntityId:entityId}),correctedFields:Object.fromEntries(Object.entries(corrections).filter(([,value])=>value.trim()!==''))})}>应用修正</button><button type="button" disabled={busy} onClick={() => onReview(observation.observationId,{decision:'REJECT'})}>拒绝</button></div>
  </article>
}

function mimeFromName(name: string): string { const lower=name.toLowerCase(); if(lower.endsWith('.png'))return 'image/png'; if(lower.endsWith('.webp'))return 'image/webp'; return 'image/jpeg' }
function messageOf(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
