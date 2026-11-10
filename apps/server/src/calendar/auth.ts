// Packages
import { auth, calendar } from '@googleapis/calendar'
import type { calendar_v3 } from '@googleapis/calendar'
// Config
import { config } from '../config.js'
// Google
import { createOAuthStateStore } from '../google/oauthState.js'
import { TokenDecryptError, decryptToken, encryptToken } from '../google/tokenCipher.js'
// Repositories
import {
  deleteCalendarAccount,
  findCalendarAccount,
  saveCalendarAccount,
  setCalendarStatus,
} from '../repositories/calendarAccount.repository.js'
import type { StoredCalendarAccount } from '../repositories/calendarAccount.repository.js'
import { deleteHealth } from '../repositories/health.repository.js'
// Services
import { recordCheck } from '../services/health.service.js'
// Logging
import { logger } from '../logger.js'

// Read-only: the calendars the person has, and the events in one of them (ADR 0108)
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
]

// One subject per user: the connection's ID is the user's ID
const connectionOf = ( userId: string ): { kind: 'calendar_connection', id: string } => {
  return { kind: 'calendar_connection', id: userId }
}

const UNREADABLE_REASON = 'The stored Calendar access can\'t be read; reconnect'
const REVOKED_REASON = 'Google no longer accepts Atlas\'s Calendar access '
  + '(revoked, expired, or the app is in Testing)'

export class CalendarNotConfiguredError extends Error {
  constructor() {
    super( 'Calendar isn\'t configured' )
    this.name = 'CalendarNotConfiguredError'
  }
}

export class CalendarNotConnectedError extends Error {
  constructor( message = 'Calendar isn\'t connected' ) {
    super( message )
    this.name = 'CalendarNotConnectedError'
  }
}

export class CalendarAuthError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'CalendarAuthError'
  }
}

export class OAuthStateError extends Error {
  constructor() {
    super( 'The Calendar consent request is unknown or has expired' )
    this.name = 'OAuthStateError'
  }
}

export class MissingRefreshTokenError extends Error {
  constructor() {
    super( 'Google did not return a refresh token' )
    this.name = 'MissingRefreshTokenError'
  }
}

export class MissingCalendarScopeError extends Error {
  constructor() {
    super( 'Google did not grant read-only Calendar access' )
    this.name = 'MissingCalendarScopeError'
  }
}

type GoogleClient = NonNullable< typeof config.gmail >
type OAuthClient = InstanceType< typeof auth.OAuth2 >

type Settings = { google: GoogleClient, redirectUri: string }

const states = createOAuthStateStore()
const cached = new Map< string, { key: string, client: calendar_v3.Calendar } >()

// The same OAuth client as Gmail; the feature also needs its own redirect URI
const requireConfig = (): Settings => {
  const { redirectUri } = config.calendar

  if( config.gmail === null || redirectUri === null ) {
    throw new CalendarNotConfiguredError()
  }

  return { google: config.gmail, redirectUri }
}

const buildOAuthClient = ( { google }: Settings, redirectUri?: string ): OAuthClient => {
  return new auth.OAuth2( google.clientId, google.clientSecret, redirectUri )
}

const buildClient = ( oauth: OAuthClient ): calendar_v3.Calendar => calendar( {
  version: 'v3',
  auth: oauth,
  ...config.calendar.apiBaseUrl === null ? {} : { rootUrl: config.calendar.apiBaseUrl },
} )

export const createConsentUrl = ( userId: string ): string => {
  const settings = requireConfig()
  const oauth = buildOAuthClient( settings, settings.redirectUri )

  return oauth.generateAuthUrl( {
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: states.create( userId, settings.redirectUri ),
    include_granted_scopes: false,
  } )
}

export const completeConsent = async (
  userId: string,
  { code, state }: { code: string, state: string },
): Promise< void > => {
  const settings = requireConfig()

  if( states.consume( userId, state ) === undefined ) {
    throw new OAuthStateError()
  }

  const oauth = buildOAuthClient( settings, settings.redirectUri )
  const { tokens } = await oauth.getToken( code )

  if( !tokens.refresh_token ) {
    throw new MissingRefreshTokenError()
  }

  const granted = ( tokens.scope ?? '' ).split( ' ' )

  if( !SCOPES.every( ( scope ) => granted.includes( scope ) ) ) {
    throw new MissingCalendarScopeError()
  }

  oauth.setCredentials( tokens )

  // The primary calendar's ID is the account's email address
  const { data } = await buildClient( oauth ).calendarList.get( { calendarId: 'primary' } )

  saveCalendarAccount( userId, {
    email: data.id ?? '',
    refresh_token_enc: encryptToken( tokens.refresh_token, settings.google.encryptionKey ),
    scope: SCOPES.join( ' ' ),
    status: 'connected',
    error: null,
    connected_at: new Date().toISOString(),
  } )
  recordCheck( userId, connectionOf( userId ), { ok: true } )
  cached.delete( userId )
}

const readToken = (
  userId: string,
  account: StoredCalendarAccount,
  { google }: Settings,
): string => {
  try {
    return decryptToken( account.refresh_token_enc, google.encryptionKey )
  } catch( error ) {
    if( !( error instanceof TokenDecryptError ) ) {
      throw error
    }

    logger.error( 'Calendar: the stored refresh token could not be decrypted' )
    setCalendarStatus( userId, 'broken', UNREADABLE_REASON )
    recordCheck( userId, connectionOf( userId ), { ok: false, message: UNREADABLE_REASON } )
    throw new CalendarNotConnectedError( UNREADABLE_REASON )
  }
}

export const getCalendarClient = ( userId: string ): calendar_v3.Calendar => {
  const settings = requireConfig()
  const account = findCalendarAccount( userId )

  if( account === undefined ) {
    throw new CalendarNotConnectedError()
  }

  if( account.status === 'broken' ) {
    throw new CalendarAuthError( account.error ?? REVOKED_REASON )
  }

  const hit = cached.get( userId )

  if( hit?.key === account.refresh_token_enc ) {
    return hit.client
  }

  const oauth = buildOAuthClient( settings )

  oauth.setCredentials( { refresh_token: readToken( userId, account, settings ) } )

  const client = buildClient( oauth )

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

// Runs one Calendar call and keeps the connection's health and status current
export const withCalendar = async < T >(
  userId: string,
  run: ( client: calendar_v3.Calendar ) => Promise< T >,
): Promise< T > => {
  const client = getCalendarClient( userId )

  try {
    const result = await run( client )

    recordCheck( userId, connectionOf( userId ), { ok: true } )

    return result
  } catch( error ) {
    if( !isAuthFailure( error ) ) {
      throw error
    }

    logger.warn( 'Calendar: Google rejected the stored access' )
    setCalendarStatus( userId, 'broken', REVOKED_REASON )
    recordCheck( userId, connectionOf( userId ), { ok: false, message: REVOKED_REASON } )
    cached.delete( userId )
    throw new CalendarAuthError( REVOKED_REASON )
  }
}

export const disconnect = async ( userId: string ): Promise< void > => {
  const settings = requireConfig()
  const account = findCalendarAccount( userId )

  if( account === undefined ) {
    return
  }

  try {
    await buildOAuthClient( settings )
      .revokeToken( decryptToken( account.refresh_token_enc, settings.google.encryptionKey ) )
  } catch{
    logger.warn( 'Calendar: revoking the token at Google failed; deleting it locally' )
  }

  deleteCalendarAccount( userId )
  deleteHealth( userId, 'calendar_connection', userId )
  cached.delete( userId )
}
