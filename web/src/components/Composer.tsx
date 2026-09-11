import { useState, type KeyboardEvent } from 'react'

interface ComposerProps {
  streaming: boolean
  hasUserMessage: boolean
  onSend: (text: string) => void
  onStop: () => void
  onRegenerate: () => void
  onNewSession: () => void
}

export function Composer({ streaming, hasUserMessage, onSend, onStop, onRegenerate, onNewSession }: ComposerProps) {
  const [text, setText] = useState('')

  const submit = (): void => {
    const trimmed = text.trim()
    if (trimmed === '' || streaming) return
    onSend(trimmed)
    setText('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <div className="composer">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder={streaming ? '流式响应中…' : '输入消息，Enter 发送，Shift+Enter 换行'}
        rows={3}
      />
      <div className="composer-actions">
        <button className="ghost" onClick={onNewSession}>
          新会话
        </button>
        {hasUserMessage && (
          <button className="ghost" onClick={onRegenerate}>
            重新生成
          </button>
        )}
        {streaming ? (
          <button className="primary stop" onClick={onStop}>
            停止
          </button>
        ) : (
          <button className="primary" onClick={submit}>
            发送
          </button>
        )}
      </div>
    </div>
  )
}
