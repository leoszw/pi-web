import assert from 'node:assert/strict'
import test from 'node:test'
import type { ModelsConfig } from '../../shared/protocol'
import { redactModelsConfigForControlPlane } from '../src/industry/models-config-security'
import { redactSecrets } from '../src/security/redaction'

test('control-plane model config never returns apiKey', () => {
  const config: ModelsConfig = {
    providers: {
      demo: {
        api: 'openai-completions',
        apiKey: 'super-secret',
        baseUrl: 'https://example.test',
        models: [{ id: 'model-1' }],
        Authorization: 'Bearer hidden',
        nested: { secret: 'hidden-too', safe: 'visible' },
      },
    },
  }

  const redacted = redactModelsConfigForControlPlane(config)
  assert.equal(redacted.providers.demo.apiKey, undefined)
  assert.equal(redacted.providers.demo.apiKeyConfigured, true)
  assert.equal(JSON.stringify(redacted).includes('super-secret'), false)
  assert.equal(JSON.stringify(redacted).includes('Bearer hidden'), false)
  assert.equal(JSON.stringify(redacted).includes('hidden-too'), false)
  assert.equal((redacted.providers.demo.Authorization as string), '[REDACTED]')
})

test('structured redaction hides credentials recursively', () => {
  const redacted = redactSecrets({
    nested: {
      Authorization: 'Bearer token',
      cookie: 'sid=secret',
      safe: 'value',
    },
    approvalToken: 'one-time-token',
  })
  assert.deepEqual(redacted, {
    nested: {
      Authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      safe: 'value',
    },
    approvalToken: '[REDACTED]',
  })
})
