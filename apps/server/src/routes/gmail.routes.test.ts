// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Shared
import { GetGmailAccountResponse, ListGmailLabelsResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Test support
import { signedInRequest as request } from '../test-support/auth.js'
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
  withGmail,
} from '../gmail/auth.js'
// Repositories
import { saveAccount, setAccountStatus } from '../repositories/gmailAccount.repository.js'
// Logging
import { logger } from '../logger.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../gmail/auth.js', async ( importOriginal ) => ( {
  ...await importOriginal< typeof import( '../gmail/auth.js' ) >(),
  createConsentUrl: vi.fn(),
  completeConsent: vi.fn(),
  disconnect: vi.fn(),
  withGmail: vi.fn(),
} ) )

const configMock = vi.hoisted( () => {
  const mock: { gmail: Record< string, unknown > | null } = { gmail: null }

  return mock
} )

vi.mock( '../config.js', async ( importOriginal ) => {
  const { config } = await importOriginal< typeof import( '../config.js' ) >()

  return { config: Object.assign( configMock, config, { gmail: configMock.gmail } ) }
} )

const ORIGIN_HOST = 'localhost:3100'
const consentUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=abc'
const refreshToken = 'v1:secret-ciphertext'

const connect = (): void => {
  saveAccount( userId, {
    email: 'naresh@example.com',
    refresh_token_enc: refreshToken,
    scope: 'https://www.googleapis.com/auth/gmail.readonly',
    status: 'connected',
    error: null,
    connected_at: '2026-10-19T10:00:00.000Z',
  } )
}

const configured = (): void => {
  configMock.gmail = { clientId: 'id', clientSecret: 'secret' }
}

const listLabelsWith = ( labels: { id: string, name: string, type: string }[] ): void => {
  vi.mocked( withGmail ).mockImplementation( ( _userId, run ) => run( {
    users: { labels: { list: () => Promise.resolve( { data: { labels } } ) } },
  } as never ) )
}

beforeEach( () => {
  vi.resetAllMocks()
  configured()
} )

describe( 'GET /api/gmail/account', () => {
  it( 'is not_configured when the environment is missing', async () => {
    configMock.gmail = null

    const response = await request( app ).get( '/api/gmail/account' )

    expect( response.status ).toBe( 200 )
    expect( GetGmailAccountResponse.parse( response.body ).account ).toEqual( {
      status: 'not_configured',
      email: null,
      connected_at: null,
      error: null,
    } )
  } )

  it( 'is not_connected with no account', async () => {
    const response = await request( app ).get( '/api/gmail/account' )

    expect( GetGmailAccountResponse.parse( response.body ).account.status ).toBe( 'not_connected' )
  } )

  it( 'is connected with the address and the time', async () => {
    connect()

    const response = await request( app ).get( '/api/gmail/account' )

    expect( GetGmailAccountResponse.parse( response.body ).account ).toEqual( {
      status: 'connected',
      email: 'naresh@example.com',
      connected_at: '2026-10-19T10:00:00.000Z',
      error: null,
    } )
  } )

  it( 'is reconnect_needed with the reason', async () => {
    connect()
    setAccountStatus( userId, 'reconnect_needed', 'Google no longer accepts access' )

    const response = await request( app ).get( '/api/gmail/account' )

    expect( GetGmailAccountResponse.parse( response.body ).account ).toMatchObject( {
      status: 'reconnect_needed',
      email: 'naresh@example.com',
      error: 'Google no longer accepts access',
    } )
  } )

  it( 'never returns the stored token', async () => {
    connect()

    const response = await request( app ).get( '/api/gmail/account' )

    expect( JSON.stringify( response.body ) ).not.toContain( refreshToken )
    expect( JSON.stringify( response.body ) ).not.toContain( 'refresh_token' )
  } )
} )

describe( 'GET /api/gmail/connect', () => {
  it( 'redirects to the consent URL', async () => {
    vi.mocked( createConsentUrl ).mockReturnValue( consentUrl )

    const response = await request( app ).get( '/api/gmail/connect' ).set( 'Host', ORIGIN_HOST )

    expect( response.status ).toBe( 302 )
    expect( response.headers.location ).toBe( consentUrl )
    expect( createConsentUrl ).toHaveBeenCalledWith( userId, `http://${ ORIGIN_HOST }` )
  } )

  it( 'asks for consent with the origin the request came to', async () => {
    vi.mocked( createConsentUrl ).mockReturnValue( consentUrl )

    await request( app )
      .get( '/api/gmail/connect' )
      .set( 'X-Forwarded-Proto', 'http' )
      .set( 'X-Forwarded-Host', ORIGIN_HOST )
      .set( 'Host', ORIGIN_HOST )

    expect( createConsentUrl ).toHaveBeenCalledWith( userId, `http://${ ORIGIN_HOST }` )
  } )

  it( 'is 400 for an address that is not in APP_ORIGINS', async () => {
    const response = await request( app ).get( '/api/gmail/connect' ).set( 'Host', 'evil.example' )

    expect( response.status ).toBe( 400 )
    expect( createConsentUrl ).not.toHaveBeenCalled()
  } )

  it( 'is 409 when Gmail is not configured', async () => {
    configMock.gmail = null

    const response = await request( app ).get( '/api/gmail/connect' ).set( 'Host', ORIGIN_HOST )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Gmail isn\'t configured' } )
    expect( createConsentUrl ).not.toHaveBeenCalled()
  } )
} )

