import type { IncomingMessage } from 'node:http'
import { isOriginAllowed } from './origin'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export class CsrfError extends Error {
  readonly code = 'CSRF_CHECK_FAILED'
  readonly statusCode = 403

  constructor(message: string) {
    super(message)
    this.name = 'CsrfError'
  }
}

export function assertControlPlaneCsrfSafe(request: IncomingMessage, allowedOrigins: ReadonlySet<string>): void {
  const method = request.method ?? 'GET'
  if (SAFE_METHODS.has(method)) return

  const fetchSite = request.headers['sec-fetch-site']
  if (typeof fetchSite === 'string' && fetchSite.toLowerCase() === 'cross-site') {
    throw new CsrfError('cross-site state-changing requests are not allowed')
  }

  const origin = request.headers.origin
  if (origin !== undefined && !isOriginAllowed(request, allowedOrigins)) {
    throw new CsrfError('request origin is not allowed for state-changing control-plane requests')
  }

  // Browsers send Origin and/or Sec-Fetch-Site for state-changing fetches. Requests
  // without either header are treated as non-browser clients; their authentication
  // remains the PrincipalProvider responsibility rather than a CSRF concern.
  if (origin === undefined && fetchSite !== undefined && fetchSite !== 'same-origin' && fetchSite !== 'same-site' && fetchSite !== 'none') {
    throw new CsrfError('request fetch site is not trusted')
  }
}
