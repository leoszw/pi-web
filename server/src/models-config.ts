import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ConfigModelEntry, ConfigProvider, ModelsConfig } from '../../shared/protocol'

const DEFAULT_API = 'openai-completions'
const KNOWN_PROVIDER_KEYS = new Set(['baseUrl', 'api', 'apiKey', 'models'])
const KNOWN_MODEL_KEYS = new Set(['id', 'name', 'reasoning', 'contextWindow', 'maxTokens'])

export function expandTilde(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  return p
}

/** Re-reads PI_CODING_AGENT_DIR on every call: tests and embedders may set it late. */
export function modelsConfigPath(): string {
  const configured = process.env.PI_CODING_AGENT_DIR
  const dir = configured ? expandTilde(configured) : join(homedir(), '.pi', 'agent')
  return join(dir, 'models.json')
}

export type ReadModelsConfigResult = { config: ModelsConfig } | { error: string }

export async function readModelsConfig(): Promise<ReadModelsConfigResult> {
  let raw: string
  try {
    raw = await readFile(modelsConfigPath(), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { config: { providers: {} } }
    return { error: `failed to read models.json: ${String(error)}` }
  }
  // pi tolerates a leading BOM; strip it before parsing (JSONC is not handled here).
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return { error: `failed to parse models.json: ${error instanceof Error ? error.message : String(error)}` }
  }
  if (!isPlainObject(parsed)) return { error: 'models.json must contain a JSON object' }
  if (!isPlainObject(parsed.providers)) return { error: 'models.json must contain a "providers" object' }
  // Outer shape verified above; deep provider entries are returned as-is on read.
  return { config: parsed as unknown as ModelsConfig }
}

export type ValidateModelsConfigResult = { ok: true; value: ModelsConfig } | { ok: false; error: string }

/** Validates and normalizes a providers map. Collects every problem into one error string. */
export function validateModelsConfig(input: unknown): ValidateModelsConfigResult {
  if (!isPlainObject(input) || !isPlainObject(input.providers)) {
    return { ok: false, error: 'config must be an object with a "providers" object' }
  }
  const problems: string[] = []
  const providers: Record<string, ConfigProvider> = {}
  for (const [name, rawProvider] of Object.entries(input.providers)) {
    if (!isPlainObject(rawProvider)) {
      problems.push(`providers["${name}"] must be an object`)
      continue
    }
    const provider = validateProvider(name, rawProvider, problems)
    if (provider !== undefined) providers[name] = provider
  }
  if (problems.length > 0) return { ok: false, error: problems.join('; ') }
  return { ok: true, value: { providers } }
}

export async function saveModelsConfig(config: ModelsConfig): Promise<void> {
  const path = modelsConfigPath()
  await mkdir(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  try {
    await writeFile(tmpPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
    await rename(tmpPath, path)
  } catch (error) {
    // Best-effort cleanup so a failed save never leaves tmp files behind.
    await unlink(tmpPath).catch(() => {})
    throw error
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

function validateProvider(name: string, raw: Record<string, unknown>, problems: string[]): ConfigProvider | undefined {
  const label = `providers["${name}"]`
  let failed = false
  const fail = (message: string): void => {
    problems.push(`${label} ${message}`)
    failed = true
  }

  let baseUrl: string | undefined
  if (raw.baseUrl !== undefined) {
    if (typeof raw.baseUrl === 'string' && raw.baseUrl !== '') baseUrl = raw.baseUrl
    else fail('baseUrl must be a non-empty string')
  }

  // pi accepts any non-empty api string (its KnownApi set evolves; the schema does not restrict it).
  let api = DEFAULT_API
  if (raw.api !== undefined) {
    if (typeof raw.api === 'string' && raw.api !== '') api = raw.api
    else fail('api must be a non-empty string')
  }

  // pi's schema requires apiKey minLength 1 when present and discards the whole file otherwise.
  let apiKey: string | undefined
  if (raw.apiKey !== undefined) {
    if (typeof raw.apiKey === 'string' && raw.apiKey !== '') apiKey = raw.apiKey
    else fail('apiKey must be a non-empty string')
  }

  // models is optional: absent and empty both mean a provider with no models.
  let models: ConfigModelEntry[] = []
  if (raw.models !== undefined) {
    if (!Array.isArray(raw.models)) {
      fail('models must be an array')
    } else {
      const list: ConfigModelEntry[] = []
      raw.models.forEach((rawModel, index) => {
        const model = validateModel(`${label}.models[${index}]`, rawModel, problems)
        if (model !== undefined) list.push(model)
      })
      models = list
    }
  }

  if (failed) return undefined

  // Absent baseUrl stays absent: writing '' would fail the next validation round
  // (pi's schema requires minLength 1 when present).
  const value: ConfigProvider = { api, models }
  if (baseUrl !== undefined) value.baseUrl = baseUrl
  if (apiKey !== undefined) value.apiKey = apiKey
  for (const [key, v] of Object.entries(raw)) {
    if (KNOWN_PROVIDER_KEYS.has(key)) continue
    value[key] = v
  }
  return value
}

function validateModel(label: string, input: unknown, problems: string[]): ConfigModelEntry | undefined {
  if (!isPlainObject(input)) {
    problems.push(`${label} must be an object`)
    return undefined
  }
  let failed = false
  const fail = (message: string): void => {
    problems.push(`${label} ${message}`)
    failed = true
  }

  let id: string | undefined
  if (typeof input.id === 'string' && input.id.trim() !== '') id = input.id
  else fail('id must be a non-empty string')

  let name: string | undefined
  if (input.name !== undefined) {
    if (typeof input.name === 'string' && input.name !== '') name = input.name
    else fail('name must be a non-empty string when present')
  }

  let reasoning: boolean | undefined
  if (input.reasoning !== undefined) {
    if (typeof input.reasoning === 'boolean') reasoning = input.reasoning
    else fail('reasoning must be a boolean')
  }

  let contextWindow: number | undefined
  if (input.contextWindow !== undefined) {
    if (isPositiveInt(input.contextWindow)) contextWindow = input.contextWindow
    else fail('contextWindow must be a positive integer')
  }

  let maxTokens: number | undefined
  if (input.maxTokens !== undefined) {
    if (isPositiveInt(input.maxTokens)) maxTokens = input.maxTokens
    else fail('maxTokens must be a positive integer')
  }

  if (failed || id === undefined) return undefined

  const entry: ConfigModelEntry = { id }
  if (name !== undefined) entry.name = name
  if (reasoning !== undefined) entry.reasoning = reasoning
  if (contextWindow !== undefined) entry.contextWindow = contextWindow
  if (maxTokens !== undefined) entry.maxTokens = maxTokens
  for (const [key, v] of Object.entries(input)) {
    if (KNOWN_MODEL_KEYS.has(key)) continue
    entry[key] = v
  }
  return entry
}