describe( 'GET /api/gmail/oauth/callback', () => {
  it( 'completes the consent and redirects to Settings', async () => {
    const response = await request( app )
      .get( '/api/gmail/oauth/callback?code=the-code&state=the-state' )

    expect( response.status ).toBe( 302 )
    expect( response.headers.location ).toBe( '/settings?gmail=connected' )
    expect( completeConsent )
      .toHaveBeenCalledWith( userId, { code: 'the-code', state: 'the-state' } )
  } )

  it.each( [
    [ 'a refused consent', '?error=access_denied&state=s', undefined, 'denied' ],
    [ 'another Google error', '?error=server_error&state=s', undefined, 'failed' ],
    [ 'an unknown state', '?code=c&state=s', new OAuthStateError(), 'state' ],
    [ 'a missing state', '?code=c', undefined, 'state' ],
    [ 'no refresh token', '?code=c&state=s', new MissingRefreshTokenError(), 'no_refresh_token' ],
    [ 'a missing scope', '?code=c&state=s', new MissingScopeError(), 'scope' ],
    [ 'any other failure', '?code=c&state=s', new Error( 'boom' ), 'failed' ],
    [ 'a missing code', '?state=s', undefined, 'failed' ],
  ] )( 'redirects with the reason for %s', async ( _name, query, failure, reason ) => {
    vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )

    if( failure !== undefined ) {
      vi.mocked( completeConsent ).mockRejectedValue( failure )
    }

    const response = await request( app ).get( `/api/gmail/oauth/callback${ query }` )

    expect( response.status ).toBe( 302 )
    expect( response.headers.location ).toBe( `/settings?gmail=error&reason=${ reason }` )
  } )

  it( 'redirects with failed when Gmail is not configured', async () => {
    configMock.gmail = null

    const response = await request( app ).get( '/api/gmail/oauth/callback?code=c&state=s' )

    expect( response.status ).toBe( 302 )
    expect( response.headers.location ).toBe( '/settings?gmail=error&reason=failed' )
  } )

  it( 'never puts the code or a token in the redirect', async () => {
    vi.mocked( completeConsent ).mockRejectedValue( new Error( 'bad code 4/secret-code' ) )
    vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )

    const response = await request( app )
      .get( '/api/gmail/oauth/callback?code=4/secret-code&state=s' )

    expect( response.headers.location ).not.toContain( 'secret-code' )
  } )
} )

describe( 'POST /api/gmail/disconnect', () => {
  it( 'disconnects and answers 204', async () => {
    const response = await request( app ).post( '/api/gmail/disconnect' )

    expect( response.status ).toBe( 204 )
    expect( disconnect ).toHaveBeenCalledOnce()
  } )

  it( 'is 409 when Gmail is not configured', async () => {
    configMock.gmail = null

    const response = await request( app ).post( '/api/gmail/disconnect' )

    expect( response.status ).toBe( 409 )
    expect( disconnect ).not.toHaveBeenCalled()
  } )
} )

describe( 'GET /api/gmail/labels', () => {
  it( 'lists user labels first, then INBOX, each by name', async () => {
    listLabelsWith( [
      { id: 'SENT', name: 'SENT', type: 'system' },
      { id: 'Label_2', name: 'newsletters', type: 'user' },
      { id: 'INBOX', name: 'INBOX', type: 'system' },
      { id: 'Label_1', name: 'Jobs', type: 'user' },
      { id: 'SPAM', name: 'SPAM', type: 'system' },
    ] )

    const response = await request( app ).get( '/api/gmail/labels' )

    expect( response.status ).toBe( 200 )
    expect( ListGmailLabelsResponse.parse( response.body ).labels ).toEqual( [
      { id: 'Label_1', name: 'Jobs', type: 'user' },
      { id: 'Label_2', name: 'newsletters', type: 'user' },
      { id: 'INBOX', name: 'INBOX', type: 'system' },
    ] )
  } )

  it( 'is 409 when Gmail is not configured', async () => {
    configMock.gmail = null

    const response = await request( app ).get( '/api/gmail/labels' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Gmail isn\'t configured' } )
  } )

  it( 'is 409 when Gmail is not connected', async () => {
    vi.mocked( withGmail ).mockRejectedValue( new GmailNotConnectedError() )

    const response = await request( app ).get( '/api/gmail/labels' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Gmail isn\'t connected' } )
  } )

  it( 'is 409 with the reason when a reconnect is needed', async () => {
    vi.mocked( withGmail ).mockRejectedValue( new GmailAuthError( 'Access was revoked' ) )

    const response = await request( app ).get( '/api/gmail/labels' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Access was revoked' } )
  } )
} )
