import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { ConfigProvider, ModelsConfig } from '../../shared/protocol'
import { ChatView } from './components/ChatView'
import { Composer } from './components/Composer'
import { ModelConfig } from './components/ModelConfig'
import { StatusBar } from './components/StatusBar'
import { reducer, type ChatState } from './store'
import { RpcSocket } from './ws-client'

const initialState: ChatState = {
  connected: false,
  streaming: false,
  sessionId: null,
  model: null,
  thinkingLevel: null,
  models: [],
  thinkingLevels: [],
  items: [],
  notice: null,
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [configOpen, setConfigOpen] = useState(false)
  const [sending, setSending] = useState(false)
  // Bumped after a models.json save: recycles the WS connection so a fresh pi
  // child re-reads the config file.
  const [connEpoch, setConnEpoch] = useState(0)
  // Set right before an epoch bump: the next connection carries ?continue=1 so
  // the fresh pi child resumes the current session instead of a new one.
  const pendingContinueRef = useRef(false)
  const socketRef = useRef<RpcSocket | null>(null)

  const runRefresh = useCallback((socket: RpcSocket): void => {
    for (const command of ['get_state', 'get_messages', 'get_available_models', 'get_available_thinking_levels']) {
      void socket
        .request({ type: command })
        .then((response) => dispatch({ type: 'rpc_response', response }))
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    const baseWsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
    const wsUrl = pendingContinueRef.current ? `${baseWsUrl}?continue=1` : baseWsUrl
    const socket = new RpcSocket(wsUrl, {
      onEvent: (event) => {
        if (socketRef.current !== socket) return
        dispatch({ type: 'rpc_event', event })
      },
      onStatus: (connected) => {
        if (socketRef.current !== socket) return
        if (connected) pendingContinueRef.current = false
        dispatch({ type: connected ? 'connected' : 'disconnected' })
        if (connected) runRefresh(socket)
      },
    })
    socketRef.current = socket
    socket.connect()
    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [runRefresh, connEpoch])

  useEffect(() => {
    if (state.streaming) setSending(false)
  }, [state.streaming])

  const sendCommand = useCallback((command: Record<string, unknown>) => {
    const socket = socketRef.current
    if (socket === null) return Promise.reject(new Error('not connected'))
    return socket.request(command).then((response) => {
      // Config commands surface errors inline in the model modal; keep them out
      // of the global notice banner.
      if (!String(command.type).startsWith('config_')) dispatch({ type: 'rpc_response', response })
      return response
    })
  }, [])

  const onSend = (text: string): void => {
    if (state.streaming || sending) return
    dispatch({ type: 'optimistic_user', text })
    setSending(true)
    sendCommand({ type: 'prompt', message: text })
      .then((response) => {
        setSending(false)
        if (!response.success) dispatch({ type: 'prompt_failed', text })
      })
      .catch(() => {
        setSending(false)
        dispatch({ type: 'prompt_failed', text })
      })
  }

  const onStop = (): void => {
    sendCommand({ type: 'abort' }).catch(() => {})
  }

  const onRegenerate = (): void => {
    if (state.streaming || sending) return
    for (let i = state.items.length - 1; i >= 0; i--) {
      const item = state.items[i]
      if (item.kind === 'user') {
        setSending(true)
        sendCommand({ type: 'prompt', message: item.text })
          .then((response) => {
            setSending(false)
            if (!response.success) dispatch({ type: 'prompt_failed', text: item.text })
          })
          .catch(() => {
            setSending(false)
            dispatch({ type: 'prompt_failed', text: item.text })
          })
        return
      }
    }
  }

  const onNewSession = (): void => {
    if (state.streaming || sending) return
    sendCommand({ type: 'new_session' })
      .then(() => {
        const socket = socketRef.current
        if (socket !== null) runRefresh(socket)
      })
      .catch(() => {})
  }

  const onSelectModel = (provider: string, modelId: string): void => {
    sendCommand({ type: 'set_model', provider, modelId })
      .then(() => sendCommand({ type: 'get_available_thinking_levels' }))
      .then(() => sendCommand({ type: 'get_state' }))
      .catch(() => {})
  }

  const onSelectThinking = (level: string): void => {
    sendCommand({ type: 'set_thinking_level', level })
      .then(() => sendCommand({ type: 'get_state' }))
      .catch(() => {})
  }

  const onGetConfig = useCallback((): Promise<ModelsConfig> => {
    return sendCommand({ type: 'config_get_models' }).then((response) => {
      if (!response.success) throw new Error(response.error ?? 'config_get_models failed')
      return response.data as ModelsConfig
    })
  }, [sendCommand])

  const onSaveConfig = useCallback((providers: Record<string, ConfigProvider>): Promise<void> => {
    return sendCommand({ type: 'config_save_models', providers }).then((response) => {
      if (!response.success) throw new Error(response.error ?? 'config_save_models failed')
      // Recycle the connection with ?continue=1: the fresh pi child picks up the
      // new models.json AND resumes the current session (pi falls back to a new
      // session when none exists), then runRefresh pulls the updated model list.
      // Multi-tab caveat: pi has no session locking, so with two tabs live the
      // resumed session may be the OTHER tab's (same exposure as running
      // `pi --continue` twice; single-user localhost tool, accepted).
      pendingContinueRef.current = true
      setConnEpoch((epoch) => epoch + 1)
    })
  }, [sendCommand])

  const hasUserMessage = state.items.some((item) => item.kind === 'user')

  return (
    <div className="app">
      <StatusBar state={state} onOpenModelConfig={() => setConfigOpen(true)} />
      {state.notice !== null && (
        <div className="notice" role="alert">
          <span>{state.notice}</span>
          <button onClick={() => dispatch({ type: 'notice_cleared' })} aria-label="关闭提示">×</button>
        </div>
      )}
      <ChatView items={state.items} streaming={state.streaming} />
      <Composer
        streaming={state.streaming}
        busy={state.streaming || sending}
        hasUserMessage={hasUserMessage}
        onSend={onSend}
        onStop={onStop}
        onRegenerate={onRegenerate}
        onNewSession={onNewSession}
      />
      {configOpen && (
        <ModelConfig
          state={state}
          onClose={() => setConfigOpen(false)}
          onSelectModel={onSelectModel}
          onSelectThinking={onSelectThinking}
          onGetConfig={onGetConfig}
          onSaveConfig={onSaveConfig}
        />
      )}
    </div>
  )
}
