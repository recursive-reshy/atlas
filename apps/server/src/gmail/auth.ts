// Node
import { randomBytes } from 'node:crypto'
// Packages
import { auth, gmail } from '@googleapis/gmail'
import type { gmail_v1 } from '@googleapis/gmail'
// Config
import { config } from '../config.js'
// Repositories
import {
  deleteAccount,
  findAccount,
  saveAccount,
  setAccountStatus,
} from '../repositories/gmailAccount.repository.js'
import type { StoredGmailAccount } from '../repositories/gmailAccount.repository.js'
import { deleteHealth } from '../repositories/health.repository.js'
// Services
import { recordCheck } from '../services/health.service.js'
// Gmail
import { TokenDecryptError, decryptToken, encryptToken } from './tokenCipher.js'
// Logging
import { logger } from '../logger.js'

export const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

// One subject per user: the connection's ID is the user's ID (TRD §3.2)
const connectionOf = ( userId: string ): { kind: 'gmail_connection', id: string } => {
  return { kind: 'gmail_connection', id: userId }
}

const STATE_TTL_MS = 10 * 60 * 1000
const MAX_STATES = 20
const UNREADABLE_REASON = 'The stored Gmail access can\'t be read; reconnect'
const REVOKED_REASON = 'Google no longer accepts Atlas\'s access '
  + '(revoked, expired, or the app is in Testing)'

export class GmailNotConfiguredError extends Error {
  constructor() {
    super( 'Gmail isn\'t configured' )
    this.name = 'GmailNotConfiguredError'
  }
}

export class GmailNotConnectedError extends Error {
  constructor( message = 'Gmail isn\'t connected' ) {
    super( message )
    this.name = 'GmailNotConnectedError'
  }
}

export class GmailAuthError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'GmailAuthError'
  }
}

export class OAuthStateError extends Error {
  constructor() {
    super( 'The Gmail consent request is unknown or has expired' )
    this.name = 'OAuthStateError'
  }
}

export class MissingRefreshTokenError extends Error {
  constructor() {
    super( 'Google did not return a refresh token' )
    this.name = 'MissingRefreshTokenError'
  }
}

export class MissingScopeError extends Error {
  constructor() {
    super( 'Google did not grant read-only Gmail access' )
    this.name = 'MissingScopeError'
  }
}

type GmailConfig = NonNullable< typeof config.gmail >
type OAuthClient = InstanceType< typeof auth.OAuth2 >

type PendingConsent = { userId: string, origin: string, expiresAt: number }

const states = new Map< string, PendingConsent >()
const cached = new Map< string, { key: string, client: gmail_v1.Gmail } >()

const requireConfig = (): GmailConfig => {
  if( config.gmail === null ) {
    throw new GmailNotConfiguredError()
  }

  return config.gmail
}

const buildOAuthClient = (
  { clientId, clientSecret }: GmailConfig,
  redirectUri?: string,
): OAuthClient => {
  return new auth.OAuth2( clientId, clientSecret, redirectUri )
}

const callbackFor = ( origin: string ): string => `${ origin }/api/gmail/oauth/callback`

export const createConsentUrl = ( userId: string, origin: string ): string => {
  const oauth = buildOAuthClient( requireConfig(), callbackFor( origin ) )
  const state = randomBytes( 32 ).toString( 'hex' )

  states.set( state, { userId, origin, expiresAt: Date.now() + STATE_TTL_MS } )

  while( states.size > MAX_STATES ) {
    states.delete( states.keys().next().value! )
  }

  return oauth.generateAuthUrl( {
    access_type: 'offline',
    prompt: 'consent',
    scope: [ SCOPE ],
    state,
    include_granted_scopes: false,
  } )
}

// A state belongs to the user who asked for it, and to the origin they asked from
const consumeState = ( userId: string, state: string ): PendingConsent => {
  const pending = states.get( state )

  states.delete( state )

  if( pending === undefined || pending.expiresAt < Date.now() || pending.userId !== userId ) {
    throw new OAuthStateError()
  }

  return pending
}

