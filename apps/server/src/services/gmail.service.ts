// Shared
import type { GmailAccount, GmailLabel } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError } from '../errors.js'
// Gmail
import {
  GmailAuthError,
  GmailNotConnectedError,
  MissingRefreshTokenError,
  MissingScopeError,
  OAuthStateError,
  completeConsent,
  createConsentUrl,
  disconnect,
} from '../gmail/auth.js'
import { listLabels as listGmailLabels } from '../gmail/gmail.client.js'
// Repositories
import { findAccount } from '../repositories/gmailAccount.repository.js'
// Logging
import { logger } from '../logger.js'

export type ConsentFailure = 'denied' | 'state' | 'no_refresh_token' | 'scope' | 'failed'

const NOT_CONFIGURED = 'Gmail isn\'t configured'

const requireConfigured = (): void => {
  if( config.gmail === null ) {
    throw new ConflictError( NOT_CONFIGURED )
  }
}

export const getAccount = ( userId: string ): GmailAccount => {
  if( config.gmail === null ) {
    return { status: 'not_configured', email: null, connected_at: null, error: null }
  }

  const account = findAccount( userId )

  if( account === undefined ) {
    return { status: 'not_connected', email: null, connected_at: null, error: null }
  }

  return {
    status: account.status,
    email: account.email,
    connected_at: account.connected_at,
    error: account.error,
  }
}

export const startConnect = ( userId: string, origin: string ): string => {
  requireConfigured()

  return createConsentUrl( userId, origin )
}

const failureFor = ( error: unknown ): ConsentFailure => {
  if( error instanceof OAuthStateError ) {
    return 'state'
  }

  if( error instanceof MissingRefreshTokenError ) {
    return 'no_refresh_token'
  }

  if( error instanceof MissingScopeError ) {
    return 'scope'
  }

  logger.error( 'Gmail: completing the consent failed' )
  return 'failed'
}

export const finishConnect = async (
  userId: string,
  { code, state, error }: { code?: string, state?: string, error?: string },
): Promise< ConsentFailure | null > => {
  if( config.gmail === null ) {
    return 'failed'
  }

  if( error !== undefined ) {
    return error === 'access_denied' ? 'denied' : 'failed'
  }

  if( state === undefined ) {
    return 'state'
  }

  if( code === undefined ) {
    return 'failed'
  }

  try {
    await completeConsent( userId, { code, state } )
    return null
  } catch( failure ) {
    return failureFor( failure )
  }
}

export const disconnectAccount = async ( userId: string ): Promise< void > => {
  requireConfigured()
  await disconnect( userId )
}

const byName = ( first: GmailLabel, second: GmailLabel ): number => {
  return first.name.localeCompare( second.name, undefined, { sensitivity: 'base' } )
}

export const listLabels = async ( userId: string ): Promise< GmailLabel[] > => {
  requireConfigured()

  try {
    const labels = ( await listGmailLabels( userId ) ).filter( ( { id, type } ) => {
      return type === 'user' || id === 'INBOX'
    } )

    return [
      ...labels.filter( ( { type } ) => type === 'user' ).sort( byName ),
      ...labels.filter( ( { type } ) => type === 'system' ),
    ]
  } catch( error ) {
    if( error instanceof GmailNotConnectedError || error instanceof GmailAuthError ) {
      throw new ConflictError( error.message )
    }

    throw error
  }
}
