const SENSITIVE_KEY = /(?:api[_-]?key|authorization|cookie|secret|password|token|dsn|connection[_-]?string)/i
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi
const OPENAI_STYLE_KEY = /\bsk-[A-Za-z0-9_-]{6,}\b/g
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/:@]+):([^\s/@]+)@/gi
const INLINE_SECRET = /\b(api[_-]?key|password|passwd|token|authorization|cookie)\s*[:=]\s*([^\s,;]+)/gi

export function redactSecrets(value: unknown): unknown {
  if (typeof value === 'string') return redactSecretString(value)
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item))
  if (!isRecord(value)) return value
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactSecrets(child)
  }
  return output
}

export function redactSecretString(value: string): string {
  return value
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(OPENAI_STYLE_KEY, '[REDACTED]')
    .replace(URL_USERINFO, '$1[REDACTED]@')
    .replace(INLINE_SECRET, '$1=[REDACTED]')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
