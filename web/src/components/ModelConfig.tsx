import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConfigModelEntry, ConfigProvider, ModelsConfig } from '../../../shared/protocol'
import type { ChatState } from '../store'

const API_TYPES = ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai']

interface ModelConfigProps {
  state: ChatState
  onClose: () => void
  onSelectModel: (provider: string, modelId: string) => void
  onSelectThinking: (level: string) => void
  onGetConfig: () => Promise<ModelsConfig>
  onSaveConfig: (providers: Record<string, ConfigProvider>) => Promise<void>
}

export function ModelConfig({ state, onClose, onSelectModel, onSelectThinking, onGetConfig, onSaveConfig }: ModelConfigProps) {
  const [tab, setTab] = useState<'models' | 'services'>('models')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = state.models.filter(
      (model) =>
        q === '' ||
        `${model.provider}/${model.id}`.toLowerCase().includes(q) ||
        model.name.toLowerCase().includes(q),
    )
    const byProvider = new Map<string, typeof state.models>()
    for (const model of filtered) {
      const list = byProvider.get(model.provider) ?? []
      list.push(model)
      byProvider.set(model.provider, list)
    }
    return [...byProvider.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [state.models, query])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h2>模型配置</h2>
          <button className="ghost" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="config-tabs" role="tablist">
          <button
            className={`config-tab ${tab === 'models' ? 'active' : ''}`}
            onClick={() => setTab('models')}
            role="tab"
            aria-selected={tab === 'models'}
          >
            模型
          </button>
          <button
            className={`config-tab ${tab === 'services' ? 'active' : ''}`}
            onClick={() => setTab('services')}
            role="tab"
            aria-selected={tab === 'services'}
          >
            服务
          </button>
        </div>
        {tab === 'models' ? (
          <>
            <div className="current-model">
              <div className="current-model-name">{state.model !== null ? state.model.name : '未选择'}</div>
              {state.model !== null && (
                <div className="current-model-meta">
                  provider: {state.model.provider} · context: {state.model.contextWindow.toLocaleString()} · input:{' '}
                  {state.model.input.join(', ')}
                  {state.model.cost !== undefined &&
                    ` · $${state.model.cost.input}/$${state.model.cost.output} per Mtok`}
                </div>
              )}
            </div>
            <div className="thinking-row">
              <span className="thinking-label">thinking</span>
              {state.thinkingLevels.map((level) => (
                <button
                  key={level}
                  className={`chip ${state.thinkingLevel === level ? 'active' : ''}`}
                  onClick={() => onSelectThinking(level)}
                >
                  {level}
                </button>
              ))}
            </div>
            <input
              className="model-search"
              placeholder="搜索模型 (provider/id 或名称)"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
            <div className="model-list">
              {grouped.map(([provider, models]) => (
                <div key={provider}>
                  <div className="provider-name">{provider}</div>
                  {models.map((model) => (
                    <button
                      key={`${model.provider}/${model.id}`}
                      className={`model-row ${state.model?.provider === model.provider && state.model?.id === model.id ? 'active' : ''}`}
                      onClick={() => onSelectModel(model.provider, model.id)}
                    >
                      <span className="model-row-name">{model.name}</span>
                      <span className="model-row-meta">
                        {model.id}
                        {model.reasoning ? ' · reasoning' : ''}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
              {grouped.length === 0 && <div className="model-empty">无匹配模型</div>}
            </div>
          </>
        ) : (
          <ServicesTab onGetConfig={onGetConfig} onSaveConfig={onSaveConfig} />
        )}
      </div>
    </div>
  )
}

interface ModelRowState {
  key: number
  /** Original entry (or {} for a new row); spread on save so unknown keys survive. */
  entry: Partial<ConfigModelEntry>
  id: string
  name: string
  contextWindow: string
  reasoning: boolean
}

interface EditorState {
  isNew: boolean
  name: string
  baseUrl: string
  api: string
  apiKey: string
  supportsDeveloperRole: boolean
  supportsReasoningEffort: boolean
  original: ConfigProvider | null
  models: ModelRowState[]
}

function normalizeProviders(config: ModelsConfig): Record<string, ConfigProvider> {
  const providers: Record<string, ConfigProvider> = {}
  for (const [name, provider] of Object.entries(config.providers ?? {})) {
    providers[name] = { ...provider, models: Array.isArray(provider.models) ? provider.models : [] }
  }
  return providers
}

function buildModelEntry(row: ModelRowState): ConfigModelEntry {
  const entry: ConfigModelEntry = { ...row.entry, id: row.id.trim() }
  const name = row.name.trim()
  if (name === '') delete entry.name
  else entry.name = name
  const contextWindow = row.contextWindow.trim()
  if (contextWindow === '') delete entry.contextWindow
  else entry.contextWindow = Number(contextWindow)
  entry.reasoning = row.reasoning
  return entry
}

function buildProviderEntry(editor: EditorState): ConfigProvider {
  const models = editor.models.map(buildModelEntry)
  const compat = {
    ...(editor.original?.compat ?? {}),
    supportsDeveloperRole: editor.supportsDeveloperRole,
    supportsReasoningEffort: editor.supportsReasoningEffort,
  }
  const known = {
    baseUrl: editor.baseUrl.trim(),
    api: editor.api,
    apiKey: editor.apiKey,
    models,
    compat,
  }
  // Spread the original entry so unknown keys survive, then overwrite known fields.
  return editor.original !== null ? { ...editor.original, ...known } : { ...known }
}

function ServicesTab({ onGetConfig, onSaveConfig }: {
  onGetConfig: () => Promise<ModelsConfig>
  onSaveConfig: (providers: Record<string, ConfigProvider>) => Promise<void>
}) {
  const [providers, setProviders] = useState<Record<string, ConfigProvider> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const fetchGuard = useRef(false)
  const rowKeyRef = useRef(0)
  const nextRowKey = (): number => ++rowKeyRef.current

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setLoadError(null)
    try {
      const config = await onGetConfig()
      setProviders(normalizeProviders(config))
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [onGetConfig])

  useEffect(() => {
    // Fetch once per tab activation; the guard also covers StrictMode double effects.
    if (fetchGuard.current) return
    fetchGuard.current = true
    void load()
  }, [load])

  const showSaveError = (error: unknown): void => {
    setSaveError(error instanceof Error ? error.message : String(error))
  }

  const startAdd = (): void => {
    setSaveError(null)
    setEditor({
      isNew: true,
      name: '',
      baseUrl: '',
      api: 'openai-completions',
      apiKey: '',
      supportsDeveloperRole: true,
      supportsReasoningEffort: true,
      original: null,
      models: [{ key: nextRowKey(), entry: {}, id: '', name: '', contextWindow: '', reasoning: false }],
    })
  }

  const startEdit = (name: string, provider: ConfigProvider): void => {
    setSaveError(null)
    setEditor({
      isNew: false,
      name,
      baseUrl: provider.baseUrl ?? '',
      api: provider.api ?? 'openai-completions',
      apiKey: provider.apiKey ?? '',
      supportsDeveloperRole: provider.compat?.supportsDeveloperRole !== false,
      supportsReasoningEffort: provider.compat?.supportsReasoningEffort !== false,
      original: provider,
      models: provider.models.map((entry) => ({
        key: nextRowKey(),
        entry,
        id: entry.id ?? '',
        name: entry.name ?? '',
        contextWindow: entry.contextWindow !== undefined ? String(entry.contextWindow) : '',
        reasoning: entry.reasoning ?? false,
      })),
    })
  }

  const removeProvider = async (name: string): Promise<void> => {
    if (providers === null || !window.confirm(`删除服务 "${name}"？`)) return
    const next = { ...providers }
    delete next[name]
    setSaveError(null)
    try {
      await onSaveConfig(next)
      setProviders(next)
    } catch (error) {
      showSaveError(error)
    }
  }

  const validationErrors = useMemo((): string[] => {
    if (editor === null) return []
    const errors: string[] = []
    const name = editor.name.trim()
    if (name === '') errors.push('名称必填')
    else if (editor.isNew && providers !== null && name in providers) errors.push(`名称 "${name}" 已存在`)
    const baseUrl = editor.baseUrl.trim()
    if (baseUrl === '') errors.push('Base URL 必填')
    else if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      errors.push('Base URL 必须以 http:// 或 https:// 开头')
    }
    if (editor.models.length === 0) errors.push('至少需要一个模型')
    editor.models.forEach((row, index) => {
      if (row.id.trim() === '') errors.push(`模型 ${index + 1}: id 必填`)
      const contextWindow = row.contextWindow.trim()
      if (contextWindow !== '' && (!/^\d+$/.test(contextWindow) || Number(contextWindow) <= 0)) {
        errors.push(`模型 ${index + 1}: contextWindow 必须是正整数`)
      }
    })
    return errors
  }, [editor, providers])

  const save = async (): Promise<void> => {
    if (editor === null || providers === null || validationErrors.length > 0) return
    const next = { ...providers, [editor.name.trim()]: buildProviderEntry(editor) }
    setSaving(true)
    setSaveError(null)
    try {
      await onSaveConfig(next)
      setProviders(next)
      setEditor(null)
    } catch (error) {
      // Keep the editor open with its state so nothing typed is lost.
      showSaveError(error)
    } finally {
      setSaving(false)
    }
  }

  if (editor !== null) {
    const updateRow = (key: number, patch: Partial<ModelRowState>): void => {
      setEditor((current) => {
        if (current === null) return current
        return {
          ...current,
          models: current.models.map((row) => (row.key === key ? { ...row, ...patch } : row)),
        }
      })
    }
    return (
      <div className="provider-form">
        <label>
          名称
          <input
            value={editor.name}
            disabled={!editor.isNew}
            placeholder="my-provider"
            onChange={(event) => setEditor({ ...editor, name: event.target.value })}
          />
        </label>
        <label>
          Base URL
          <input
            value={editor.baseUrl}
            placeholder="https://api.example.com/v1"
            onChange={(event) => setEditor({ ...editor, baseUrl: event.target.value })}
          />
        </label>
        <label>
          API 类型
          <select value={editor.api} onChange={(event) => setEditor({ ...editor, api: event.target.value })}>
            {API_TYPES.map((api) => (
              <option key={api} value={api}>
                {api}
              </option>
            ))}
          </select>
        </label>
        <label>
          API Key
          <input
            type="password"
            value={editor.apiKey}
            placeholder="sk-..."
            onChange={(event) => setEditor({ ...editor, apiKey: event.target.value })}
          />
        </label>
        <details className="provider-compat" open>
          <summary>兼容性</summary>
          <label>
            <input
              type="checkbox"
              checked={editor.supportsDeveloperRole}
              onChange={(event) => setEditor({ ...editor, supportsDeveloperRole: event.target.checked })}
            />
            supportsDeveloperRole
          </label>
          <label>
            <input
              type="checkbox"
              checked={editor.supportsReasoningEffort}
              onChange={(event) => setEditor({ ...editor, supportsReasoningEffort: event.target.checked })}
            />
            supportsReasoningEffort
          </label>
        </details>
        <div className="model-rows">
          <div className="model-rows-header">
            <span>模型列表</span>
            <button
              className="ghost"
              onClick={() =>
                setEditor({
                  ...editor,
                  models: [...editor.models, { key: nextRowKey(), entry: {}, id: '', name: '', contextWindow: '', reasoning: false }],
                })
              }
            >
              添加模型
            </button>
          </div>
          {editor.models.map((row, index) => (
            <div className="model-row-edit" key={row.key}>
              <input
                placeholder={`模型 ${index + 1} id`}
                value={row.id}
                onChange={(event) => updateRow(row.key, { id: event.target.value })}
              />
              <input
                placeholder="名称"
                value={row.name}
                onChange={(event) => updateRow(row.key, { name: event.target.value })}
              />
              <input
                type="number"
                placeholder="contextWindow"
                value={row.contextWindow}
                onChange={(event) => updateRow(row.key, { contextWindow: event.target.value })}
              />
              <label className="model-row-reasoning">
                <input
                  type="checkbox"
                  checked={row.reasoning}
                  onChange={(event) => updateRow(row.key, { reasoning: event.target.checked })}
                />
                reasoning
              </label>
              <button
                className="ghost"
                onClick={() => setEditor({ ...editor, models: editor.models.filter((r) => r.key !== row.key) })}
              >
                删除
              </button>
            </div>
          ))}
        </div>
        {(validationErrors.length > 0 || saveError !== null) && (
          <div className="provider-form-error" role="alert">
            {saveError !== null && <div>{saveError}</div>}
            {validationErrors.map((error) => (
              <div key={error}>{error}</div>
            ))}
          </div>
        )}
        <div className="provider-form-actions">
          <button className="ghost" onClick={() => setEditor(null)}>
            取消
          </button>
          <button className="primary" disabled={validationErrors.length > 0 || saving} onClick={() => void save()}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="provider-list">
      <div className="provider-list-actions">
        <button className="ghost" onClick={startAdd}>
          新增服务
        </button>
      </div>
      {loading && <div className="model-empty">加载中…</div>}
      {loadError !== null && (
        <div className="provider-form-error" role="alert">
          <span>{loadError}</span>
          <button className="ghost" onClick={() => void load()}>
            重试
          </button>
        </div>
      )}
      {providers !== null &&
        Object.entries(providers).map(([name, provider]) => (
          <div className="provider-row" key={name}>
            <div className="provider-row-info">
              <div className="provider-row-name">{name}</div>
              <div className="provider-row-meta">
                {provider.baseUrl} · {(provider.models ?? []).length} 个模型
              </div>
            </div>
            <div className="provider-row-actions">
              <button className="ghost" onClick={() => startEdit(name, provider)}>
                编辑
              </button>
              <button className="ghost" onClick={() => void removeProvider(name)}>
                删除
              </button>
            </div>
          </div>
        ))}
      {providers !== null && Object.keys(providers).length === 0 && !loading && loadError === null && (
        <div className="model-empty">暂无自定义服务，点击「新增服务」添加</div>
      )}
      {saveError !== null && (
        <div className="provider-form-error" role="alert">
          {saveError}
        </div>
      )}
    </div>
  )
}
