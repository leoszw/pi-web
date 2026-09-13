import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import CodingChatApp from '../App'
import { EvalOverviewPage } from '../features/eval/EvalOverviewPage'
import { IntentLabPage } from '../features/eval/IntentLabPage'
import { MutationEvalPage } from '../features/eval/MutationEvalPage'
import { RetrievalLabPage } from '../features/eval/RetrievalLabPage'
import { RetrievalRunPage } from '../features/eval/RetrievalRunPage'
import { IndustryWorkspacePage } from '../features/industry-workspace/IndustryWorkspacePage'
import { MutationCenterPage } from '../features/mutation-center/MutationCenterPage'
import { TracePage } from '../features/trace/TracePage'
import {
  isEvaluationRoute,
  isMutationRoute,
  isTraceRoute,
  mutationEvalRunIdFromPath,
  mutationOperationIdFromPath,
  resolveAppRoute,
  retrievalRunIdFromPath,
  routePath,
  traceIdFromPath,
  type AppRoute,
} from './routes'
import './app-shell.css'

export interface AppShellProps {
  initialPath?: string
  codingChat?: ReactNode
  industryWorkspace?: ReactNode
  traceExplorer?: ReactNode
  mutationCenter?: ReactNode
  evalOverview?: ReactNode
  intentLab?: ReactNode
  retrievalLab?: ReactNode
  retrievalRun?: ReactNode
  mutationEval?: ReactNode
}

export function AppShell({ initialPath, codingChat, industryWorkspace, traceExplorer, mutationCenter, evalOverview, intentLab, retrievalLab, retrievalRun, mutationEval }: AppShellProps) {
  const [route, setRoute] = useState<AppRoute>(() => resolveAppRoute(initialPath ?? currentPath()))
  const pathname = initialPath ?? currentPath()
  const retrievalRunId = retrievalRunIdFromPath(pathname)
  const mutationEvalRunId = mutationEvalRunIdFromPath(pathname)
  const mutationOperationId = mutationOperationIdFromPath(pathname)
  const traceId = traceIdFromPath(pathname)

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
        <a href="/industry/traces" data-active={isTraceRoute(route)} onClick={navigate('industry-traces')}>Trace</a>
        <a href="/industry/mutations" data-active={isMutationRoute(route)} onClick={navigate('industry-mutations')}>Mutation Center</a>
        <a href="/industry/eval" data-active={isEvaluationRoute(route)} onClick={navigate('industry-eval')}>Evaluation</a>
      </nav>
      <div className="app-shell__content">
        <AppContent
          route={route}
          traceId={traceId}
          retrievalRunId={retrievalRunId}
          mutationEvalRunId={mutationEvalRunId}
          mutationOperationId={mutationOperationId}
          codingChat={codingChat}
          industryWorkspace={industryWorkspace}
          traceExplorer={traceExplorer}
          mutationCenter={mutationCenter}
          evalOverview={evalOverview}
          intentLab={intentLab}
          retrievalLab={retrievalLab}
          retrievalRun={retrievalRun}
          mutationEval={mutationEval}
        />
      </div>
    </div>
  )
}

function AppContent({
  route,
  traceId,
  retrievalRunId,
  mutationEvalRunId,
  mutationOperationId,
  codingChat,
  industryWorkspace,
  traceExplorer,
  mutationCenter,
  evalOverview,
  intentLab,
  retrievalLab,
  retrievalRun,
  mutationEval,
}: {
  route: AppRoute
  traceId: string | null
  retrievalRunId: string | null
  mutationEvalRunId: string | null
  mutationOperationId: string | null
  codingChat?: ReactNode
  industryWorkspace?: ReactNode
  traceExplorer?: ReactNode
  mutationCenter?: ReactNode
  evalOverview?: ReactNode
  intentLab?: ReactNode
  retrievalLab?: ReactNode
  retrievalRun?: ReactNode
  mutationEval?: ReactNode
}) {
  if (route === 'industry-eval-mutation-run' && mutationEvalRunId !== null) {
    return mutationEval ?? <MutationEvalPage runId={mutationEvalRunId} />
  }
  if (route === 'industry-eval-mutation') return mutationEval ?? <MutationEvalPage />
  if (route === 'industry-eval-retrieval-run' && retrievalRunId !== null) {
    return retrievalRun ?? <RetrievalRunPage runId={retrievalRunId} />
  }
  if (route === 'industry-eval-retrieval') return retrievalLab ?? <RetrievalLabPage />
  if (route === 'industry-eval-intent') return intentLab ?? <IntentLabPage />
  if (route === 'industry-eval') return evalOverview ?? <EvalOverviewPage />
  if (route === 'industry-trace-detail' && traceId !== null) return traceExplorer ?? <TracePage traceId={traceId} />
  if (route === 'industry-traces') return traceExplorer ?? <TracePage />
  if (route === 'industry-mutation-detail' && mutationOperationId !== null) {
    return mutationCenter ?? <MutationCenterPage mode="detail" operationId={mutationOperationId} />
  }
  if (route === 'industry-mutation-reconciliation') return mutationCenter ?? <MutationCenterPage mode="reconciliation" />
  if (route === 'industry-mutations') return mutationCenter ?? <MutationCenterPage mode="list" />
  if (route === 'industry') return industryWorkspace ?? <IndustryWorkspacePage />
  return codingChat ?? <CodingChatApp />
}

function currentPath(): string {
  return typeof window === 'undefined' ? '/chat' : window.location.pathname
}
