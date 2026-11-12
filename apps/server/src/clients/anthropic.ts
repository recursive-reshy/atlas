// Packages
import Anthropic from '@anthropic-ai/sdk'
// Config
import { config } from '../config.js'

let client: Anthropic | undefined

// One client per process (ADR 0110), so a credential is exchanged and refreshed once, not per
// call. Timeouts and retries are per request, since each call site has its own.
export const getAnthropic = (): Anthropic => {
  client ??= new Anthropic( { apiKey: config.anthropicApiKey } )

  return client
}
