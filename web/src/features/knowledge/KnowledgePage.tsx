import { useEffect, useState } from 'react'
import type {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeIngestion,
  KnowledgeUploadOptions,
  KnowledgeUploadRequest,
  KnowledgeVisibility,
} from '../../../../shared/industry/knowledge'
import { createKnowledgeApiClient, type KnowledgeApiClient } from '../../api/knowledge-client'
import './knowledge.css'

const defaultClient = createKnowledgeApiClient()

export interface KnowledgeSnapshot {
  options: KnowledgeUploadOptions
  documents: readonly KnowledgeDocument[]
  selectedDocument?: KnowledgeDocument
  chunks: readonly KnowledgeChunk[]
  ingestion?: KnowledgeIngestion
}

export function KnowledgePage({ client = defaultClient, initialSnapshot }: { client?: KnowledgeApiClient; initialSnapshot?: KnowledgeSnapshot }) {
  const [snapshot, setSnapshot] = useState<KnowledgeSnapshot | undefined>(initialSnapshot)
  const [form, setForm] = useState<KnowledgeUploadRequest | undefined>(() => initialSnapshot === undefined ? undefined : defaultForm(initialSnapshot.options))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void loadInitial(client).then((value) => {
      if (cancelled) return
      setSnapshot(value)
      setForm(defaultForm(value.options))
    }).catch((reason: unknown) => { if (!cancelled) setError(messageOf(reason)) })
    return () => { cancelled = true }
  }, [client, initialSnapshot])

  async function selectDocument(documentId: string): Promise<void> {
    setBusy(true); setError(null)
    try {
      const current = snapshot?.documents.find((item) => item.documentId === documentId)
      const document = current ?? await client.getDocument(documentId)
      const [chunks, ingestion] = await Promise.all([client.listChunks(documentId), client.getIngestion(document.ingestionId)])
      setSnapshot((value) => value === undefined ? value : { ...value, selectedDocument: document, chunks, ingestion })
    } catch (reason) { setError(messageOf(reason)) } finally { setBusy(false) }
  }

  async function upload(): Promise<void> {
    if (form === undefined) return
    setBusy(true); setError(null)
    try {
      const document = await client.uploadDocument(form)
      const [documents, chunks, ingestion] = await Promise.all([client.listDocuments(), client.listChunks(document.documentId), client.getIngestion(document.ingestionId)])
      setSnapshot((value) => value === undefined ? value : { ...value, documents, selectedDocument: document, chunks, ingestion })
    } catch (reason) { setError(messageOf(reason)) } finally { setBusy(false) }
  }

  async function reingest(): Promise<void> {
    const selected = snapshot?.selectedDocument
    if (selected === undefined) return
    setBusy(true); setError(null)
    try {
      const document = await client.reingestDocument(selected.documentId)
      const [documents, chunks, ingestion] = await Promise.all([client.listDocuments(), client.listChunks(document.documentId), client.getIngestion(document.ingestionId)])
      setSnapshot((value) => value === undefined ? value : { ...value, documents, selectedDocument: document, chunks, ingestion })
    } catch (reason) { setError(messageOf(reason)) } finally { setBusy(false) }
  }

  if (snapshot === undefined || form === undefined) return <main className="knowledge-page"><h1>知识库</h1><p>{error ?? '加载知识工作区…'}</p></main>
  return <KnowledgePageView
    snapshot={snapshot}
    form={form}
    busy={busy}
    error={error}
    onFormChange={setForm}
    onUpload={() => void upload()}
    onSelectDocument={(id) => void selectDocument(id)}
    onReingest={() => void reingest()}
  />
}

