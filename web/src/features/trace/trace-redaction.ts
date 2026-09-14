export function maskTraceValue(value: unknown): unknown {
  if (typeof value === 'string') return maskTraceText(value)
  if (Array.isArray(value)) return value.map(maskTraceValue)
  if (typeof value !== 'object' || value === null) return value
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? '[MASKED]' : maskTraceValue(item)
  }
  return output
}

export function maskTraceText(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/giu, 'Bearer [MASKED]')
    .replace(/\b(?:mysql|postgres(?:ql)?):\/\/[^\s"']+/giu, '[MASKED_DSN]')
    .replace(/\bsk-[A-Za-z0-9_-]{6,}/gu, '[MASKED_API_KEY]')
    .replace(/\bapproval-[A-Za-z0-9_-]{6,}/gu, '[MASKED_APPROVAL_TOKEN]')
    .replace(/((?:api[-_ ]?key|approval[-_ ]?token|password|cookie|authorization)\s*[:=]\s*)[^\s,;]+/giu, '$1[MASKED]')
}

export function maskedJson(value: unknown): string {
  return JSON.stringify(maskTraceValue(value), null, 2)
}

function isSensitiveKey(key: string): boolean {
  return /authorization|cookie|api[-_]?key|approval[-_]?token|password|secret|dsn|database[-_]?url/iu.test(key)
}
