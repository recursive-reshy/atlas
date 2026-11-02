// Shared
import { ListModelsResponse } from '@atlas/shared'
// Clients
import { listSummaryModels } from '../clients/anthropicModels.client.js'
// Errors
import { ValidationError } from '../errors.js'
// Repositories
import { getSetting } from '../repositories/settings.repository.js'
// Summarizer
import { SHIPPED_DEFAULT_MODEL } from '../summarizer/models.js'
// Logging
import { logger } from '../logger.js'

const CACHE_MS = 3_600_000

let cache: { models: ListModelsResponse[ 'models' ], expiresAt: number } | undefined

export const clearModelCache = (): void => {
  cache = undefined
}

const currentDefaultModel = ( userId: string ): string => {
  const saved = getSetting( userId, 'default_model' )

  return typeof saved === 'string' ? saved : SHIPPED_DEFAULT_MODEL
}

export const listModels = async ( userId: string ): Promise< ListModelsResponse > => {
  if( cache !== undefined && cache.expiresAt > Date.now() ) {
    return { models: cache.models, source: 'api' }
  }

  try {
    const models = await listSummaryModels()

    cache = { models, expiresAt: Date.now() + CACHE_MS }

    return { models, source: 'api' }
  } catch( error ) {
    logger.error( { err: error }, 'Could not list models' )

    const id = currentDefaultModel( userId )

    return { models: [ { id, display_name: id } ], source: 'fallback' }
  }
}

export const assertKnownModel = async ( userId: string, model: string ): Promise< void > => {
  const { models } = await listModels( userId )

  if( model !== currentDefaultModel( userId ) && !models.some( ( { id } ) => id === model ) ) {
    throw new ValidationError( `Unknown model: ${ model }` )
  }
}