export function KnowledgePageView({
  snapshot, form, busy, error, onFormChange = () => undefined, onUpload = () => undefined,
  onSelectDocument = () => undefined, onReingest = () => undefined,
}: {
  snapshot: KnowledgeSnapshot
  form: KnowledgeUploadRequest
  busy: boolean
  error: string | null
  onFormChange?: (value: KnowledgeUploadRequest) => void
  onUpload?: () => void
  onSelectDocument?: (documentId: string) => void
  onReingest?: () => void
}) {
  const options = snapshot.options
  return <main className="knowledge-page" aria-labelledby="knowledge-title">
    <header className="knowledge-heading">
      <div><span>行业智能体 · P6</span><h1 id="knowledge-title">知识库 / RAG</h1><p>基于模拟的文档管理、ACL 评审、摄入、分块和源版本。未连接对象存储或 OpenSearch。</p></div>
      <nav><a href="/industry">工作区</a><a href="/industry/eval/rag">RAG 评测</a></nav>
    </header>
    {error === null ? null : <p className="knowledge-error" role="alert">{error}</p>}

    <section className="knowledge-panel">
      <h2>上传文档</h2>
      <p>以下所有范围和 ACL 选项由服务端为当前主体/项目签发。P6 仅读取本地文件元数据;文件字节不会上传或存储。</p>
      <div className="knowledge-form-grid">
        <label>本地文件(仅元数据)<input type="file" accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file !== undefined) onFormChange({ ...form, fileName: file.name, mimeType: file.type || mimeFromName(file.name), sizeBytes: file.size })
        }} /></label>
        <label>文件名<input value={form.fileName} disabled={busy} onChange={(event) => onFormChange({ ...form, fileName: event.target.value })} /></label>
        <label>MIME<select value={form.mimeType} disabled={busy} onChange={(event) => onFormChange({ ...form, mimeType: event.target.value })}><option value="application/pdf">PDF</option><option value="text/plain">文本</option><option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">DOCX</option></select></label>
        <label>大小(字节)<input type="number" value={form.sizeBytes} min={1} disabled={busy} onChange={(event) => onFormChange({ ...form, sizeBytes: Number(event.target.value) })} /></label>
        <Select label="行业" value={form.industry} values={options.industries} disabled={busy} onChange={(value) => onFormChange({ ...form, industry: value })} />
        <Select label="公司" value={form.companyId} values={options.companies.map((item) => item.companyId)} disabled={busy} onChange={(value) => onFormChange({ ...form, companyId: value })} />
        <Select label="项目" value={form.projectId} values={options.projects.map((item) => item.projectId)} disabled={busy} onChange={(value) => onFormChange({ ...form, projectId: value })} />
        <Select label="部门" value={form.department} values={options.departments} disabled={busy} onChange={(value) => onFormChange({ ...form, department: value })} />
        <label>可见性<select value={form.visibility} disabled={busy} onChange={(event) => onFormChange({ ...form, visibility: event.target.value as KnowledgeVisibility })}>{options.visibilities.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <AclChoices title="ACL 用户" values={options.users.map((item) => item.userId)} selected={form.aclUsers} disabled={busy} onChange={(aclUsers) => onFormChange({ ...form, aclUsers })} />
      <AclChoices title="ACL 角色" values={options.roles} selected={form.aclRoles} disabled={busy} onChange={(aclRoles) => onFormChange({ ...form, aclRoles })} />
      <AclChoices title="安全标签" values={options.securityTags} selected={form.securityTags} disabled={busy} onChange={(securityTags) => onFormChange({ ...form, securityTags })} />
      <button type="button" disabled={busy || form.fileName.trim() === '' || form.sizeBytes <= 0} onClick={onUpload}>创建模拟上传</button>
    </section>

    <section className="knowledge-panel">
      <h2>文档</h2>
      <div className="knowledge-table-wrap"><table className="knowledge-table"><thead><tr><th>文档</th><th>范围</th><th>可见性</th><th>状态</th><th>版本</th><th>分块</th><th /></tr></thead><tbody>{snapshot.documents.map((document) => <tr key={document.documentId} data-selected={snapshot.selectedDocument?.documentId === document.documentId}><td><strong>{document.fileName}</strong><br /><code>{document.documentId}</code></td><td>{document.department}<br /><small>{document.projectId}</small></td><td>{document.acl.visibility}<br /><small>{document.acl.securityTags.join(', ') || '无标签'}</small></td><td>{document.ingestionStatus}</td><td>{document.sourceVersion}</td><td>{document.chunkCount}</td><td><button type="button" disabled={busy} onClick={() => onSelectDocument(document.documentId)}>查看</button></td></tr>)}</tbody></table></div>
    </section>

    {snapshot.selectedDocument === undefined ? null : <DocumentInspector snapshot={snapshot} busy={busy} onReingest={onReingest} />}
  </main>
}

