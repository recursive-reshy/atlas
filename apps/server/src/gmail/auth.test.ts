// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
import type { MockInstance } from 'vitest'
// Gmail
import {
  GmailAuthError,
  GmailNotConfiguredError,
  GmailNotConnectedError,
  MissingRefreshTokenError,
  MissingScopeError,
  OAuthStateError,
  SCOPE,
  completeConsent,
  createConsentUrl,
  disconnect,
  getGmailClient,
  withGmail,
} from './auth.js'
import { decryptToken, encryptToken } from '../google/tokenCipher.js'
// Repositories
import {
  findAccount,
  saveAccount,
  setAccountStatus,
} from '../repositories/gmailAccount.repository.js'
import { getHealth } from '../repositories/health.repository.js'
// Logging
import { logger } from '../logger.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const key = Buffer.alloc( 32, 3 )
const ORIGIN = 'http://localhost:3100'
const refreshToken = '1//0g-secret-refresh-token'
const authCode = '4/0A-secret-auth-code'

const mocks = vi.hoisted( () => ( {
  generateAuthUrl: vi.fn(),
  getToken: vi.fn(),
  setCredentials: vi.fn(),
  revokeToken: vi.fn(),
  getProfile: vi.fn(),
  oauthInstances: [] as unknown[],
  gmailInstances: [] as unknown[],
} ) )

