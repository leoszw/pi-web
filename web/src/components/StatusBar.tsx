import type { ChatState } from '../store'

export function StatusBar({ state, onOpenModelConfig }: { state: ChatState; onOpenModelConfig: () => void }) {
  return (
    <div className="status-bar">
      <span className={`conn ${state.connected ? 'on' : 'off'}`}>{state.connected ? '已连接' : '未连接'}</span>
      <button className="model-button" onClick={onOpenModelConfig}>
        {state.model !== null ? `${state.model.provider}/${state.model.name}` : '未选择模型'}
        {state.thinkingLevel !== null ? ` · ${state.thinkingLevel}` : ''}
      </button>
      <span className="spacer" />
      {state.sessionId !== null && <span className="session-id">{state.sessionId.slice(0, 8)}</span>}
      {state.streaming && <span className="streaming-badge">streaming</span>}
    </div>
  )
}
