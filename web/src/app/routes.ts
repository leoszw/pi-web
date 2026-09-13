export type AppRoute =
  | 'chat'
  | 'industry'
  | 'industry-mutations'
  | 'industry-mutation-detail'
  | 'industry-mutation-reconciliation'
  | 'industry-eval'
  | 'industry-eval-intent'
  | 'industry-eval-retrieval'
  | 'industry-eval-retrieval-run'

export function resolveAppRoute(pathname: string): AppRoute {
  if (retrievalRunIdFromPath(pathname) !== null) return 'industry-eval-retrieval-run'
  if (pathname === '/industry/eval/playground/retrieval' || pathname.startsWith('/industry/eval/playground/retrieval/')) return 'industry-eval-retrieval'
  if (pathname === '/industry/eval/retrieval' || pathname.startsWith('/industry/eval/retrieval/')) return 'industry-eval-retrieval'
  if (pathname === '/industry/eval/intent' || pathname.startsWith('/industry/eval/intent/')) return 'industry-eval-intent'
  if (pathname === '/industry/eval' || pathname.startsWith('/industry/eval/')) return 'industry-eval'
  if (pathname === '/industry/mutations/reconciliation' || pathname === '/industry/mutations/reconciliation/') return 'industry-mutation-reconciliation'
  if (mutationOperationIdFromPath(pathname) !== null) return 'industry-mutation-detail'
  if (pathname === '/industry/mutations' || pathname === '/industry/mutations/') return 'industry-mutations'
  if (pathname === '/industry' || pathname.startsWith('/industry/')) return 'industry'
  return 'chat'
}

export function routePath(route: AppRoute): string {
  if (route === 'industry-eval-retrieval-run' || route === 'industry-eval-retrieval') return '/industry/eval/playground/retrieval'
  if (route === 'industry-eval-intent') return '/industry/eval/intent'
  if (route === 'industry-eval') return '/industry/eval'
  if (route === 'industry-mutation-reconciliation') return '/industry/mutations/reconciliation'
  if (route === 'industry-mutation-detail' || route === 'industry-mutations') return '/industry/mutations'
  if (route === 'industry') return '/industry'
  return '/chat'
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
