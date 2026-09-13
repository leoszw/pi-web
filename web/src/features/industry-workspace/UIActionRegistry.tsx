import { useEffect, useState, type FormEvent } from 'react'
import type {
  DatePickerPayload,
  DiffPayload,
  EditableFormPayload,
  EntityPickerPayload,
  ErrorResolutionPayload,
  FormPayload,
  MultiSelectPayload,
  MutationConfirmationPayload,
  ReportPreviewPayload,
  UiActionEnvelope,
  UiActionInteraction,
  UiActionPrimitive,
  UiActionTablePayload,
} from '../../../../shared/industry/ui-actions'

export type UiActionInteractionHandler = (action: UiActionEnvelope, interaction: UiActionInteraction) => void

export function UIActionRegistry({
  action,
  busy = false,
  onInteract = () => undefined,
}: {
  action: UiActionEnvelope
  busy?: boolean
  onInteract?: UiActionInteractionHandler
}) {
  return (
    <section className="ui-action" data-ui-action={action.type} aria-label={`UI action: ${action.type}`}>
      <header><strong>{action.type}</strong><code>{action.actionId}</code></header>
      <UIActionBody action={action} busy={busy} onInteract={onInteract} />
      <footer>trace <code>{action.traceId}</code></footer>
    </section>
  )
}

function UIActionBody({
  action,
  busy,
  onInteract,
}: {
  action: UiActionEnvelope
  busy: boolean
  onInteract: UiActionInteractionHandler
}) {
  switch (action.type) {
    case 'entity_picker': return <EntityPicker action={action} payload={action.payload as EntityPickerPayload} busy={busy} onInteract={onInteract} />
    case 'form': return <FormView action={action} payload={action.payload as FormPayload} editable={false} busy={busy} onInteract={onInteract} />
    case 'editable_form': return <EditableFormView action={action} payload={action.payload as EditableFormPayload} busy={busy} onInteract={onInteract} />
    case 'table': return <TableView action={action} payload={action.payload as UiActionTablePayload} busy={busy} onInteract={onInteract} />
    case 'multi_select': return <MultiSelectView action={action} payload={action.payload as MultiSelectPayload} busy={busy} onInteract={onInteract} />
    case 'date_picker': return <DatePickerView action={action} payload={action.payload as DatePickerPayload} busy={busy} onInteract={onInteract} />
    case 'diff': return <DiffView payload={action.payload as DiffPayload} />
    case 'mutation_confirmation': return <MutationConfirmationView payload={action.payload as MutationConfirmationPayload} />
    case 'report_preview': return <ReportPreviewView payload={action.payload as ReportPreviewPayload} />
    case 'error_resolution': return <ErrorResolutionView payload={action.payload as ErrorResolutionPayload} />
  }
}

function EntityPicker({
  action,
  payload,
  busy,
  onInteract,
}: {
  action: UiActionEnvelope
  payload: EntityPickerPayload
  busy: boolean
  onInteract: UiActionInteractionHandler
}) {
  function toggle(id: string, checked: boolean): void {
    const selected = new Set(payload.selectedEntityIds)
    if (payload.multi) {
      if (checked) selected.add(id)
      else selected.delete(id)
    } else {
      selected.clear()
      if (checked) selected.add(id)
    }
    onInteract(action, { kind: 'entity_selection', selectedEntityIds: [...selected] })
  }
  return <div><h4>{payload.title}</h4><p>{payload.entityType} · {payload.multi ? 'multi' : 'single'}</p>{payload.options.map((option) => (
    <label key={option.id} className="ui-action-option"><input type={payload.multi ? 'checkbox' : 'radio'} disabled={busy} checked={payload.selectedEntityIds.includes(option.id)} onChange={(event) => toggle(option.id, event.target.checked)} /><span><strong>{option.label}</strong>{option.description === undefined ? null : <small>{option.description}</small>}</span></label>
  ))}</div>
}

function FormView({
  action,
  payload,
  editable,
  busy,
  onInteract,
}: {
  action: UiActionEnvelope
  payload: FormPayload
  editable: boolean
  busy: boolean
  onInteract: UiActionInteractionHandler
}) {
  const [values, setValues] = useState<Record<string, UiActionPrimitive>>(() => Object.fromEntries(payload.fields.map((field) => [field.key, field.value])))
  useEffect(() => {
    setValues(Object.fromEntries(payload.fields.map((field) => [field.key, field.value])))
  }, [payload])
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    onInteract(action, { kind: 'form_submit', values })
  }
  return <form onSubmit={submit}><h4>{payload.title}</h4><div className="ui-action-fields">{payload.fields.map((field) => (
    <label key={field.key}>{field.label}<input disabled={busy || !editable || field.readOnly === true} value={String(values[field.key] ?? '')} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} /></label>
  ))}</div><button type="submit" disabled={busy}>{payload.submitLabel}</button></form>
}

function EditableFormView({
  action,
  payload,
  busy,
  onInteract,
}: {
  action: UiActionEnvelope
  payload: EditableFormPayload
  busy: boolean
  onInteract: UiActionInteractionHandler
}) {
  return <div><p>Version <code>{payload.version}</code></p><FormView action={action} payload={payload} editable busy={busy} onInteract={onInteract} /></div>
}

