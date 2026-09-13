export type AppRoute =
  | 'chat'
  | 'industry'
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
  if (pathname === '/industry' || pathname.startsWith('/industry/')) return 'industry'
  return 'chat'
}

export function routePath(route: AppRoute): string {
  if (route === 'industry-eval-retrieval-run' || route === 'industry-eval-retrieval') return '/industry/eval/playground/retrieval'
  if (route === 'industry-eval-intent') return '/industry/eval/intent'
  if (route === 'industry-eval') return '/industry/eval'
  if (route === 'industry') return '/industry'
  return '/chat'
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
