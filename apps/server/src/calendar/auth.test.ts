// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Calendar
import {
  CalendarAuthError,
  CalendarNotConfiguredError,
  CalendarNotConnectedError,
  MissingCalendarScopeError,
  MissingRefreshTokenError,
  OAuthStateError,
  SCOPES,
  completeConsent,
  createConsentUrl,
  disconnect,
  getCalendarClient,
  withCalendar,
} from './auth.js'
import { encryptToken } from '../google/tokenCipher.js'
// Repositories
import {
  findCalendarAccount,
  saveCalendarAccount,
} from '../repositories/calendarAccount.repository.js'
import { getHealth } from '../repositories/health.repository.js'
// Logging
import { logger } from '../logger.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

const key = Buffer.alloc( 32, 3 )
const REDIRECT = 'https://atlas.example/api/calendar/oauth/callback'
const refreshToken = '1//0g-secret-refresh-token'
const authCode = '4/0A-secret-auth-code'

const mocks = vi.hoisted( () => ( {
  generateAuthUrl: vi.fn(),
  getToken: vi.fn(),
  setCredentials: vi.fn(),
  revokeToken: vi.fn(),
  getPrimary: vi.fn(),
  oauthInstances: [] as { redirectUri: string }[],
  calendarOptions: [] as Record< string, unknown >[],
} ) )

vi.mock( '@googleapis/calendar', () => {
  class MockOAuth2 {
    redirectUri: string

    constructor( _id: string, _secret: string, redirectUri: string ) {
      this.redirectUri = redirectUri
      mocks.oauthInstances.push( this )
    }

    generateAuthUrl = mocks.generateAuthUrl
    getToken = mocks.getToken
    setCredentials = mocks.setCredentials
    revokeToken = mocks.revokeToken
  }

  return {
    auth: { OAuth2: MockOAuth2 },
    calendar: vi.fn( ( options: Record< string, unknown > ) => {
      mocks.calendarOptions.push( options )

      return { calendarList: { get: mocks.getPrimary }, options }
    } ),
  }
} )

