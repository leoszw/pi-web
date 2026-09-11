import { useEffect, useRef, useState } from 'react'
import type { ChatItem } from '../store'
import { Markdown } from './Markdown'
import { ToolCallCard } from './ToolCallCard'

export function ChatView({ items, streaming }: { items: ChatItem[]; streaming: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)

  useEffect(() => {
    if (follow) bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [items, follow, streaming])

  const onScroll = (): void => {
    const el = containerRef.current
    if (el === null) return
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }

  const jumpToBottom = (): void => {
    setFollow(true)
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }

  return (
    <div className="chat-view" ref={containerRef} onScroll={onScroll}>
      {items.map((item) => (
        <ItemView key={item.key} item={item} />
      ))}
      {streaming && <div className="streaming-indicator">…</div>}
      <div ref={bottomRef} />
      {!follow && (
        <button className="jump-bottom" onClick={jumpToBottom}>
          回到底部
        </button>
      )}
    </div>
  )
}

function ItemView({ item }: { item: ChatItem }) {
  if (item.kind === 'user') {
    return (
      <div className="user-message">
        <div className="user-bubble">{item.text}</div>
      </div>
    )
  }
  if (item.kind === 'tool') {
    return <ToolCallCard item={item} />
  }
  return (
    <div className="assistant-message">
      {item.thinking !== '' && (
        <details className="thinking">
          <summary>thinking</summary>
          <div className="thinking-body">{item.thinking}</div>
        </details>
      )}
      {item.text !== '' && <Markdown text={item.text} />}
    </div>
  )
}
