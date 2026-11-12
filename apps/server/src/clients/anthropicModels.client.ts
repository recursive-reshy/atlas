// Shared
import { ModelOption } from '@atlas/shared'
// Clients
import { getAnthropic } from './anthropic.js'
// Config
import { config } from '../config.js'
// Summarizer
import { SUMMARY_MAX_TOKENS } from '../summarizer/models.js'

const PAGE_SIZE = 100

export const listSummaryModels = async (): Promise< ModelOption[] > => {
  const models: ModelOption[] = []

  const page = getAnthropic().models.list(
    { lifecycle: [ 'active' ], limit: PAGE_SIZE },
    { timeout: config.summaryTimeoutMs, maxRetries: 1 },
  )

  for await ( const model of page ) {
    const { capabilities, max_tokens: maxTokens } = model

    if(
      capabilities?.structured_outputs.supported === true
      && capabilities.effort.medium.supported
      && ( maxTokens === null || maxTokens >= SUMMARY_MAX_TOKENS )
    ) {
      models.push( { id: model.id, display_name: model.display_name } )
    }
  }

  return models
}