const configMock = vi.hoisted( () => ( {
  gmail: null as Record< string, unknown > | null,
  calendar: {
    redirectUri: null as string | null,
    lookbackDays: 14,
    apiBaseUrl: null as string | null,
  },
  logLevel: 'silent',
  sessionDays: 30,
} ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )

let userId = ''

const connect = (): void => {
  saveCalendarAccount( userId, {
    email: 'naresh@example.com',
    refresh_token_enc: encryptToken( refreshToken, key ),
    scope: SCOPES.join( ' ' ),
    status: 'connected',
    error: null,
    connected_at: '2026-11-10T09:00:00.000Z',
  } )
}

const stateFromLastUrl = (): string => {
  const [ options ] = mocks.generateAuthUrl.mock.calls.at( -1 )! as [ { state: string } ]

  return options.state
}

const grant = ( scope = SCOPES.join( ' ' ), token: string | null = refreshToken ): void => {
  mocks.getToken.mockResolvedValueOnce( { tokens: { refresh_token: token, scope } } )
  mocks.getPrimary.mockResolvedValue( { data: { id: 'naresh@example.com' } } )
}

beforeEach( () => {
  vi.resetAllMocks()
  mocks.oauthInstances.length = 0
  mocks.calendarOptions.length = 0
  mocks.generateAuthUrl.mockReturnValue( 'https://accounts.google.com/consent' )
  configMock.gmail = { clientId: 'id', clientSecret: 'secret', encryptionKey: key }
  configMock.calendar = { redirectUri: REDIRECT, lookbackDays: 14, apiBaseUrl: null }
  userId = defaultTestAdmin().id
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'the scopes', () => {
  it( 'are the calendar list and events, both read-only', () => {
    expect( SCOPES ).toEqual( [
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ] )
  } )
} )

describe( 'createConsentUrl', () => {
  it( 'asks for offline access to both scopes and returns on the configured redirect', () => {
    expect( createConsentUrl( userId ) ).toBe( 'https://accounts.google.com/consent' )
    expect( mocks.generateAuthUrl ).toHaveBeenCalledWith( expect.objectContaining( {
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state: expect.stringMatching( /^[0-9a-f]{64}$/ ) as string,
    } ) )
    expect( mocks.oauthInstances.at( -1 )?.redirectUri ).toBe( REDIRECT )
  } )

  it( 'is not configured without a redirect URI, or without the Google client', () => {
    configMock.calendar = { ...configMock.calendar, redirectUri: null }
    expect( () => createConsentUrl( userId ) ).toThrow( CalendarNotConfiguredError )

    configMock.calendar = { ...configMock.calendar, redirectUri: REDIRECT }
    configMock.gmail = null
    expect( () => createConsentUrl( userId ) ).toThrow( CalendarNotConfiguredError )
  } )
} )

describe( 'completeConsent', () => {
  it( 'stores the encrypted token and email, connected, and records the check', async () => {
    createConsentUrl( userId )
    grant()
    await completeConsent( userId, { code: authCode, state: stateFromLastUrl() } )

    const stored = findCalendarAccount( userId )

    expect( stored ).toMatchObject( {
      email: 'naresh@example.com',
      scope: SCOPES.join( ' ' ),
      status: 'connected',
      error: null,
    } )
    expect( stored?.refresh_token_enc ).not.toContain( refreshToken )
    expect( getHealth( userId, 'calendar_connection', userId )?.last_error ).toBeNull()
  } )

  it( 'refuses an unknown, spent or other user\'s state without calling Google', async () => {
    createConsentUrl( userId )

    const state = stateFromLastUrl()

    await expect( completeConsent( createTestUser().id, { code: authCode, state } ) )
      .rejects.toThrow( OAuthStateError )
    await expect( completeConsent( userId, { code: authCode, state } ) )
      .rejects.toThrow( OAuthStateError )
    expect( mocks.getToken ).not.toHaveBeenCalled()
  } )

  it( 'refuses a grant with no refresh token', async () => {
    createConsentUrl( userId )
    grant( SCOPES.join( ' ' ), null )

    await expect( completeConsent( userId, { code: authCode, state: stateFromLastUrl() } ) )
      .rejects.toThrow( MissingRefreshTokenError )
    expect( findCalendarAccount( userId ) ).toBeUndefined()
  } )

  it( 'refuses a grant missing either scope', async () => {
    createConsentUrl( userId )
    grant( SCOPES[ 0 ] )

    await expect( completeConsent( userId, { code: authCode, state: stateFromLastUrl() } ) )
      .rejects.toThrow( MissingCalendarScopeError )
    expect( findCalendarAccount( userId ) ).toBeUndefined()
  } )

  it( 'never logs the authorization code', async () => {
    const spies = ( [ 'info', 'warn', 'error', 'debug' ] as const )
      .map( ( method ) => vi.spyOn( logger, method ).mockImplementation( () => undefined ) )

    createConsentUrl( userId )
    mocks.getToken.mockRejectedValueOnce( new Error( `bad code ${ authCode }` ) )

    await expect( completeConsent( userId, { code: authCode, state: stateFromLastUrl() } ) )
      .rejects.toThrow()
    expect( JSON.stringify( spies.flatMap( ( spy ) => spy.mock.calls ) ) ).not.toContain( authCode )
  } )
} )

describe( 'getCalendarClient', () => {
  it( 'is not connected without an account', () => {
    expect( () => getCalendarClient( userId ) ).toThrow( CalendarNotConnectedError )
  } )

  it( 'builds a client from the decrypted token and caches it', () => {
    connect()

    const first = getCalendarClient( userId )

    expect( mocks.setCredentials ).toHaveBeenCalledWith( { refresh_token: refreshToken } )
    expect( getCalendarClient( userId ) ).toBe( first )
  } )

  it( 'sends requests to the test host when CALENDAR_API_BASE_URL is set', () => {
    configMock.calendar = { ...configMock.calendar, apiBaseUrl: 'http://fakes:4000' }
    connect()
    getCalendarClient( userId )

    expect( mocks.calendarOptions.at( -1 ) ).toMatchObject( { rootUrl: 'http://fakes:4000' } )
  } )

  it( 'marks the connection broken when the stored token can\'t be decrypted', () => {
    saveCalendarAccount( userId, {
      email: 'naresh@example.com',
      refresh_token_enc: 'v1:garbage',
      scope: SCOPES.join( ' ' ),
      status: 'connected',
      error: null,
      connected_at: '2026-11-10T09:00:00.000Z',
    } )

    expect( () => getCalendarClient( userId ) ).toThrow( CalendarNotConnectedError )
    expect( findCalendarAccount( userId ) ).toMatchObject( { status: 'broken' } )
    expect( getHealth( userId, 'calendar_connection', userId )?.last_error )
      .toContain( 'reconnect' )
  } )

  it( 'refuses a broken connection with its reason, without calling Google', () => {
    connect()
    withCalendarBroken()

    expect( () => getCalendarClient( userId ) ).toThrow( CalendarAuthError )
  } )
} )

const withCalendarBroken = (): void => {
  saveCalendarAccount( userId, {
    email: 'naresh@example.com',
    refresh_token_enc: encryptToken( refreshToken, key ),
    scope: SCOPES.join( ' ' ),
    status: 'broken',
    error: 'Revoked',
    connected_at: '2026-11-10T09:00:00.000Z',
  } )
}

describe( 'withCalendar', () => {
  it( 'records a passing check on success', async () => {
    connect()

    await expect( withCalendar( userId, () => Promise.resolve( 'fine' ) ) ).resolves.toBe( 'fine' )
    expect( getHealth( userId, 'calendar_connection', userId )?.last_error ).toBeNull()
  } )

  it( 'marks the connection broken when Google rejects the access', async () => {
    connect()

    await expect( withCalendar( userId, () => Promise.reject(
      Object.assign( new Error( 'invalid_grant' ), {
        code: 400,
        response: { data: { error: 'invalid_grant' } },
      } ),
    ) ) ).rejects.toThrow( CalendarAuthError )

    expect( findCalendarAccount( userId )?.status ).toBe( 'broken' )
    expect( getHealth( userId, 'calendar_connection', userId )?.last_error )
      .toContain( 'no longer accepts' )
  } )

  it( 'passes other errors through and leaves the status alone', async () => {
    connect()

    const failure = Object.assign( new Error( 'Backend Error' ), { code: 500 } )

    await expect( withCalendar( userId, () => Promise.reject( failure ) ) ).rejects.toBe( failure )
    expect( findCalendarAccount( userId )?.status ).toBe( 'connected' )
  } )
} )

describe( 'disconnect', () => {
  it( 'revokes the token, deletes the account and the health row', async () => {
    connect()
    await withCalendar( userId, () => Promise.resolve( 'fine' ) )
    await disconnect( userId )

    expect( mocks.revokeToken ).toHaveBeenCalledWith( refreshToken )
    expect( findCalendarAccount( userId ) ).toBeUndefined()
    expect( getHealth( userId, 'calendar_connection', userId ) ).toBeUndefined()
  } )

  it( 'still deletes the account when the revoke fails, without logging the token', async () => {
    const spies = ( [ 'info', 'warn', 'error', 'debug' ] as const )
      .map( ( method ) => vi.spyOn( logger, method ).mockImplementation( () => undefined ) )

    connect()
    mocks.revokeToken.mockRejectedValueOnce( new Error( `token=${ refreshToken }` ) )
    await disconnect( userId )

    expect( findCalendarAccount( userId ) ).toBeUndefined()
    expect( JSON.stringify( spies.flatMap( ( spy ) => spy.mock.calls ) ) )
      .not.toContain( refreshToken )
  } )

  it( 'does nothing with no account', async () => {
    await expect( disconnect( userId ) ).resolves.toBeUndefined()
    expect( mocks.revokeToken ).not.toHaveBeenCalled()
  } )
} )
