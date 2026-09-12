import type { ConfigProvider, ModelsConfig } from '../../../shared/protocol'
import { redactSecrets } from '../security/redaction'

export function redactModelsConfigForControlPlane(config: ModelsConfig): ModelsConfig {
  const providers: ModelsConfig['providers'] = {}
  for (const [name, provider] of Object.entries(config.providers)) {
    const { apiKey, ...providerWithoutApiKey } = provider
    const redacted = redactSecrets(providerWithoutApiKey) as ConfigProvider
    providers[name] = {
      ...redacted,
      apiKeyConfigured: typeof apiKey === 'string' && apiKey.length > 0,
    }
  }
  return { providers }
}
