import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import CodingChatApp from '../App'
import { IndustryDashboard } from '../features/industry-dashboard/IndustryDashboard'
import { resolveAppRoute, routePath, type AppRoute } from './routes'
import './app-shell.css'

export interface AppShellProps {
  initialPath?: string
  codingChat?: ReactNode
}

export function AppShell({ initialPath, codingChat }: AppShellProps) {
  const [route, setRoute] = useState<AppRoute>(() => resolveAppRoute(initialPath ?? currentPath()))

  useEffect(() => {
    if (initialPath !== undefined) return undefined
    const onPopState = (): void => setRoute(resolveAppRoute(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [initialPath])

  const navigate = (target: AppRoute) => (event: MouseEvent<HTMLAnchorElement>): void => {
    if (initialPath !== undefined) return
    event.preventDefault()
    const path = routePath(target)
    if (window.location.pathname !== path) window.history.pushState({}, '', path)
    setRoute(target)
  }

  return (
    <div className="app-shell">
      <nav className="app-shell__nav" aria-label="主导航">
        <a href="/chat" data-active={route === 'chat'} onClick={navigate('chat')}>Coding Chat</a>
        <a href="/industry" data-active={route === 'industry'} onClick={navigate('industry')}>Industry Agent</a>
      </nav>
      <div className="app-shell__content">
        {route === 'industry' ? <IndustryDashboard /> : (codingChat ?? <CodingChatApp />)}
      </div>
    </div>
  )
}

function currentPath(): string {
  return typeof window === 'undefined' ? '/chat' : window.location.pathname
}
