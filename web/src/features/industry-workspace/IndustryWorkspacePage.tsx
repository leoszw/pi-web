import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { IndustryContextResponse } from '../../../../shared/industry/api'
import type { IndustryConversation, IndustryEventEnvelope } from '../../../../shared/industry/conversation'
import type { UiActionEnvelope, UiActionPresentedEventPayload } from '../../../../shared/industry/ui-actions'
import { createIndustryConversationApiClient, type IndustryConversationApiClient } from '../../api/conversation-client'
import { createIndustryWorkspaceApiClient, type IndustryWorkspaceApiClient } from '../../api/workspace-client'
import { IndustryEventGateway } from './event-gateway'
import { UIActionRegistry } from './UIActionRegistry'
import './workspace.css'

const defaultConversationClient = createIndustryConversationApiClient()
const defaultWorkspaceClient = createIndustryWorkspaceApiClient()

export interface IndustryWorkspaceSnapshot {
  context: IndustryContextResponse
  conversation?: IndustryConversation
  events: readonly IndustryEventEnvelope[]
  actions: readonly UiActionEnvelope[]
}

export function IndustryWorkspacePage({
  conversationClient = defaultConversationClient,
  workspaceClient = defaultWorkspaceClient,
  initialSnapshot,
}: {
  conversationClient?: IndustryConversationApiClient
  workspaceClient?: IndustryWorkspaceApiClient
  initialSnapshot?: IndustryWorkspaceSnapshot
}) {
  const [snapshot, setSnapshot] = useState<IndustryWorkspaceSnapshot | undefined>(initialSnapshot)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const gatewayRef = useRef<IndustryEventGateway | null>(null)

  useEffect(() => {
    if (initialSnapshot !== undefined) return undefined
    let cancelled = false
    void workspaceClient.getContext()
      .then((context) => {
        if (!cancelled) setSnapshot({ context, events: [], actions: [] })
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(messageOf(reason))
      })
    return () => { cancelled = true }
  }, [initialSnapshot, workspaceClient])

  async function selectProject(projectId: string): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const context = await workspaceClient.selectProject({ projectId: projectId === '' ? null : projectId })
      gatewayRef.current = null
      setSnapshot({ context, events: [], actions: [] })
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  async function createConversation(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const conversation = await conversationClient.createConversation({ title: 'Industry Workspace' })
      gatewayRef.current = new IndustryEventGateway(conversationClient)
      const synced = await gatewayRef.current.reconnect(conversation.conversationId)
      const events = gatewayRef.current.knownEvents
      setSnapshot((current) => current === undefined ? current : {
        ...current,
        conversation,
        events,
        actions: actionsFromEvents(events),
      })
      if (synced.gapAtSequenceNo !== undefined) setError(`Event sequence gap at ${synced.gapAtSequenceNo}`)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const conversation = snapshot?.conversation
    const text = message.trim()
    if (conversation === undefined || text === '') return
    setBusy(true)
    setError(null)
    try {
      const updated = await conversationClient.sendMessage(conversation.conversationId, { text })
      setMessage('')
      await syncConversation(updated)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  async function reconnect(): Promise<void> {
    const conversation = snapshot?.conversation
    if (conversation === undefined) return
    setBusy(true)
    setError(null)
    try {
      const refreshed = await conversationClient.getConversation(conversation.conversationId)
      await syncConversation(refreshed)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  async function abortConversation(): Promise<void> {
    const conversation = snapshot?.conversation
    if (conversation === undefined) return
    setBusy(true)
    setError(null)
    try {
      const aborted = await conversationClient.abortConversation(conversation.conversationId)
      await syncConversation(aborted)
    } catch (reason) {
      setError(messageOf(reason))
    } finally {
      setBusy(false)
    }
  }

  async function syncConversation(conversation: IndustryConversation): Promise<void> {
    if (gatewayRef.current === null) gatewayRef.current = new IndustryEventGateway(conversationClient)
    const synced = await gatewayRef.current.reconnect(conversation.conversationId)
    const events = gatewayRef.current.knownEvents
    setSnapshot((current) => current === undefined ? current : {
      ...current,
      conversation,
      events,
      actions: actionsFromEvents(events),
    })
    if (synced.gapAtSequenceNo !== undefined) setError(`Event sequence gap at ${synced.gapAtSequenceNo}`)
  }

  if (snapshot === undefined) {
    return <main className="industry-workspace-page"><h1>Industry Workspace</h1>{error === null ? <p>Loading project context…</p> : <p className="workspace-error" role="alert">{error}</p>}</main>
  }

  return <IndustryWorkspaceView
    snapshot={snapshot}
    message={message}
    busy={busy}
    error={error}
    onProjectChange={(projectId) => void selectProject(projectId)}
    onCreateConversation={() => void createConversation()}
    onMessageChange={setMessage}
    onSendMessage={(event) => void sendMessage(event)}
    onReconnect={() => void reconnect()}
    onAbort={() => void abortConversation()}
  />
}

export function IndustryWorkspaceView({
  snapshot,
  message,
  busy,
  error,
  onProjectChange = () => undefined,
  onCreateConversation = () => undefined,
  onMessageChange = () => undefined,
  onSendMessage = (event) => event.preventDefault(),
  onReconnect = () => undefined,
  onAbort = () => undefined,
}: {
  snapshot: IndustryWorkspaceSnapshot
  message: string
  busy: boolean
  error: string | null
  onProjectChange?: (projectId: string) => void
  onCreateConversation?: () => void
  onMessageChange?: (message: string) => void
  onSendMessage?: (event: FormEvent<HTMLFormElement>) => void
  onReconnect?: () => void
  onAbort?: () => void
}) {
  const conversation = snapshot.conversation
  const project = snapshot.context.authorizedProjects.find((item) => item.projectId === snapshot.context.context.projectId)
  const latestTrace = conversation?.messages.at(-1)?.traceId
  return (
    <main className="industry-workspace-page" aria-labelledby="industry-workspace-title">
      <header className="workspace-heading">
        <div><span>Industry Agent · P3</span><h1 id="industry-workspace-title">Industry Workspace</h1><p>Mock end-to-end workspace. Scope is server-derived; no real MySQL/OpenSearch/LLM/mutation is used.</p></div>
        <a href="/industry/eval">Evaluation</a>
      </header>
      {error === null ? null : <p className="workspace-error" role="alert">{error}</p>}

      <div className="workspace-grid">
        <aside className="workspace-panel workspace-project" aria-label="Project Context">
          <h2>Project Context</h2>
          <label>Active project
            <select value={snapshot.context.context.projectId ?? ''} disabled={busy} onChange={(event) => onProjectChange(event.target.value)}>
              <option value="">Select project</option>
              {snapshot.context.authorizedProjects.map((item) => <option value={item.projectId} key={item.projectId}>{item.name}</option>)}
            </select>
          </label>
          <dl>
            <div><dt>Tenant</dt><dd><code>{snapshot.context.context.tenantId}</code></dd></div>
            <div><dt>Company</dt><dd><code>{snapshot.context.context.companyId ?? '—'}</code></dd></div>
            <div><dt>Project</dt><dd><code>{snapshot.context.context.projectId ?? '—'}</code></dd></div>
            <div><dt>Name</dt><dd>{project?.name ?? '—'}</dd></div>
          </dl>
          <button type="button" disabled={busy || snapshot.context.context.projectId === null} onClick={onCreateConversation}>New conversation</button>
          <p className="workspace-note">Project selection is the only browser-provided scope input. Tenant/user/company remain server-controlled.</p>
        </aside>

        <section className="workspace-panel workspace-conversation" aria-label="Conversation">
          <div className="workspace-panel-heading"><h2>Conversation</h2>{conversation === undefined ? null : <span data-status={conversation.status}>{conversation.status}</span>}</div>
          {conversation === undefined ? <div className="workspace-empty">Select a project and create a conversation.</div> : <>
            <div className="workspace-messages">
              {conversation.messages.length === 0 ? <p className="workspace-note">No messages yet. Send “演示全部 UIAction” to render the full registry.</p> : conversation.messages.map((item) => <article key={item.messageId} data-role={item.role}>
                <header><strong>{item.role === 'USER' ? 'You' : 'Industry Agent'}</strong><a href={`/industry/traces/${encodeURIComponent(item.traceId)}`}>trace</a></header>
                <p>{item.text}</p>
              </article>)}
              {snapshot.actions.map((action) => <UIActionRegistry action={action} key={action.actionId} />)}
            </div>
            <form className="workspace-composer" onSubmit={onSendMessage}>
              <textarea rows={3} value={message} disabled={busy || conversation.status !== 'ACTIVE'} onChange={(event) => onMessageChange(event.target.value)} placeholder="Ask about engineering data or type 演示全部 UIAction" />
              <div><button type="submit" disabled={busy || conversation.status !== 'ACTIVE' || message.trim() === ''}>Send</button><button type="button" disabled={busy} onClick={onReconnect}>Reconnect events</button><button type="button" disabled={busy || conversation.status !== 'ACTIVE'} onClick={onAbort}>Abort</button></div>
            </form>
          </>}
        </section>

        <aside className="workspace-panel workspace-inspector" aria-label="Context Inspector">
          <h2>Context Inspector</h2>
          <InspectorCard title="Tool Card"><strong>MockIndustryAgentClient</strong><span>fixture adapter · read-only P3</span></InspectorCard>
          <InspectorCard title="Citation"><span>Project fixture: {project?.name ?? 'no active project'}</span><span>Conversation events are the current evidence source.</span></InspectorCard>
          <InspectorCard title="Working Memory"><span>projectId: <code>{snapshot.context.context.projectId ?? '—'}</code></span><span>conversation: <code>{conversation?.conversationId ?? '—'}</code></span><span>event cursor: {conversation?.lastSequenceNo ?? 0}</span><span>UIActions: {snapshot.actions.length}</span></InspectorCard>
          <InspectorCard title="Trace link">{latestTrace === undefined ? <span>—</span> : <a href={`/industry/traces/${encodeURIComponent(latestTrace)}`}><code>{latestTrace}</code></a>}</InspectorCard>
          <InspectorCard title="Image upload"><input type="file" disabled aria-label="Image upload placeholder" /><span>Placeholder · enabled in a later phase</span></InspectorCard>
          <InspectorCard title="Export"><button type="button" disabled>Export placeholder</button><span>DataTable actions expose immutable snapshot references.</span></InspectorCard>
          <InspectorCard title="Event Gateway"><span>{snapshot.events.length} known events</span><span>eventId dedupe + monotonic sequence + reconnect cursor</span></InspectorCard>
        </aside>
      </div>
    </main>
  )
}

function InspectorCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="workspace-inspector-card"><h3>{title}</h3><div>{children}</div></section>
}

function actionsFromEvents(events: readonly IndustryEventEnvelope[]): readonly UiActionEnvelope[] {
  const actions: UiActionEnvelope[] = []
  for (const event of events) {
    if (event.type !== 'ui.action.presented' || !isUiActionPayload(event.payload)) continue
    actions.push(structuredClone(event.payload.action))
  }
  return actions
}

function isUiActionPayload(value: unknown): value is UiActionPresentedEventPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const action = (value as { action?: unknown }).action
  return typeof action === 'object'
    && action !== null
    && !Array.isArray(action)
    && (action as { schemaVersion?: unknown }).schemaVersion === 'ui-action-v1'
    && typeof (action as { actionId?: unknown }).actionId === 'string'
    && typeof (action as { type?: unknown }).type === 'string'
    && typeof (action as { traceId?: unknown }).traceId === 'string'
    && 'payload' in action
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
