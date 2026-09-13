import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import CodingChatApp from '../App'
import { EvalOverviewPage } from '../features/eval/EvalOverviewPage'
import { IntentLabPage } from '../features/eval/IntentLabPage'
import { RetrievalLabPage } from '../features/eval/RetrievalLabPage'
import { RetrievalRunPage } from '../features/eval/RetrievalRunPage'
import { IndustryDashboard } from '../features/industry-dashboard/IndustryDashboard'
import { isIndustryRoute, resolveAppRoute, retrievalRunIdFromPath, routePath, type AppRoute } from './routes'
import './app-shell.css'

export interface AppShellProps {
  initialPath?: string
  codingChat?: ReactNode
  evalOverview?: ReactNode
  intentLab?: ReactNode
  retrievalLab?: ReactNode
  retrievalRun?: ReactNode
}

export function AppShell({ initialPath, codingChat, evalOverview, intentLab, retrievalLab, retrievalRun }: AppShellProps) {
  const [route, setRoute] = useState<AppRoute>(() => resolveAppRoute(initialPath ?? currentPath()))
  const pathname = initialPath ?? currentPath()
  const retrievalRunId = retrievalRunIdFromPath(pathname)

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
        <a href="/industry/eval" data-active={isIndustryRoute(route) && route !== 'industry'} onClick={navigate('industry-eval')}>Evaluation</a>
      </nav>
      <div className="app-shell__content">
        <AppContent
          route={route}
          retrievalRunId={retrievalRunId}
          codingChat={codingChat}
          evalOverview={evalOverview}
          intentLab={intentLab}
          retrievalLab={retrievalLab}
          retrievalRun={retrievalRun}
        />
      </div>
    </div>
  )
}

function AppContent({
  route,
  retrievalRunId,
  codingChat,
  evalOverview,
  intentLab,
  retrievalLab,
  retrievalRun,
}: {
  route: AppRoute
  retrievalRunId: string | null
  codingChat?: ReactNode
  evalOverview?: ReactNode
  intentLab?: ReactNode
  retrievalLab?: ReactNode
  retrievalRun?: ReactNode
}) {
  if (route === 'industry-eval-retrieval-run' && retrievalRunId !== null) {
    return retrievalRun ?? <RetrievalRunPage runId={retrievalRunId} />
  }
  if (route === 'industry-eval-retrieval') return retrievalLab ?? <RetrievalLabPage />
  if (route === 'industry-eval-intent') return intentLab ?? <IntentLabPage />
  if (route === 'industry-eval') return evalOverview ?? <EvalOverviewPage />
  if (route === 'industry') return <IndustryDashboard />
  return codingChat ?? <CodingChatApp />
}

function currentPath(): string {
  return typeof window === 'undefined' ? '/chat' : window.location.pathname
}