function TableView({
  action,
  payload,
  busy,
  onInteract,
}: {
  action: UiActionEnvelope
  payload: UiActionTablePayload
  busy: boolean
  onInteract: UiActionInteractionHandler
}) {
  const [sortKey, setSortKey] = useState('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [filterKey, setFilterKey] = useState(payload.filterAllowlist[0] ?? '')
  const [filterValue, setFilterValue] = useState('')
  const tableQuery = (cursor?: string): UiActionInteraction => ({
    kind: 'table_query',
    pageSize: payload.pagination.pageSize,
    ...(cursor === undefined ? {} : { cursor }),
    ...(sortKey === '' ? {} : { sort: { key: sortKey, direction: sortDirection } }),
    ...(filterKey === '' || filterValue.trim() === '' ? {} : { filters: [{ key: filterKey, value: filterValue.trim() }] }),
  })
  function toggleRow(rowId: string, checked: boolean): void {
    const selected = new Set(payload.selectedRowIds)
    if (checked) selected.add(rowId)
    else selected.delete(rowId)
    onInteract(action, { kind: 'table_selection', selectedRowIds: [...selected] })
  }
  return <div><h4>{payload.title}</h4>
    <div className="ui-action-table-controls">
      <label>Sort<select value={sortKey} disabled={busy} onChange={(event) => setSortKey(event.target.value)}><option value="">Default</option>{payload.sortAllowlist.map((key) => <option value={key} key={key}>{key}</option>)}</select></label>
      <label>Direction<select value={sortDirection} disabled={busy || sortKey === ''} onChange={(event) => setSortDirection(event.target.value as 'asc' | 'desc')}><option value="asc">asc</option><option value="desc">desc</option></select></label>
      <label>Filter<select value={filterKey} disabled={busy} onChange={(event) => setFilterKey(event.target.value)}>{payload.filterAllowlist.map((key) => <option value={key} key={key}>{key}</option>)}</select></label>
      <label>Contains<input value={filterValue} disabled={busy} onChange={(event) => setFilterValue(event.target.value)} /></label>
      <button type="button" disabled={busy} onClick={() => onInteract(action, tableQuery())}>Apply server query</button>
    </div>
    <div className="ui-action-table-wrap"><table><thead><tr><th>Select</th>{payload.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{payload.rows.map((row) => (
      <tr key={row.rowId}><td><input type="checkbox" disabled={busy} checked={payload.selectedRowIds.includes(row.rowId)} onChange={(event) => toggleRow(row.rowId, event.target.checked)} /></td>{payload.columns.map((column) => <td key={column.key}>{String(row.cells[column.key] ?? '')}</td>)}</tr>
    ))}</tbody></table></div>
    <div className="ui-action-table-pager"><button type="button" disabled={busy || payload.pagination.previousCursor === undefined} onClick={() => payload.pagination.previousCursor === undefined ? undefined : onInteract(action, tableQuery(payload.pagination.previousCursor))}>Previous</button><span>{payload.rows.length} / {payload.pagination.totalRows} rows</span><button type="button" disabled={busy || payload.pagination.nextCursor === undefined} onClick={() => payload.pagination.nextCursor === undefined ? undefined : onInteract(action, tableQuery(payload.pagination.nextCursor))}>Next</button></div>
    <div className="ui-action-meta"><span>cursor <code>{payload.pagination.stableCursor}</code></span><span>next <code>{payload.pagination.nextCursor ?? '—'}</code></span><span>sort: {payload.sortAllowlist.join(', ')}</span><span>filter: {payload.filterAllowlist.join(', ')}</span><span>export <code>{payload.exportSnapshotRef}</code></span></div>
  </div>
}

function MultiSelectView({
  action,
  payload,
  busy,
  onInteract,
}: {
  action: UiActionEnvelope
  payload: MultiSelectPayload
  busy: boolean
  onInteract: UiActionInteractionHandler
}) {
  function toggle(id: string, checked: boolean): void {
    const selected = new Set(payload.selectedIds)
    if (checked) selected.add(id)
    else selected.delete(id)
    onInteract(action, { kind: 'multi_select', selectedIds: [...selected] })
  }
  return <div><h4>{payload.title}</h4>{payload.options.map((option) => <label key={option.id} className="ui-action-option"><input type="checkbox" disabled={busy} checked={payload.selectedIds.includes(option.id)} onChange={(event) => toggle(option.id, event.target.checked)} />{option.label}</label>)}</div>
}

function DatePickerView({
  action,
  payload,
  busy,
  onInteract,
}: {
  action: UiActionEnvelope
  payload: DatePickerPayload
  busy: boolean
  onInteract: UiActionInteractionHandler
}) {
  return <div><h4>{payload.title}</h4><input type="date" disabled={busy} value={payload.value ?? ''} min={payload.min} max={payload.max} onChange={(event) => onInteract(action, { kind: 'date_select', value: event.target.value === '' ? null : event.target.value })} /></div>
}

function DiffView({ payload }: { payload: DiffPayload }) {
  return <div><h4>{payload.title}</h4><table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{payload.entries.map((entry) => <tr key={entry.field}><td>{entry.label}</td><td>{String(entry.before ?? '')}</td><td>{String(entry.after ?? '')}</td></tr>)}</tbody></table></div>
}

function MutationConfirmationView({ payload }: { payload: MutationConfirmationPayload }) {
  return <div><h4>{payload.title}</h4><p>{payload.summary}</p><p className="workspace-warning">{payload.warning}</p><dl><div><dt>operation</dt><dd><code>{payload.operationId}</code></dd></div><div><dt>digest</dt><dd><code>{payload.digest}</code></dd></div></dl><button type="button" disabled>Confirmation handled in P4</button></div>
}

function ReportPreviewView({ payload }: { payload: ReportPreviewPayload }) {
  return <div><h4>{payload.title}</h4><p>{payload.summary}</p><p>{payload.format} · <code>{payload.snapshotRef}</code></p><button type="button" disabled>Export placeholder</button></div>
}

function ErrorResolutionView({ payload }: { payload: ErrorResolutionPayload }) {
  return <div><h4>{payload.title}</h4><p className="workspace-error">{payload.code}: {payload.message}</p><p>Resolution: <strong>{payload.resolution}</strong></p></div>
}
