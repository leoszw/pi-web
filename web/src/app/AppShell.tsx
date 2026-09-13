import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import CodingChatApp from '../App'
import { EvalOverviewPage } from '../features/eval/EvalOverviewPage'
import { IntentLabPage } from '../features/eval/IntentLabPage'
import { MutationEvalPage } from '../features/eval/MutationEvalPage'
import { RetrievalLabPage } from '../features/eval/RetrievalLabPage'
import { RetrievalRunPage } from '../features/eval/RetrievalRunPage'
import { TraceEvalPage } from '../features/eval/TraceEvalPage'
import { IndustryWorkspacePage } from '../features/industry-workspace/IndustryWorkspacePage'
import { MutationCenterPage } from '../features/mutation-center/MutationCenterPage'
import { RetrievalDebugPage } from '../features/trace/RetrievalDebugPage'
import { TracePage } from '../features/trace/TracePage'
import {
  isEvaluationRoute,
  isMutationRoute,
  isTraceRoute,
  mutationEvalRunIdFromPath,
  mutationOperationIdFromPath,
  resolveAppRoute,
  retrievalDebugTraceIdFromPath,
  retrievalRunIdFromPath,
  routePath,
  traceEvalRunIdFromPath,
  traceIdFromPath,
  type AppRoute,
} from './routes'
import './app-shell.css'

export interface AppShellProps {
  initialPath?: string
  codingChat?: ReactNode
  industryWorkspace?: ReactNode
  traceExplorer?: ReactNode
  retrievalDebug?: ReactNode
  mutationCenter?: ReactNode
  evalOverview?: ReactNode
  intentLab?: ReactNode
  retrievalLab?: ReactNode
  retrievalRun?: ReactNode
  mutationEval?: ReactNode
  traceEval?: ReactNode
}

export function AppShell({ initialPath, codingChat, industryWorkspace, traceExplorer, retrievalDebug, mutationCenter, evalOverview, intentLab, retrievalLab, retrievalRun, mutationEval, traceEval }: AppShellProps) {
  const [route, setRoute] = useState<AppRoute>(() => resolveAppRoute(initialPath ?? currentPath()))
  const pathname = initialPath ?? currentPath()
  const retrievalRunId = retrievalRunIdFromPath(pathname)
  const retrievalDebugTraceId = retrievalDebugTraceIdFromPath(pathname)
  const mutationEvalRunId = mutationEvalRunIdFromPath(pathname)
  const traceEvalRunId = traceEvalRunIdFromPath(pathname)
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
          retrievalDebugTraceId={retrievalDebugTraceId}
          retrievalRunId={retrievalRunId}
          mutationEvalRunId={mutationEvalRunId}
          traceEvalRunId={traceEvalRunId}
          mutationOperationId={mutationOperationId}
          codingChat={codingChat}
          industryWorkspace={industryWorkspace}
          traceExplorer={traceExplorer}
          retrievalDebug={retrievalDebug}
          mutationCenter={mutationCenter}
          evalOverview={evalOverview}
          intentLab={intentLab}
          retrievalLab={retrievalLab}
          retrievalRun={retrievalRun}
          mutationEval={mutationEval}
          traceEval={traceEval}
        />
      </div>
    </div>
  )
}

function AppContent({
  route,
  traceId,
  retrievalDebugTraceId,
  retrievalRunId,
  mutationEvalRunId,
  traceEvalRunId,
  mutationOperationId,
  codingChat,
  industryWorkspace,
  traceExplorer,
  retrievalDebug,
  mutationCenter,
  evalOverview,
  intentLab,
  retrievalLab,
  retrievalRun,
  mutationEval,
  traceEval,
}: {
  route: AppRoute
  traceId: string | null
  retrievalDebugTraceId: string | null
  retrievalRunId: string | null
  mutationEvalRunId: string | null
  traceEvalRunId: string | null
  mutationOperationId: string | null
  codingChat?: ReactNode
  industryWorkspace?: ReactNode
  traceExplorer?: ReactNode
  retrievalDebug?: ReactNode
  mutationCenter?: ReactNode
  evalOverview?: ReactNode
  intentLab?: ReactNode
  retrievalLab?: ReactNode
  retrievalRun?: ReactNode
  mutationEval?: ReactNode
  traceEval?: ReactNode
}) {
  if (route === 'industry-eval-trace-run' && traceEvalRunId !== null) return traceEval ?? <TraceEvalPage runId={traceEvalRunId} />
  if (route === 'industry-eval-trace') return traceEval ?? <TraceEvalPage />
  if (route === 'industry-eval-mutation-run' && mutationEvalRunId !== null) return mutationEval ?? <MutationEvalPage runId={mutationEvalRunId} />
  if (route === 'industry-eval-mutation') return mutationEval ?? <MutationEvalPage />
  if (route === 'industry-eval-retrieval-run' && retrievalRunId !== null) return retrievalRun ?? <RetrievalRunPage runId={retrievalRunId} />
  if (route === 'industry-eval-retrieval') return retrievalLab ?? <RetrievalLabPage />
  if (route === 'industry-eval-intent') return intentLab ?? <IntentLabPage />
  if (route === 'industry-eval') return evalOverview ?? <EvalOverviewPage />
  if (route === 'industry-retrieval-debug' && retrievalDebugTraceId !== null) return retrievalDebug ?? <RetrievalDebugPage traceId={retrievalDebugTraceId} />
  if (route === 'industry-trace-detail' && traceId !== null) return traceExplorer ?? <TracePage traceId={traceId} />
  if (route === 'industry-traces') return traceExplorer ?? <TracePage />
  if (route === 'industry-mutation-detail' && mutationOperationId !== null) return mutationCenter ?? <MutationCenterPage mode="detail" operationId={mutationOperationId} />
  if (route === 'industry-mutation-reconciliation') return mutationCenter ?? <MutationCenterPage mode="reconciliation" />
  if (route === 'industry-mutations') return mutationCenter ?? <MutationCenterPage mode="list" />
  if (route === 'industry') return industryWorkspace ?? <IndustryWorkspacePage />
  return codingChat ?? <CodingChatApp />
}

function currentPath(): string {
  return typeof window === 'undefined' ? '/chat' : window.location.pathname
}