vi.mock( '@googleapis/gmail', () => {
  class MockOAuth2 {
    clientId: string
    clientSecret: string
    redirectUri: string

    constructor( clientId: string, clientSecret: string, redirectUri: string ) {
      this.clientId = clientId
      this.clientSecret = clientSecret
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
    gmail: vi.fn( ( options: unknown ) => {
      const client = { users: { getProfile: mocks.getProfile }, options }

      mocks.gmailInstances.push( client )
      return client
    } ),
  }
} )

const configMock = vi.hoisted( () => {
  const mock: {
    gmail: Record< string, unknown > | null
    logLevel: string
    sessionDays: number
  } = {
    gmail: null,
    logLevel: 'silent',
    sessionDays: 30,
  }

  return mock
} )

vi.mock( '../config.js', () => ( { config: configMock } ) )

const gmailConfig = {
  clientId: 'client-id',
  clientSecret: 'client-secret',
  encryptionKey: key,
}

const connectAccount = (): void => {
  saveAccount( userId, {
    email: 'naresh@example.com',
    refresh_token_enc: encryptToken( refreshToken, key ),
    scope: SCOPE,
    status: 'connected',
    error: null,
    connected_at: '2026-10-19T10:00:00.000Z',
  } )
}

const stateFromLastUrl = (): string => {
  const [ options ] = mocks.generateAuthUrl.mock.calls.at( -1 )! as [ { state: string } ]

  return options.state
}

const grantOnce = ( tokens: Record< string, unknown > ): void => {
  mocks.getToken.mockResolvedValueOnce( { tokens } )
  mocks.getProfile.mockResolvedValue( { data: { emailAddress: 'naresh@example.com' } } )
}

type LogSpy = MockInstance< ( ...args: unknown[] ) => void >

const logSpies = (): LogSpy[] => {
  return ( [ 'info', 'warn', 'error', 'debug' ] as const )
    .map( ( method ) => vi.spyOn( logger, method ).mockImplementation( () => undefined ) )
}

const logged = ( spies: LogSpy[] ): string => {
  return JSON.stringify( spies.flatMap( ( spy ) => spy.mock.calls ) )
}

beforeEach( () => {
  vi.resetAllMocks()
  mocks.oauthInstances.length = 0
  mocks.gmailInstances.length = 0
  mocks.generateAuthUrl.mockReturnValue( 'https://accounts.google.com/consent' )
  configMock.gmail = gmailConfig
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'createConsentUrl', () => {
  it( 'asks for offline, read-only access with a 64-hex state', () => {
    expect( createConsentUrl( userId, ORIGIN ) ).toBe( 'https://accounts.google.com/consent' )

    expect( mocks.generateAuthUrl ).toHaveBeenCalledWith( {
      access_type: 'offline',
      prompt: 'consent',
      scope: [ SCOPE ],
      state: expect.stringMatching( /^[0-9a-f]{64}$/ ) as string,
      include_granted_scopes: false,
    } )
    expect( SCOPE ).toBe( 'https://www.googleapis.com/auth/gmail.readonly' )
  } )

  it( 'builds the OAuth client from the config', () => {
    createConsentUrl( userId, ORIGIN )

    expect( mocks.oauthInstances[ 0 ] ).toMatchObject( {
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: `${ ORIGIN }/api/gmail/oauth/callback`,
    } )
  } )

  it( 'gives each call its own state', () => {
    createConsentUrl( userId, ORIGIN )
    const first = stateFromLastUrl()

    createConsentUrl( userId, ORIGIN )

    expect( stateFromLastUrl() ).not.toBe( first )
  } )

  it( 'throws when Gmail is not configured', () => {
    configMock.gmail = null

    expect( () => createConsentUrl( userId, ORIGIN ) ).toThrow( GmailNotConfiguredError )
  } )
} )

describe( 'completeConsent', () => {
  it( 'saves the account with an encrypted refresh token', async () => {
    vi.useFakeTimers( { now: new Date( '2026-10-19T10:00:00.000Z' ) } )
    createConsentUrl( userId, ORIGIN )
    grantOnce( { refresh_token: refreshToken, scope: `openid ${ SCOPE }` } )

    await completeConsent( userId, { code: authCode, state: stateFromLastUrl() } )

    const account = findAccount( userId )

    expect( mocks.getToken ).toHaveBeenCalledWith( authCode )
    expect( account ).toMatchObject( {
      email: 'naresh@example.com',
      scope: SCOPE,
      status: 'connected',
      error: null,
      connected_at: '2026-10-19T10:00:00.000Z',
    } )
    expect( account?.refresh_token_enc ).not.toContain( refreshToken )
    expect( decryptToken( account?.refresh_token_enc ?? '', key ) ).toBe( refreshToken )
  } )

  it( 'clears an earlier connection failure when consent completes', async () => {
    connectAccount()
    await expect( withGmail( userId, () => Promise.reject(
      Object.assign( new Error( 'Unauthorized' ), { code: 401 } ),
    ) ) ).rejects.toThrow( GmailAuthError )

    createConsentUrl( userId, ORIGIN )
    grantOnce( { refresh_token: refreshToken, scope: SCOPE } )
    await completeConsent( userId, { code: authCode, state: stateFromLastUrl() } )

    expect( getHealth( userId, 'gmail_connection', userId ) ).toMatchObject( {
      last_error: null,
      failing_since: null,
    } )
  } )

  it( 'replaces an account that needed a reconnect', async () => {
    connectAccount()
    setAccountStatus( userId, 'reconnect_needed', 'revoked' )
    createConsentUrl( userId, ORIGIN )
    grantOnce( { refresh_token: 'new-token', scope: SCOPE } )

    await completeConsent( userId, { code: authCode, state: stateFromLastUrl() } )

    expect( findAccount( userId ) ).toMatchObject( { status: 'connected', error: null } )
  } )

  it( 'refuses an unknown state', async () => {
    await expect( completeConsent( userId, { code: authCode, state: 'f'.repeat( 64 ) } ) )
      .rejects.toThrow( OAuthStateError )
    expect( mocks.getToken ).not.toHaveBeenCalled()
  } )

  it( 'refuses a state after ten minutes', async () => {
    vi.useFakeTimers()
    createConsentUrl( userId, ORIGIN )
    const state = stateFromLastUrl()

    vi.advanceTimersByTime( 10 * 60 * 1000 + 1 )

    await expect( completeConsent( userId, { code: authCode, state } ) )
      .rejects.toThrow( OAuthStateError )
  } )

  it( 'accepts a state just inside the ten minutes', async () => {
    vi.useFakeTimers()
    createConsentUrl( userId, ORIGIN )
    grantOnce( { refresh_token: refreshToken, scope: SCOPE } )
    const state = stateFromLastUrl()

    vi.advanceTimersByTime( 10 * 60 * 1000 - 1 )

    await expect( completeConsent( userId, { code: authCode, state } ) ).resolves.toBeUndefined()
  } )

  it( 'consumes the state on first use, even when consent fails', async () => {
    createConsentUrl( userId, ORIGIN )
    const state = stateFromLastUrl()

    mocks.getToken.mockResolvedValueOnce( { tokens: { scope: SCOPE } } )
    await expect( completeConsent( userId, { code: authCode, state } ) )
      .rejects.toThrow( MissingRefreshTokenError )

    grantOnce( { refresh_token: refreshToken, scope: SCOPE } )
    await expect( completeConsent( userId, { code: authCode, state } ) )
      .rejects.toThrow( OAuthStateError )
  } )

  it( 'drops the oldest state beyond twenty outstanding', async () => {
    createConsentUrl( userId, ORIGIN )
    const oldest = stateFromLastUrl()

    for( let count = 0; count < 20; count++ ) {
      createConsentUrl( userId, ORIGIN )
    }

    await expect( completeConsent( userId, { code: authCode, state: oldest } ) )
      .rejects.toThrow( OAuthStateError )
    expect( stateFromLastUrl() ).not.toBe( oldest )
  } )

  it( 'refuses a grant with no refresh token', async () => {
    createConsentUrl( userId, ORIGIN )
    grantOnce( { scope: SCOPE } )

    await expect( completeConsent( userId, { code: authCode, state: stateFromLastUrl() } ) )
      .rejects.toThrow( MissingRefreshTokenError )
    expect( findAccount( userId ) ).toBeUndefined()
  } )

  it( 'refuses a grant without the read-only scope', async () => {
    createConsentUrl( userId, ORIGIN )
    grantOnce( { refresh_token: refreshToken, scope: 'openid email' } )

    await expect( completeConsent( userId, { code: authCode, state: stateFromLastUrl() } ) )
      .rejects.toThrow( MissingScopeError )
    expect( findAccount( userId ) ).toBeUndefined()
  } )
} )

describe( 'getGmailClient', () => {
  it( 'throws GmailNotConnectedError with no account', () => {
    expect( () => getGmailClient( userId ) ).toThrow( GmailNotConnectedError )
  } )

  it( 'throws GmailNotConfiguredError when Gmail is not configured', () => {
    configMock.gmail = null

    expect( () => getGmailClient( userId ) ).toThrow( GmailNotConfiguredError )
  } )

  it( 'builds a client on the decrypted refresh token', () => {
    connectAccount()

    const client = getGmailClient( userId )

    expect( client ).toBe( mocks.gmailInstances[ 0 ] )
    expect( mocks.setCredentials ).toHaveBeenCalledWith( { refresh_token: refreshToken } )
  } )

  it( 'reuses the client until the account row changes', () => {
    connectAccount()
    const first = getGmailClient( userId )

    expect( getGmailClient( userId ) ).toBe( first )

    saveAccount(
      userId,
      { ...findAccount( userId )!, refresh_token_enc: encryptToken( 'other', key ) },
    )

    expect( getGmailClient( userId ) ).not.toBe( first )
    expect( mocks.gmailInstances ).toHaveLength( 2 )
  } )

  it( 'marks the account reconnect_needed when the token cannot be decrypted', () => {
    const spies = logSpies()

    saveAccount( userId, {
      email: 'naresh@example.com',
      refresh_token_enc: encryptToken( refreshToken, Buffer.alloc( 32, 9 ) ),
      scope: SCOPE,
      status: 'connected',
      error: null,
      connected_at: '2026-10-19T10:00:00.000Z',
    } )

    expect( () => getGmailClient( userId ) ).toThrow( GmailNotConnectedError )
    expect( findAccount( userId ) ).toMatchObject( {
      status: 'reconnect_needed',
      error: 'The stored Gmail access can\'t be read; reconnect',
    } )
    expect( logged( spies ) ).not.toContain( refreshToken )
  } )

  it( 'records the connection as failing when the token cannot be decrypted', () => {
    saveAccount( userId, {
      email: 'naresh@example.com',
      refresh_token_enc: encryptToken( refreshToken, Buffer.alloc( 32, 9 ) ),
      scope: SCOPE,
      status: 'connected',
      error: null,
      connected_at: '2026-10-19T10:00:00.000Z',
    } )

    expect( () => getGmailClient( userId ) ).toThrow( GmailNotConnectedError )
    expect( getHealth( userId, 'gmail_connection', userId )?.last_error )
      .toBe( 'The stored Gmail access can\'t be read; reconnect' )
  } )

  it( 'throws GmailAuthError while the account needs a reconnect', () => {
    connectAccount()
    setAccountStatus( userId, 'reconnect_needed', 'revoked' )

    expect( () => getGmailClient( userId ) ).toThrow( GmailAuthError )
  } )
} )

describe( 'withGmail', () => {
  const reason = 'Google no longer accepts Atlas\'s access '
    + '(revoked, expired, or the app is in Testing)'

  it( 'passes the client to the function and returns its result', async () => {
    connectAccount()

    const result = await withGmail( userId, ( client ) => Promise.resolve( client ) )

    expect( result ).toBe( mocks.gmailInstances[ 0 ] )
  } )

  it.each( [
    [
      'invalid_grant in the response',
      Object.assign( new Error( 'failed' ), { response: { data: { error: 'invalid_grant' } } } ),
    ],
    [ 'invalid_grant in the message', new Error( 'invalid_grant: Token has been expired' ) ],
    [ 'a 401 code', Object.assign( new Error( 'Unauthorized' ), { code: 401 } ) ],
    [
      'a 401 response status',
      Object.assign( new Error( 'Unauthorized' ), { response: { status: 401 } } ),
    ],
  ] )( 'turns %s into GmailAuthError and reconnect_needed', async ( _name, failure ) => {
    const spies = logSpies()

    connectAccount()

    await expect( withGmail( userId, () => Promise.reject( failure ) ) )
      .rejects.toThrow( GmailAuthError )
    expect( findAccount( userId ) ).toMatchObject( { status: 'reconnect_needed', error: reason } )
    expect( logged( spies ) ).not.toContain( refreshToken )
  } )

  it( 'records the connection as ok after a call that works', async () => {
    connectAccount()

    await withGmail( userId, () => Promise.resolve( 'fine' ) )

    expect( getHealth( userId, 'gmail_connection', userId ) ).toMatchObject( { last_error: null } )
    expect( getHealth( userId, 'gmail_connection', userId )?.last_success_at ).not.toBeNull()
  } )

  it( 'records the connection as failing when Google rejects the access', async () => {
    connectAccount()

    await expect( withGmail( userId, () => Promise.reject(
      Object.assign( new Error( 'Unauthorized' ), { code: 401 } ),
    ) ) ).rejects.toThrow( GmailAuthError )

    expect( getHealth( userId, 'gmail_connection', userId )?.last_error ).toBe( reason )
  } )

  it( 'does not touch the connection health on another kind of error', async () => {
    connectAccount()

    await expect( withGmail( userId, () => Promise.reject(
      Object.assign( new Error( 'Backend Error' ), { code: 500 } ),
    ) ) ).rejects.toThrow( 'Backend Error' )

    expect( getHealth( userId, 'gmail_connection', userId ) ).toBeUndefined()
  } )

  it( 'passes other errors through and leaves the status alone', async () => {
    connectAccount()
    const failure = Object.assign( new Error( 'Backend Error' ), { code: 500 } )

    await expect( withGmail( userId, () => Promise.reject( failure ) ) ).rejects.toBe( failure )
    expect( findAccount( userId )?.status ).toBe( 'connected' )
  } )
} )

describe( 'disconnect', () => {
  it( 'revokes the token, deletes the account and drops the cached client', async () => {
    connectAccount()
    const first = getGmailClient( userId )

    await disconnect( userId )

    expect( mocks.revokeToken ).toHaveBeenCalledWith( refreshToken )
    expect( findAccount( userId ) ).toBeUndefined()

    connectAccount()

    expect( getGmailClient( userId ) ).not.toBe( first )
  } )

  it( 'removes the connection health row', async () => {
    connectAccount()
    await withGmail( userId, () => Promise.resolve( 'fine' ) )

    await disconnect( userId )

    expect( getHealth( userId, 'gmail_connection', userId ) ).toBeUndefined()
  } )

  it( 'still deletes the account when the revoke fails, without logging the token', async () => {
    const spies = logSpies()

    connectAccount()
    mocks.revokeToken.mockRejectedValueOnce(
      new Error( `Request failed: token=${ refreshToken } Authorization: Bearer ya29.abc` ),
    )

    await disconnect( userId )

    expect( findAccount( userId ) ).toBeUndefined()
    expect( spies.some( ( spy ) => spy.mock.calls.length > 0 ) ).toBe( true )
    expect( logged( spies ) ).not.toContain( refreshToken )
    expect( logged( spies ) ).not.toContain( 'Bearer' )
  } )

  it( 'deletes the account even when the token cannot be decrypted', async () => {
    saveAccount( userId, {
      email: 'naresh@example.com',
      refresh_token_enc: 'v1:garbage',
      scope: SCOPE,
      status: 'connected',
      error: null,
      connected_at: '2026-10-19T10:00:00.000Z',
    } )

    await disconnect( userId )

    expect( mocks.revokeToken ).not.toHaveBeenCalled()
    expect( findAccount( userId ) ).toBeUndefined()
  } )

  it( 'does nothing with no account', async () => {
    await expect( disconnect( userId ) ).resolves.toBeUndefined()
    expect( mocks.revokeToken ).not.toHaveBeenCalled()
  } )
} )

describe( 'logging', () => {
  it( 'never logs the authorization code on a failed consent', async () => {
    const spies = logSpies()

    createConsentUrl( userId, ORIGIN )
    mocks.getToken.mockRejectedValueOnce( new Error( `bad code ${ authCode }` ) )

    await expect( completeConsent( userId, { code: authCode, state: stateFromLastUrl() } ) )
      .rejects.toThrow()
    expect( logged( spies ) ).not.toContain( authCode )
  } )
} )

describe( 'Gmail for two users', () => {
  it( 'refuses a consent state that was issued to another user, and spends it', async () => {
    const other = createTestUser().id

    createConsentUrl( userId, ORIGIN )
    const state = stateFromLastUrl()

    await expect( completeConsent( other, { code: authCode, state } ) )
      .rejects.toThrow( OAuthStateError )
    await expect( completeConsent( userId, { code: authCode, state } ) )
      .rejects.toThrow( OAuthStateError )

    expect( mocks.getToken ).not.toHaveBeenCalled()
    expect( findAccount( userId ) ).toBeUndefined()
    expect( findAccount( other ) ).toBeUndefined()
  } )

  it( 'asks Google to return to the origin the user came from', async () => {
    const tailnet = 'https://mac.tail1234.ts.net'

    createConsentUrl( userId, tailnet )
    grantOnce( { refresh_token: refreshToken, scope: SCOPE } )
    await completeConsent( userId, { code: authCode, state: stateFromLastUrl() } )

    expect( mocks.oauthInstances ).toMatchObject( [
      { redirectUri: `${ tailnet }/api/gmail/oauth/callback` },
      { redirectUri: `${ tailnet }/api/gmail/oauth/callback` },
    ] )
  } )

  it( 'keeps each user\'s account, health row and client apart', async () => {
    const other = createTestUser().id

    for( const user of [ userId, other ] ) {
      createConsentUrl( user, ORIGIN )
      grantOnce( { refresh_token: `token-for-${ user }`, scope: SCOPE } )
      await completeConsent( user, { code: authCode, state: stateFromLastUrl() } )
    }

    expect( decryptToken( findAccount( userId )?.refresh_token_enc ?? '', key ) )
      .toBe( `token-for-${ userId }` )
    expect( decryptToken( findAccount( other )?.refresh_token_enc ?? '', key ) )
      .toBe( `token-for-${ other }` )
    expect( getHealth( userId, 'gmail_connection', userId ) ).toBeDefined()
    expect( getHealth( other, 'gmail_connection', other ) ).toBeDefined()

    const mine = getGmailClient( userId )
    const theirs = getGmailClient( other )

    expect( theirs ).not.toBe( mine )
    expect( getGmailClient( userId ) ).toBe( mine )
    expect( getGmailClient( other ) ).toBe( theirs )
  } )

  it( 'marks only the user whose access Google rejected as needing a reconnect', async () => {
    const other = createTestUser().id

    connectAccount()
    saveAccount( other, {
      email: 'other@example.com',
      refresh_token_enc: encryptToken( refreshToken, key ),
      scope: SCOPE,
      status: 'connected',
      error: null,
      connected_at: '2026-10-19T10:00:00.000Z',
    } )

    await expect( withGmail( userId, () => Promise.reject(
      Object.assign( new Error( 'Unauthorized' ), { code: 401 } ),
    ) ) ).rejects.toThrow( GmailAuthError )

    expect( findAccount( userId )?.status ).toBe( 'reconnect_needed' )
    expect( findAccount( other )?.status ).toBe( 'connected' )
    expect( getHealth( other, 'gmail_connection', other ) ).toBeUndefined()
  } )

  it( 'disconnects only the user who asked', async () => {
    const other = createTestUser().id

    connectAccount()
    saveAccount( other, { ...findAccount( userId )!, email: 'other@example.com' } )

    await disconnect( userId )

    expect( findAccount( userId ) ).toBeUndefined()
    expect( findAccount( other )?.email ).toBe( 'other@example.com' )
  } )
} )
