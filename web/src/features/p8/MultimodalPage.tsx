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

  if (snapshot === undefined) return <main className="p8-page"><h1>Multimodal Review</h1><p>{error ?? 'Loading multimodal workspace…'}</p></main>
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
    <header className="p8-heading"><div><span>Industry Agent · P8</span><h1 id="multimodal-title">Multimodal Review</h1><p>Local image preview with mock metadata analysis, observations, bbox, confidence, field gaps, and entity review. Image bytes are not sent to the P8 mock API.</p></div><nav><a href="/industry/agent-loop">Agent Loop</a><a href="/industry/eval/multimodal">Multimodal Eval</a></nav></header>
    {error === null ? null : <p role="alert" className="p8-error">{error}</p>}
    <section className="p8-panel"><h2>Image input</h2><label className="p8-file">Choose image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => onFileChange(event.currentTarget.files?.[0])} /></label>{file === undefined ? <p>No local image selected.</p> : <dl className="p8-kv"><div><dt>Name</dt><dd>{file.fileName}</dd></div><div><dt>MIME</dt><dd>{file.mimeType}</dd></div><div><dt>Size</dt><dd>{file.sizeBytes} bytes</dd></div></dl>}{previewUrl === undefined ? null : <div className="p8-preview"><img src={previewUrl} alt="Local preview" /></div>}<button type="button" disabled={busy || file === undefined} onClick={onAnalyze}>Analyze metadata fixture</button></section>
    <section className="p8-panel"><h2>Analyses</h2><div className="p8-table-wrap"><table className="p8-table"><thead><tr><th>Analysis</th><th>Image</th><th>Project</th><th>Observations</th><th>Safety</th><th /></tr></thead><tbody>{snapshot.analyses.map((analysis) => <tr key={analysis.analysisId} data-selected={snapshot.selected?.analysisId === analysis.analysisId}><td><code>{analysis.analysisId}</code></td><td>{analysis.image.fileName}</td><td><code>{analysis.projectId}</code></td><td>{analysis.observations.length}</td><td>{analysis.noEvidence ? 'NO_EVIDENCE' : analysis.promptInjectionBlocked ? 'INJECTION_BLOCKED' : 'NORMAL'}</td><td><button type="button" disabled={busy} onClick={() => onSelect(analysis.analysisId)}>Inspect</button></td></tr>)}</tbody></table></div></section>
    {snapshot.selected === undefined ? null : <AnalysisInspector analysis={snapshot.selected} busy={busy} onReview={onReview} />}
  </main>
}

function AnalysisInspector({ analysis, busy, onReview }: { analysis: MultimodalAnalysis; busy: boolean; onReview: (id: string, request: ReviewMultimodalObservationRequest) => void }) {
  return <section className="p8-panel"><h2>Observation Review</h2><p><code>{analysis.analysisId}</code> · prompt injection blocked: <strong>{String(analysis.promptInjectionBlocked)}</strong> · no evidence: <strong>{String(analysis.noEvidence)}</strong></p>{analysis.observations.length === 0 ? <p>No visual evidence was accepted.</p> : analysis.observations.map((observation) => <ObservationCard key={observation.observationId} observation={observation} busy={busy} onReview={onReview} />)}</section>
}

function ObservationCard({ observation, busy, onReview }: { observation: MultimodalObservation; busy: boolean; onReview: (id: string, request: ReviewMultimodalObservationRequest) => void }) {
  const [entityId, setEntityId] = useState(observation.selectedEntityId ?? observation.entityCandidates[0]?.entityId ?? '')
  const [corrections, setCorrections] = useState<Record<string,string>>({})
  const bbox = observation.bbox
  return <article className="p8-observation" data-low-confidence={observation.lowConfidence}>
    <div className="p8-heading-row"><div><strong>{observation.label}</strong><p>confidence {(observation.confidence * 100).toFixed(1)}% · {observation.reviewStatus}</p></div>{observation.lowConfidence ? <mark>LOW CONFIDENCE</mark> : null}</div>
    <dl className="p8-kv"><div><dt>BBox</dt><dd>{bbox === undefined ? '—' : `x=${bbox.x}, y=${bbox.y}, w=${bbox.width}, h=${bbox.height}`}</dd></div><div><dt>Missing</dt><dd>{observation.missingFields.join(', ') || '—'}</dd></div></dl>
    <div className="p8-table-wrap"><table className="p8-table"><thead><tr><th>Field</th><th>Value</th><th>Confidence</th><th>Correction</th></tr></thead><tbody>{observation.fields.map((field) => <tr key={field.name}><td>{field.name}</td><td>{field.missing ? 'MISSING' : field.value}</td><td>{(field.confidence*100).toFixed(1)}%</td><td>{field.missing || observation.lowConfidence ? <input aria-label={`Correct ${field.name}`} value={corrections[field.name] ?? ''} disabled={busy} onChange={(event) => setCorrections((value) => ({...value,[field.name]:event.target.value}))} /> : '—'}</td></tr>)}</tbody></table></div>
    <label>Entity review<select aria-label="Entity candidate" value={entityId} disabled={busy} onChange={(event) => setEntityId(event.target.value)}><option value="">No entity</option>{observation.entityCandidates.map((candidate) => <option key={candidate.entityId} value={candidate.entityId}>{candidate.name} · {candidate.entityId} · {(candidate.confidence*100).toFixed(1)}%</option>)}</select></label>
    <div className="p8-actions"><button type="button" disabled={busy} onClick={() => onReview(observation.observationId,{decision:'ACCEPT',...(entityId===''?{}:{selectedEntityId:entityId})})}>Accept</button><button type="button" disabled={busy || Object.values(corrections).every((value)=>value.trim()==='')} onClick={() => onReview(observation.observationId,{decision:'CORRECT',...(entityId===''?{}:{selectedEntityId:entityId}),correctedFields:Object.fromEntries(Object.entries(corrections).filter(([,value])=>value.trim()!==''))})}>Apply corrections</button><button type="button" disabled={busy} onClick={() => onReview(observation.observationId,{decision:'REJECT'})}>Reject</button></div>
  </article>
}

function mimeFromName(name: string): string { const lower=name.toLowerCase(); if(lower.endsWith('.png'))return 'image/png'; if(lower.endsWith('.webp'))return 'image/webp'; return 'image/jpeg' }
function messageOf(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
