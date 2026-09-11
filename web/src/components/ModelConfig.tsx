import { useMemo, useState } from 'react'
import type { ChatState } from '../store'

interface ModelConfigProps {
  state: ChatState
  onClose: () => void
  onSelectModel: (provider: string, modelId: string) => void
  onSelectThinking: (level: string) => void
}

export function ModelConfig({ state, onClose, onSelectModel, onSelectThinking }: ModelConfigProps) {
  const [query, setQuery] = useState('')

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
      </div>
    </div>
  )
}
