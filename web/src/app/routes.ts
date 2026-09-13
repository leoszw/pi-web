export type AppRoute =
  | 'chat'
  | 'industry'
  | 'industry-traces'
  | 'industry-trace-detail'
  | 'industry-retrieval-debug'
  | 'industry-mutations'
  | 'industry-mutation-detail'
  | 'industry-mutation-reconciliation'
  | 'industry-eval'
  | 'industry-eval-intent'
  | 'industry-eval-retrieval'
  | 'industry-eval-retrieval-run'
  | 'industry-eval-mutation'
  | 'industry-eval-mutation-run'
  | 'industry-eval-trace'
  | 'industry-eval-trace-run'

export function resolveAppRoute(pathname: string): AppRoute {
  if (traceEvalRunIdFromPath(pathname) !== null) return 'industry-eval-trace-run'
  if (mutationEvalRunIdFromPath(pathname) !== null) return 'industry-eval-mutation-run'
  if (retrievalRunIdFromPath(pathname) !== null) return 'industry-eval-retrieval-run'
  if (pathname === '/industry/eval/trace' || pathname.startsWith('/industry/eval/trace/')) return 'industry-eval-trace'
  if (pathname === '/industry/eval/mutation' || pathname.startsWith('/industry/eval/mutation/')) return 'industry-eval-mutation'
  if (pathname === '/industry/eval/playground/retrieval' || pathname.startsWith('/industry/eval/playground/retrieval/')) return 'industry-eval-retrieval'
  if (pathname === '/industry/eval/retrieval' || pathname.startsWith('/industry/eval/retrieval/')) return 'industry-eval-retrieval'
  if (pathname === '/industry/eval/intent' || pathname.startsWith('/industry/eval/intent/')) return 'industry-eval-intent'
  if (pathname === '/industry/eval' || pathname.startsWith('/industry/eval/')) return 'industry-eval'
  if (retrievalDebugTraceIdFromPath(pathname) !== null) return 'industry-retrieval-debug'
  if (traceIdFromPath(pathname) !== null) return 'industry-trace-detail'
  if (pathname === '/industry/traces' || pathname === '/industry/traces/') return 'industry-traces'
  if (pathname === '/industry/mutations/reconciliation' || pathname === '/industry/mutations/reconciliation/') return 'industry-mutation-reconciliation'
  if (mutationOperationIdFromPath(pathname) !== null) return 'industry-mutation-detail'
  if (pathname === '/industry/mutations' || pathname === '/industry/mutations/') return 'industry-mutations'
  if (pathname === '/industry' || pathname.startsWith('/industry/')) return 'industry'
  return 'chat'
}

export function routePath(route: AppRoute): string {
  if (route === 'industry-eval-trace-run' || route === 'industry-eval-trace') return '/industry/eval/trace'
  if (route === 'industry-eval-mutation-run' || route === 'industry-eval-mutation') return '/industry/eval/mutation'
  if (route === 'industry-eval-retrieval-run' || route === 'industry-eval-retrieval') return '/industry/eval/playground/retrieval'
  if (route === 'industry-eval-intent') return '/industry/eval/intent'
  if (route === 'industry-eval') return '/industry/eval'
  if (route === 'industry-retrieval-debug' || route === 'industry-trace-detail' || route === 'industry-traces') return '/industry/traces'
  if (route === 'industry-mutation-reconciliation') return '/industry/mutations/reconciliation'
  if (route === 'industry-mutation-detail' || route === 'industry-mutations') return '/industry/mutations'
  if (route === 'industry') return '/industry'
  return '/chat'
}

export function traceEvalRunPath(runId: string): string {
  return `/industry/eval/runs/${encodeURIComponent(runId)}/trace`
}

export function traceEvalRunIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/industry\/eval\/runs\/([^/]+)\/trace\/?$/u)
  if (match?.[1] === undefined) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export function retrievalDebugPath(traceId: string): string {
  return `/industry/debug/retrieval/${encodeURIComponent(traceId)}`
}

export function retrievalDebugTraceIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/industry\/debug\/retrieval\/([^/]+)\/?$/u)
  if (match?.[1] === undefined) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export function tracePath(traceId: string): string {
  return `/industry/traces/${encodeURIComponent(traceId)}`
}

export function traceIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/industry\/traces\/([^/]+)\/?$/u)
  if (match?.[1] === undefined) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export function mutationOperationPath(operationId: string): string {
  return `/industry/mutations/${encodeURIComponent(operationId)}`
}

export function mutationOperationIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/industry\/mutations\/([^/]+)\/?$/u)
  if (match?.[1] === undefined || match[1] === 'reconciliation') return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export function mutationEvalRunPath(runId: string): string {
  return `/industry/eval/runs/${encodeURIComponent(runId)}/mutation`
}

export function mutationEvalRunIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/industry\/eval\/runs\/([^/]+)\/mutation\/?$/u)
  if (match?.[1] === undefined) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export function retrievalRunPath(runId: string): string {
  return `/industry/eval/runs/${encodeURIComponent(runId)}/retrieval`
}

export function retrievalRunIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/industry\/eval\/runs\/([^/]+)\/retrieval\/?$/u)
  if (match?.[1] === undefined) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export function isIndustryRoute(route: AppRoute): boolean {
  return route !== 'chat'
}

export function isEvaluationRoute(route: AppRoute): boolean {
  return route.startsWith('industry-eval')
}

export function isMutationRoute(route: AppRoute): boolean {
  return route === 'industry-mutations'
    || route === 'industry-mutation-detail'
    || route === 'industry-mutation-reconciliation'
}

export function isTraceRoute(route: AppRoute): boolean {
  return route === 'industry-traces' || route === 'industry-trace-detail' || route === 'industry-retrieval-debug'
}