export const completeConsent = async (
  userId: string,
  { code, state }: { code: string, state: string },
): Promise< void > => {
  const settings = requireConfig()
  const { origin } = consumeState( userId, state )

  const oauth = buildOAuthClient( settings, callbackFor( origin ) )
  const { tokens } = await oauth.getToken( code )

  if( !tokens.refresh_token ) {
    throw new MissingRefreshTokenError()
  }

  if( !( tokens.scope ?? '' ).split( ' ' ).includes( SCOPE ) ) {
    throw new MissingScopeError()
  }

  oauth.setCredentials( tokens )

  const { data } = await gmail( { version: 'v1', auth: oauth } ).users.getProfile( {
    userId: 'me',
  } )

  saveAccount( userId, {
    email: data.emailAddress ?? '',
    refresh_token_enc: encryptToken( tokens.refresh_token, settings.encryptionKey ),
    scope: SCOPE,
    status: 'connected',
    error: null,
    connected_at: new Date().toISOString(),
  } )
  recordCheck( userId, connectionOf( userId ), { ok: true } )
  cached.delete( userId )
}

const readToken = (
  userId: string,
  account: StoredGmailAccount,
  settings: GmailConfig,
): string => {
  try {
    return decryptToken( account.refresh_token_enc, settings.encryptionKey )
  } catch( error ) {
    if( !( error instanceof TokenDecryptError ) ) {
      throw error
    }

    logger.error( 'Gmail: the stored refresh token could not be decrypted' )
    setAccountStatus( userId, 'reconnect_needed', UNREADABLE_REASON )
    recordCheck( userId, connectionOf( userId ), { ok: false, message: UNREADABLE_REASON } )
    throw new GmailNotConnectedError( UNREADABLE_REASON )
  }
}

export const getGmailClient = ( userId: string ): gmail_v1.Gmail => {
  const settings = requireConfig()
  const account = findAccount( userId )

  if( account === undefined ) {
    throw new GmailNotConnectedError()
  }

  if( account.status === 'reconnect_needed' ) {
    throw new GmailAuthError( account.error ?? REVOKED_REASON )
  }

  const hit = cached.get( userId )

  if( hit?.key === account.refresh_token_enc ) {
    return hit.client
  }

  const oauth = buildOAuthClient( settings )

  oauth.setCredentials( { refresh_token: readToken( userId, account, settings ) } )

  const client = gmail( { version: 'v1', auth: oauth } )

  cached.set( userId, { key: account.refresh_token_enc, client } )

  return client
}

const isAuthFailure = ( error: unknown ): boolean => {
  if( typeof error !== 'object' || error === null ) {
    return false
  }

  const { code, status, response, message } = error as {
    code?: unknown
    status?: unknown
    message?: unknown
    response?: { status?: unknown, data?: { error?: unknown } }
  }

  return code === 401
    || status === 401
    || response?.status === 401
    || response?.data?.error === 'invalid_grant'
    || ( typeof message === 'string' && message.includes( 'invalid_grant' ) )
}

export const withGmail = async < T >(
  userId: string,
  run: ( client: gmail_v1.Gmail ) => Promise< T >,
): Promise< T > => {
  const client = getGmailClient( userId )

  try {
    const result = await run( client )

    recordCheck( userId, connectionOf( userId ), { ok: true } )

    return result
  } catch( error ) {
    if( !isAuthFailure( error ) ) {
      throw error
    }

    logger.warn( 'Gmail: Google rejected the stored access' )
    setAccountStatus( userId, 'reconnect_needed', REVOKED_REASON )
    recordCheck( userId, connectionOf( userId ), { ok: false, message: REVOKED_REASON } )
    cached.delete( userId )
    throw new GmailAuthError( REVOKED_REASON )
  }
}

export const disconnect = async ( userId: string ): Promise< void > => {
  const settings = requireConfig()
  const account = findAccount( userId )

  if( account === undefined ) {
    return
  }

  try {
    await buildOAuthClient( settings )
      .revokeToken( decryptToken( account.refresh_token_enc, settings.encryptionKey ) )
  } catch{
    logger.warn( 'Gmail: revoking the token at Google failed; deleting it locally' )
  }

  deleteAccount( userId )
  deleteHealth( userId, 'gmail_connection', userId )
  cached.delete( userId )
}
