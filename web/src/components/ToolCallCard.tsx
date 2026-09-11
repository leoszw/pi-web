import { useState } from 'react'
import type { ToolItem } from '../store'

const statusDot: Record<ToolItem['status'], string> = {
  running: 'dot-running',
  done: 'dot-done',
  error: 'dot-error',
}

const statusLabel: Record<ToolItem['status'], string> = {
  running: 'running',
  done: 'done',
  error: 'error',
}

export function ToolCallCard({ item }: { item: ToolItem }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="tool-card">
      <button className="tool-header" onClick={() => setOpen((value) => !value)}>
        <span className={`dot ${statusDot[item.status]}`} />
        <span className="tool-name">{item.name}</span>
        <span className="tool-status">{statusLabel[item.status]}</span>
      </button>
      {open && (
        <div className="tool-body">
          {item.args !== '' && <pre className="tool-args">{item.args}</pre>}
          {item.output !== '' && <pre className="tool-output">{item.output}</pre>}
        </div>
      )}
    </div>
  )
}
