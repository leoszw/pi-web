export type AppRoute = 'chat' | 'industry' | 'industry-eval' | 'industry-eval-intent' | 'industry-eval-retrieval'

export function resolveAppRoute(pathname: string): AppRoute {
  if (pathname === '/industry/eval/playground/retrieval' || pathname.startsWith('/industry/eval/playground/retrieval/')) return 'industry-eval-retrieval'
  if (pathname === '/industry/eval/retrieval' || pathname.startsWith('/industry/eval/retrieval/')) return 'industry-eval-retrieval'
  if (pathname === '/industry/eval/intent' || pathname.startsWith('/industry/eval/intent/')) return 'industry-eval-intent'
  if (pathname === '/industry/eval' || pathname.startsWith('/industry/eval/')) return 'industry-eval'
  if (pathname === '/industry' || pathname.startsWith('/industry/')) return 'industry'
  return 'chat'
}

export function routePath(route: AppRoute): string {
  if (route === 'industry-eval-retrieval') return '/industry/eval/playground/retrieval'
  if (route === 'industry-eval-intent') return '/industry/eval/intent'
  if (route === 'industry-eval') return '/industry/eval'
  if (route === 'industry') return '/industry'
  return '/chat'
}

export function isIndustryRoute(route: AppRoute): boolean {
  return route !== 'chat'
}
