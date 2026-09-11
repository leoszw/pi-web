import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
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
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
    const socket = new RpcSocket(wsUrl, {
      onEvent: (event) => dispatch({ type: 'rpc_event', event }),
      onStatus: (connected) => {
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
  }, [runRefresh])

  const sendCommand = useCallback((command: Record<string, unknown>) => {
    const socket = socketRef.current
    if (socket === null) return Promise.reject(new Error('not connected'))
    return socket.request(command).then((response) => {
      dispatch({ type: 'rpc_response', response })
      return response
    })
  }, [])

  const onSend = (text: string): void => {
    dispatch({ type: 'optimistic_user', text })
    sendCommand({ type: 'prompt', message: text }).catch(() => {
      dispatch({ type: 'prompt_failed', text })
    })
  }

  const onStop = (): void => {
    sendCommand({ type: 'abort' }).catch(() => {})
  }

  const onRegenerate = (): void => {
    for (let i = state.items.length - 1; i >= 0; i--) {
      const item = state.items[i]
      if (item.kind === 'user') {
        sendCommand({ type: 'prompt', message: item.text }).catch(() => {
          dispatch({ type: 'prompt_failed', text: item.text })
        })
        return
      }
    }
  }

  const onNewSession = (): void => {
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
      .catch(() => {})
  }

  const onSelectThinking = (level: string): void => {
    sendCommand({ type: 'set_thinking_level', level })
      .then(() => sendCommand({ type: 'get_state' }))
      .catch(() => {})
  }

  const hasUserMessage = state.items.some((item) => item.kind === 'user')

  return (
    <div className="app">
      <StatusBar state={state} onOpenModelConfig={() => setConfigOpen(true)} />
      {state.notice !== null && (
        <div className="notice">
          <span>{state.notice}</span>
          <button onClick={() => dispatch({ type: 'notice_cleared' })}>×</button>
        </div>
      )}
      <ChatView items={state.items} streaming={state.streaming} />
      <Composer
        streaming={state.streaming}
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
        />
      )}
    </div>
  )
}
