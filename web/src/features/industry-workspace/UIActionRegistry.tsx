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
  UiActionTablePayload,
} from '../../../../shared/industry/ui-actions'

export function UIActionRegistry({ action }: { action: UiActionEnvelope }) {
  return (
    <section className="ui-action" data-ui-action={action.type} aria-label={`UI action: ${action.type}`}>
      <header><strong>{action.type}</strong><code>{action.actionId}</code></header>
      <UIActionBody action={action} />
      <footer>trace <code>{action.traceId}</code></footer>
    </section>
  )
}

function UIActionBody({ action }: { action: UiActionEnvelope }) {
  switch (action.type) {
    case 'entity_picker': return <EntityPicker payload={action.payload as EntityPickerPayload} />
    case 'form': return <FormView payload={action.payload as FormPayload} editable={false} />
    case 'editable_form': return <EditableFormView payload={action.payload as EditableFormPayload} />
    case 'table': return <TableView payload={action.payload as UiActionTablePayload} />
    case 'multi_select': return <MultiSelectView payload={action.payload as MultiSelectPayload} />
    case 'date_picker': return <DatePickerView payload={action.payload as DatePickerPayload} />
    case 'diff': return <DiffView payload={action.payload as DiffPayload} />
    case 'mutation_confirmation': return <MutationConfirmationView payload={action.payload as MutationConfirmationPayload} />
    case 'report_preview': return <ReportPreviewView payload={action.payload as ReportPreviewPayload} />
    case 'error_resolution': return <ErrorResolutionView payload={action.payload as ErrorResolutionPayload} />
  }
}

function EntityPicker({ payload }: { payload: EntityPickerPayload }) {
  return <div><h4>{payload.title}</h4><p>{payload.entityType} · {payload.multi ? 'multi' : 'single'}</p>{payload.options.map((option) => (
    <label key={option.id} className="ui-action-option"><input type={payload.multi ? 'checkbox' : 'radio'} readOnly checked={payload.selectedEntityIds.includes(option.id)} /><span><strong>{option.label}</strong>{option.description === undefined ? null : <small>{option.description}</small>}</span></label>
  ))}</div>
}

function FormView({ payload, editable }: { payload: FormPayload; editable: boolean }) {
  return <div><h4>{payload.title}</h4><div className="ui-action-fields">{payload.fields.map((field) => (
    <label key={field.key}>{field.label}<input readOnly={!editable || field.readOnly === true} value={field.value === null ? '' : String(field.value)} /></label>
  ))}</div><button type="button" disabled>{payload.submitLabel}</button></div>
}

function EditableFormView({ payload }: { payload: EditableFormPayload }) {
  return <div><p>Version <code>{payload.version}</code></p><FormView payload={payload} editable /></div>
}

function TableView({ payload }: { payload: UiActionTablePayload }) {
  return <div><h4>{payload.title}</h4><div className="ui-action-table-wrap"><table><thead><tr><th>Select</th>{payload.columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{payload.rows.map((row) => (
    <tr key={row.rowId}><td><input type="checkbox" readOnly checked={payload.selectedRowIds.includes(row.rowId)} /></td>{payload.columns.map((column) => <td key={column.key}>{String(row.cells[column.key] ?? '')}</td>)}</tr>
  ))}</tbody></table></div><div className="ui-action-meta"><span>cursor <code>{payload.pagination.stableCursor}</code></span><span>next <code>{payload.pagination.nextCursor ?? '—'}</code></span><span>sort: {payload.sortAllowlist.join(', ')}</span><span>filter: {payload.filterAllowlist.join(', ')}</span><span>export <code>{payload.exportSnapshotRef}</code></span></div></div>
}

function MultiSelectView({ payload }: { payload: MultiSelectPayload }) {
  return <div><h4>{payload.title}</h4>{payload.options.map((option) => <label key={option.id} className="ui-action-option"><input type="checkbox" readOnly checked={payload.selectedIds.includes(option.id)} />{option.label}</label>)}</div>
}

function DatePickerView({ payload }: { payload: DatePickerPayload }) {
  return <div><h4>{payload.title}</h4><input type="date" readOnly value={payload.value ?? ''} min={payload.min} max={payload.max} /></div>
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
