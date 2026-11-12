// Packages
import Anthropic from '@anthropic-ai/sdk'
// Config
import { config } from '../config.js'

let client: Anthropic | undefined

// One client per process (ADR 0110), so a credential is exchanged and refreshed once, not per
// call. Timeouts and retries are per request, since each call site has its own.
export const getAnthropic = (): Anthropic => {
  // Under federation no apiKey is passed, so the SDK resolves its credentials from the environment
  const { claudeAuth } = config

  client ??= new Anthropic( claudeAuth.kind === 'api_key' ? { apiKey: claudeAuth.key } : {} )

  return client
}
