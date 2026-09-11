import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { modelsConfigPath, readModelsConfig, saveModelsConfig, validateModelsConfig } from '../src/models-config'
import type { ModelsConfig } from '../../shared/protocol'

const originalEnv = process.env.PI_CODING_AGENT_DIR
let agentDir = ''

beforeEach(async () => {
  agentDir = await mkdtemp(join(tmpdir(), 'pi-web-models-config-'))
  process.env.PI_CODING_AGENT_DIR = agentDir
})

afterEach(() => {
  if (originalEnv === undefined) delete process.env.PI_CODING_AGENT_DIR
  else process.env.PI_CODING_AGENT_DIR = originalEnv
})

test('validate accepts a minimal provider and defaults api to openai-completions', () => {
  const result = validateModelsConfig({
    providers: { custom: { baseUrl: 'https://api.example.com/v1', models: [{ id: 'model-a' }] } },
  })
  assert.ok(result.ok)
  assert.equal(result.value.providers.custom.api, 'openai-completions')
  assert.deepEqual(result.value.providers.custom.models, [{ id: 'model-a' }])
})

test('validate accepts all four api values and rejects unknown ones', () => {
  for (const api of ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai']) {
    const result = validateModelsConfig({
      providers: { p: { baseUrl: 'https://x.example.com', api, models: [{ id: 'm' }] } },
    })
    assert.ok(result.ok)
    assert.equal(result.value.providers.p.api, api)
  }
  const bad = validateModelsConfig({
    providers: { p: { baseUrl: 'https://x.example.com', api: 'unknown-api', models: [{ id: 'm' }] } },
  })
  assert.equal(bad.ok, false)
  if (bad.ok) return
  assert.match(bad.error, /api must be one of/)
  assert.match(bad.error, /unknown-api/)
})

test('validate collects every problem into a single joined error string', () => {
  const result = validateModelsConfig({
    providers: {
      a: { baseUrl: 'ftp://x.example.com', api: 'openai-completions', models: [{ id: 'm1' }] },
      b: { baseUrl: 'https://b.example.com', models: [] },
      c: { baseUrl: 'https://c.example.com', models: [{ name: 'no-id' }, { id: 'm2', contextWindow: -5 }] },
    },
  })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.match(result.error, /baseUrl must be a string starting with/)
  assert.match(result.error, /models must be a non-empty array/)
  assert.match(result.error, /models\[0\] id must be a non-empty string/)
  assert.match(result.error, /models\[1\] contextWindow must be a positive integer/)
  assert.ok(result.error.includes('; '))
  assert.ok(!result.error.includes('\n'))
})

test('validate preserves unknown keys on providers and models without mutating the input', () => {
  const input = {
    providers: {
      p: {
        baseUrl: 'https://x.example.com',
        api: 'anthropic-messages',
        models: [{ id: 'm1', unknownModelKey: { nested: true } }],
        unknownProviderKey: 'keep-me',
      },
    },
  }
  const result = validateModelsConfig(input)
  assert.ok(result.ok)
  assert.equal(result.value.providers.p.unknownProviderKey, 'keep-me')
  assert.deepEqual(result.value.providers.p.models[0].unknownModelKey, { nested: true })
  assert.deepEqual(input.providers.p.models[0], { id: 'm1', unknownModelKey: { nested: true } })
})

test('read returns empty providers when the file is missing', async () => {
  const result = await readModelsConfig()
  assert.deepEqual(result, { config: { providers: {} } })
})

test('read returns an error mentioning parse for malformed JSON', async () => {
  await writeFile(join(agentDir, 'models.json'), '{ not json', 'utf8')
  const result = await readModelsConfig()
  if ('config' in result) throw new Error('expected an error result')
  assert.match(result.error, /parse/)
})

test('save writes atomically with a trailing newline and round-trips through read', async () => {
  const config: ModelsConfig = {
    providers: {
      p: {
        baseUrl: 'https://x.example.com/v1',
        api: 'openai-responses',
        apiKey: 'sk-test',
        models: [{ id: 'm1', name: 'Model One', reasoning: true, contextWindow: 128000, maxTokens: 4096 }],
      },
    },
  }
  await saveModelsConfig(config)
  const raw = await readFile(modelsConfigPath(), 'utf8')
  assert.ok(raw.endsWith('\n'))
  assert.deepEqual(JSON.parse(raw), config)
  const files = await readdir(agentDir)
  assert.ok(files.every((file) => !file.includes('.tmp-')))
  const result = await readModelsConfig()
  if ('error' in result) throw new Error(`expected a config result: ${result.error}`)
  assert.deepEqual(result.config, config)
})
