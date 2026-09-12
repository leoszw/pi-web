export type AppRoute = 'chat' | 'industry'

export function resolveAppRoute(pathname: string): AppRoute {
  if (pathname === '/industry' || pathname.startsWith('/industry/')) return 'industry'
  return 'chat'
}

export function routePath(route: AppRoute): string {
  return route === 'industry' ? '/industry' : '/chat'
}