function DocumentInspector({ snapshot, busy, onReingest }: { snapshot: KnowledgeSnapshot; busy: boolean; onReingest: () => void }) {
  const document = snapshot.selectedDocument!
  return <>
    <section className="knowledge-panel">
      <div className="knowledge-section-heading"><div><h2>文档检查器</h2><p><code>{document.documentId}</code> · {document.sourceVersion}</p></div><button type="button" disabled={busy} onClick={onReingest}>重新摄入模拟来源</button></div>
      <dl className="knowledge-kv"><div><dt>行业</dt><dd>{document.industry}</dd></div><div><dt>公司</dt><dd>{document.companyId}</dd></div><div><dt>项目</dt><dd>{document.projectId}</dd></div><div><dt>部门</dt><dd>{document.department}</dd></div><div><dt>ACL 用户</dt><dd>{document.acl.aclUsers.join(', ') || '—'}</dd></div><div><dt>ACL 角色</dt><dd>{document.acl.aclRoles.join(', ') || '—'}</dd></div></dl>
    </section>
    <section className="knowledge-panel"><h2>摄入管道</h2>{snapshot.ingestion === undefined ? <p>摄入不可用。</p> : <ol className="knowledge-pipeline">{snapshot.ingestion.steps.map((step) => <li key={`${step.status}-${step.timestamp}`} data-current={step.status === snapshot.ingestion?.status}><strong>{step.status}</strong><span>{step.detail}</span><small>{step.timestamp}</small></li>)}</ol>}</section>
    <section className="knowledge-panel"><h2>分块</h2><div className="knowledge-table-wrap"><table className="knowledge-table"><thead><tr><th>#</th><th>页 / 章节</th><th>父级上下文</th><th>文本</th><th>来源</th></tr></thead><tbody>{snapshot.chunks.map((chunk) => <tr key={chunk.chunkId}><td>{chunk.ordinal}</td><td>页{chunk.page}<br />{chunk.section}</td><td>{chunk.parentContext}</td><td>{chunk.text}</td><td>{chunk.sourceVersion}<br /><code>{chunk.chunkId}</code></td></tr>)}</tbody></table></div></section>
  </>
}

function Select({ label, value, values, disabled, onChange }: { label: string; value: string; values: readonly string[]; disabled: boolean; onChange: (value: string) => void }) {
  return <label>{label}<select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{values.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
}

function AclChoices({ title, values, selected, disabled, onChange }: { title: string; values: readonly string[]; selected: readonly string[]; disabled: boolean; onChange: (values: readonly string[]) => void }) {
  return <fieldset className="knowledge-acl"><legend>{title}</legend>{values.length === 0 ? <span>无授权</span> : values.map((value) => <label key={value}><input type="checkbox" checked={selected.includes(value)} disabled={disabled} onChange={(event) => onChange(event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))} />{value}</label>)}</fieldset>
}

async function loadInitial(client: KnowledgeApiClient): Promise<KnowledgeSnapshot> {
  const [options, documents] = await Promise.all([client.getUploadOptions(), client.listDocuments()])
  const selectedDocument = documents[0]
  if (selectedDocument === undefined) return { options, documents, chunks: [] }
  const [chunks, ingestion] = await Promise.all([client.listChunks(selectedDocument.documentId), client.getIngestion(selectedDocument.ingestionId)])
  return { options, documents, selectedDocument, chunks, ingestion }
}

function defaultForm(options: KnowledgeUploadOptions): KnowledgeUploadRequest {
  return {
    fileName: '新文档.pdf', mimeType: 'application/pdf', sizeBytes: 1024,
    industry: options.industries[0] ?? '', companyId: options.companies[0]?.companyId ?? '', projectId: options.projects[0]?.projectId ?? '',
    department: options.departments[0] ?? '', visibility: options.visibilities[0] ?? 'PROJECT',
    aclUsers: [], aclRoles: [], securityTags: options.securityTags.includes('GENERAL') ? ['GENERAL'] : [],
  }
}

function mimeFromName(fileName: string): string {
  const normalized = fileName.toLowerCase()
  if (normalized.endsWith('.txt')) return 'text/plain'
  if (normalized.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return 'application/pdf'
}

function messageOf(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
