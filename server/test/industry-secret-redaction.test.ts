import assert from 'node:assert/strict'
import test from 'node:test'
import type { ModelsConfig } from '../../shared/protocol'
import { redactModelsConfigForControlPlane } from '../src/industry/models-config-security'
import { redactSecrets } from '../src/security/redaction'

test('control-plane model config never returns apiKey or credentials embedded in ordinary string fields', () => {
  const config: ModelsConfig = {
    providers: {
      demo: {
        api: 'openai-completions',
        apiKey: 'super-secret',
        baseUrl: 'https://user:password@example.test/v1?api_key=sk-abcdef123456',
        models: [{ id: 'model-1' }],
        Authorization: 'Bearer hidden',
        nested: { secret: 'hidden-too', safe: 'token=inline-secret-value' },
      },
    },
  }

  const redacted = redactModelsConfigForControlPlane(config)
  const serialized = JSON.stringify(redacted)
  assert.equal(redacted.providers.demo.apiKey, undefined)
  assert.equal(redacted.providers.demo.apiKeyConfigured, true)
  assert.equal(serialized.includes('super-secret'), false)
  assert.equal(serialized.includes('Bearer hidden'), false)
  assert.equal(serialized.includes('hidden-too'), false)
  assert.equal(serialized.includes('user:password@'), false)
  assert.equal(serialized.includes('sk-abcdef123456'), false)
  assert.equal(serialized.includes('inline-secret-value'), false)
  assert.equal((redacted.providers.demo.Authorization as string), '[REDACTED]')
})

test('structured redaction hides credentials recursively and scans string values', () => {
  const redacted = redactSecrets({
    nested: {
      Authorization: 'Bearer token',
      cookie: 'sid=secret',
      safe: 'postgresql://user:pass@db.example/app token=abc123',
    },
    approvalToken: 'one-time-token',
  })
  assert.deepEqual(redacted, {
    nested: {
      Authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      safe: 'postgresql://[REDACTED]@db.example/app token=[REDACTED]',
    },
    approvalToken: '[REDACTED]',
  })
})
