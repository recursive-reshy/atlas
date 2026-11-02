// Node
import { createHash } from 'node:crypto'
// Packages
import request from 'supertest'
import {
  afterEach,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest'
// App
import { app } from '../app.js'
// Logging
import { logger } from '../logger.js'
// Repositories
import { findSession } from '../repositories/sessions.repository.js'
import { listModules } from '../repositories/userModules.repository.js'
import { getDatabase } from '../repositories/database.js'
import {
  bindGoogleSub,
  countUsers,
  findUserByEmail,
  insertUser,
  updateUser,
} from '../repositories/users.repository.js'
// Services
import { hashToken } from '../services/session.service.js'
import * as seedUserService from '../services/seedUser.service.js'
// Test support
import { createFakeGoogleSignIn } from '../test-support/googleSignIn.fake.js'
import type { FakeGoogleSignIn } from '../test-support/googleSignIn.fake.js'
import { createTestUser, signedIn } from '../test-support/auth.js'
import supertest from 'supertest'

const holder = vi.hoisted( () => ( { fake: undefined as FakeGoogleSignIn | undefined } ) )

vi.mock( '../clients/googleSignIn.client.js', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( '../clients/googleSignIn.client.js' ) >()

  return {
    ...original,
    createGoogleSignInClient: () => ( {
      buildSignInUrl: ( args: Parameters< FakeGoogleSignIn[ 'buildSignInUrl' ] >[ 0 ] ) => {
        return holder.fake?.buildSignInUrl( args ) ?? ''
      },
      exchangeSignInCode: ( args: Parameters< FakeGoogleSignIn[ 'exchangeSignInCode' ] >[ 0 ] ) => {
        return holder.fake?.exchangeSignInCode( args ) ?? Promise.reject( new Error( 'no fake' ) )
      },
    } ),
  }
} )

const HOST = 'localhost:3100'
const ORIGIN = `http://${ HOST }`
const OAUTH_COOKIE = 'atlas_oauth'

let fake: FakeGoogleSignIn

beforeEach( () => {
  fake = createFakeGoogleSignIn()
  holder.fake = fake
  vi.spyOn( logger, 'warn' )
} )

afterEach( () => {
  vi.restoreAllMocks()
  vi.useRealTimers()
} )

const cookiesOf = ( response: request.Response ): string[] => {
  return ( response.headers[ 'set-cookie' ] ?? [] ) as unknown as string[]
}

const cookieValue = ( response: request.Response, name: string ): string => {
  const line = cookiesOf( response ).find( ( cookie ) => cookie.startsWith( `${ name }=` ) )

  return line?.slice( name.length + 1 ).split( ';' )[ 0 ] ?? ''
}

type Pending = { state: string, verifier: string, returnTo: string, origin: string }

const payloadOf = ( value: string ): Pending => {
  return JSON.parse( Buffer.from( value.split( '.' )[ 0 ] ?? '', 'base64url' ).toString() ) as never
}

type Begun = { state: string, cookie: string, response: request.Response }

const begin = async ( returnTo?: string ): Promise< Begun > => {
  const response = await request( app )
    .get( '/api/auth/google' )
    .query( returnTo === undefined ? {} : { returnTo } )
    .set( 'Host', HOST )

  return {
    state: payloadOf( cookieValue( response, OAUTH_COOKIE ) ).state,
    cookie: cookieValue( response, OAUTH_COOKIE ),
    response,
  }
}

const callback = (
  { state, cookie, code = 'the-code' }: { state?: string, cookie?: string, code?: string },
): request.Test => {
  const call = request( app )
    .get( '/api/auth/callback' )
    .query( { ...( code === '' ? {} : { code } ), ...( state === undefined ? {} : { state } ) } )
    .set( 'Host', HOST )

  return cookie === undefined ? call : call.set( 'Cookie', `${ OAUTH_COOKIE }=${ cookie }` )
}

const identify = ( email: string, sub = 's', verified = true ): void => {
  fake.identity = { sub, email, email_verified: verified, name: 'Someone' }
}

const location = ( response: request.Response ): string => String( response.headers.location )

describe( 'GET /api/auth/google', () => {
  it( 'redirects to Google with a state, and signs a short-lived cookie holding it', async () => {
    const { response, state } = await begin( '/jobs/1?tab=2' )
    const cookie = cookiesOf( response ).find( ( line ) => line.startsWith( OAUTH_COOKIE ) ) ?? ''

    expect( response.status ).toBe( 302 )
    expect( location( response ) ).toBe( `https://accounts.google.test/auth?state=${ state }` )
    expect( cookie ).toContain( 'HttpOnly' )
    expect( cookie ).toContain( 'SameSite=Lax' )
    expect( cookie ).toContain( 'Max-Age=600' )
    expect( cookie ).toContain( 'Path=/api/auth' )
    expect( cookie ).not.toContain( 'Secure' )
    expect( payloadOf( cookieValue( response, OAUTH_COOKIE ) ) ).toMatchObject( {
      state,
      returnTo: '/jobs/1?tab=2',
      origin: ORIGIN,
    } )
  } )

  it( 'sends the S256 challenge of the verifier it stored', async () => {
    const { response } = await begin()
    const { verifier } = payloadOf( cookieValue( response, OAUTH_COOKIE ) )

    expect( fake.urls ).toHaveLength( 1 )
    expect( fake.urls[ 0 ]?.origin ).toBe( ORIGIN )
    expect( fake.urls[ 0 ]?.codeChallenge )
      .toBe( createHash( 'sha256' ).update( verifier ).digest( 'base64url' ) )
    expect( Buffer.from( verifier, 'base64url' ) ).toHaveLength( 32 )
  } )

  it( 'makes a new state each time', async () => {
    expect( ( await begin() ).state ).not.toBe( ( await begin() ).state )
  } )

  it.each( [
    [ 'a path with a query', '/jobs/1?x=1', '/jobs/1?x=1' ],
    [ 'the root', '/', '/' ],
    [ 'a protocol-relative URL', '//evil.test', '/' ],
    [ 'an absolute URL', 'https://evil.test/', '/' ],
    [ 'a backslash path', '/\\evil.test', '/' ],
    [ 'a relative path', 'jobs', '/' ],
    [ 'an empty value', '', '/' ],
    [ 'a path with a line break', '/a\nb', '/' ],
  ] )( 'accepts %s as returnTo only when it is safe', async ( _name, returnTo, expected ) => {
    const { response } = await begin( returnTo )

    expect( payloadOf( cookieValue( response, OAUTH_COOKIE ) ).returnTo ).toBe( expected )
  } )

  it( 'defaults returnTo to the root', async () => {
    const { response } = await begin()

    expect( payloadOf( cookieValue( response, OAUTH_COOKIE ) ).returnTo ).toBe( '/' )
  } )

  it( 'answers 400 for an address that is not in APP_ORIGINS', async () => {
    const response = await request( app ).get( '/api/auth/google' ).set( 'Host', 'evil.test' )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( { error: 'This address isn\'t configured in APP_ORIGINS' } )
    expect( fake.urls ).toEqual( [] )
  } )

  it( 'needs no session', async () => {
    expect( ( await begin() ).response.status ).toBe( 302 )
  } )
} )

describe( 'GET /api/auth/callback', () => {
  const expectRefused = ( response: request.Response, error: string ): void => {
    expect( response.status ).toBe( 302 )
    expect( location( response ) ).toBe( `/signin?error=${ error }` )
    expect( cookiesOf( response ).join( ';' ) ).not.toContain( 'atlas_session=' )
    expect( cookiesOf( response ).join( ';' ) ).toMatch( /atlas_oauth=;/ )
  }

  const addMember = ( email = 'member@example.com' ): string => {
    const id = crypto.randomUUID()

    insertUser( { id, email, name: 'Member', role: 'member', status: 'active', created_at: 'now' } )

    return id
  }

  it( 'signs in a known member: binds the sub, starts a session, goes to returnTo', async () => {
    const id = addMember()

    identify( 'Member@Example.com', 'sub-m' )

    const { state, cookie } = await begin( '/jobs/1' )
    const response = await callback( { state, cookie } )
    const sessionCookie = cookiesOf( response )
      .find( ( line ) => line.startsWith( 'atlas_session=' ) ) ?? ''
    const token = cookieValue( response, 'atlas_session' )

    expect( response.status ).toBe( 302 )
    expect( location( response ) ).toBe( '/jobs/1' )
    expect( sessionCookie ).toContain( 'HttpOnly' )
    expect( sessionCookie ).toContain( 'SameSite=Lax' )
    expect( sessionCookie ).toContain( 'Max-Age=2592000' )
    expect( findSession( hashToken( token ) )?.user_id ).toBe( id )
    expect( findUserByEmail( 'member@example.com' ) ).toMatchObject( {
      google_sub: 'sub-m',
      last_signin_at: expect.any( String ) as string,
    } )
    expect( cookiesOf( response ).join( ';' ) ).toMatch( /atlas_oauth=;/ )
    expect( fake.exchanges[ 0 ] ).toMatchObject( { origin: ORIGIN, code: 'the-code' } )
    expect( fake.exchanges[ 0 ]?.codeVerifier )
      .toBe( payloadOf( cookie ).verifier )
  } )

  it( 'lets the same person sign in again with the same sub', async () => {
    addMember()
    identify( 'member@example.com', 'sub-m' )

    for( let attempt = 0; attempt < 2; attempt++ ) {
      const { state, cookie } = await begin()
      const response = await callback( { state, cookie } )

      expect( location( response ) ).toBe( '/' )
    }
  } )

  it( 'refuses a different sub for an email that already has one', async () => {
    const id = addMember()

    bindGoogleSub( id, 'sub-original' )
    identify( 'member@example.com', 'sub-other' )

    const { state, cookie } = await begin()

    expectRefused( await callback( { state, cookie } ), 'not_allowed' )
  } )

  it( 'refuses a sub another user already holds', async () => {
    const other = addMember( 'other@example.com' )

    bindGoogleSub( other, 'sub-shared' )
    addMember()
    identify( 'member@example.com', 'sub-shared' )

    const { state, cookie } = await begin()

    expectRefused( await callback( { state, cookie } ), 'not_allowed' )
  } )

  it( 'refuses an unverified email', async () => {
    addMember()
    identify( 'member@example.com', 's', false )

    const { state, cookie } = await begin()

    expectRefused( await callback( { state, cookie } ), 'not_allowed' )
  } )

  it( 'refuses an unknown email while other users exist', async () => {
    addMember()
    identify( 'stranger@example.com', 's' )

    const { state, cookie } = await begin()

    expectRefused( await callback( { state, cookie } ), 'not_allowed' )
    expect( countUsers() ).toBe( 1 )
  } )

  it( 'refuses a removed user', async () => {
    const id = addMember()

    updateUser( id, { status: 'removed' } )
    identify( 'member@example.com', 's' )

    const { state, cookie } = await begin()

    expectRefused( await callback( { state, cookie } ), 'not_allowed' )
  } )

  describe( 'with no users yet', () => {
    it( 'makes ADMIN_EMAIL the admin, with every module and seeded profiles', async () => {
      identify( 'Admin@Example.com', 'sub-a' )

      const { state, cookie } = await begin()
      const response = await callback( { state, cookie } )
      const admin = findUserByEmail( 'admin@example.com' )

      expect( location( response ) ).toBe( '/' )
      expect( admin ).toMatchObject( {
        role: 'admin',
        status: 'active',
        name: 'Someone',
        google_sub: 'sub-a',
      } )
      expect( listModules( admin?.id ?? '' ) ).toEqual( [] )
      expect( findSession( hashToken( cookieValue( response, 'atlas_session' ) ) )?.user_id )
        .toBe( admin?.id )
    } )

    it( 'refuses any other email, and creates nobody', async () => {
      identify( 'stranger@example.com', 's' )

      const { state, cookie } = await begin()

      expectRefused( await callback( { state, cookie } ), 'not_allowed' )
      expect( countUsers() ).toBe( 0 )
    } )

    it( 'refuses ADMIN_EMAIL when the address is unverified', async () => {
      identify( 'admin@example.com', 's', false )

      const { state, cookie } = await begin()

      expectRefused( await callback( { state, cookie } ), 'not_allowed' )
      expect( countUsers() ).toBe( 0 )
    } )

    it( 'leaves no admin behind when seeding fails', async () => {
      vi.spyOn( seedUserService, 'seedUser' ).mockImplementation( () => {
        throw new Error( 'seed failed' )
      } )
      identify( 'admin@example.com', 'sub-a' )

      const { state, cookie } = await begin()
      const response = await callback( { state, cookie } )

      expect( response.status ).toBe( 302 )
      expect( location( response ) ).toBe( '/signin?error=failed' )
      expect( countUsers() ).toBe( 0 )
      expect( getDatabase().prepare( 'SELECT COUNT(*) AS count FROM sessions' ).get() )
        .toEqual( { count: 0 } )
    } )

    it( 'does not make a second admin when the admin email comes back', async () => {
      identify( 'admin@example.com', 'sub-a' )

      for( let attempt = 0; attempt < 2; attempt++ ) {
        const { state, cookie } = await begin()

        await callback( { state, cookie } )
      }

      expect( countUsers() ).toBe( 1 )
    } )
  } )

  describe( 'a callback that does not match what was started', () => {
    it( 'is expired without the sign-in cookie', async () => {
      const { state } = await begin()

      expectRefused( await callback( { state } ), 'expired' )
      expect( fake.exchanges ).toEqual( [] )
    } )

    it( 'is expired once the cookie is older than ten minutes', async () => {
      vi.useFakeTimers( { toFake: [ 'Date' ] } )
      vi.setSystemTime( new Date( '2026-10-24T10:00:00Z' ) )
      addMember()

      const { state, cookie } = await begin()

      vi.setSystemTime( new Date( '2026-10-24T10:10:01Z' ) )

      expectRefused( await callback( { state, cookie } ), 'expired' )
      expect( fake.exchanges ).toEqual( [] )
    } )

    it( 'fails for a state that is not the one in the cookie', async () => {
      const { cookie } = await begin()

      expectRefused( await callback( { state: 'someone-elses', cookie } ), 'failed' )
      expect( fake.exchanges ).toEqual( [] )
    } )

    it( 'fails for a missing state or code', async () => {
      const { state, cookie } = await begin()

      expectRefused( await callback( { cookie } ), 'failed' )
      expectRefused( await callback( { state, cookie, code: '' } ), 'failed' )
    } )

    it( 'fails for a cookie whose signature was changed', async () => {
      const { state, cookie } = await begin()
      const forged = `${ cookie.slice( 0, -2 ) }${ cookie.endsWith( 'AA' ) ? 'BB' : 'AA' }`

      expectRefused( await callback( { state, cookie: forged } ), 'failed' )
    } )

    it( 'fails for a payload that was swapped under the same signature', async () => {
      const { state, cookie } = await begin( '/safe' )
      const [ , signature ] = cookie.split( '.' )
      const swapped = Buffer.from( JSON.stringify( {
        ...payloadOf( cookie ),
        returnTo: '/evil',
      } ) ).toString( 'base64url' )

      expectRefused( await callback( { state, cookie: `${ swapped }.${ signature }` } ), 'failed' )
    } )

    it( 'fails for garbage in the cookie', async () => {
      const { state } = await begin()

      expectRefused( await callback( { state, cookie: 'garbage' } ), 'failed' )
    } )

    it( 'answers 400 when the callback arrives at an address that is not configured', async () => {
      const { state, cookie } = await begin()
      const response = await request( app )
        .get( '/api/auth/callback' )
        .query( { code: 'c', state } )
        .set( 'Host', 'localhost:3100' )
        .set( 'X-Forwarded-Host', 'mac.tail1234.ts.net' )
        .set( 'X-Forwarded-Proto', 'https' )
        .set( 'Cookie', `${ OAUTH_COOKIE }=${ cookie }` )

      expect( response.status ).toBe( 400 )
    } )

    it( 'fails when Google reports an error, such as a refused consent', async () => {
      const { state, cookie } = await begin()
      const response = await request( app )
        .get( '/api/auth/callback' )
        .query( { error: 'access_denied', state } )
        .set( 'Host', HOST )
        .set( 'Cookie', `${ OAUTH_COOKIE }=${ cookie }` )

      expectRefused( response, 'failed' )
    } )
  } )

  it( 'fails when Google does not accept the code', async () => {
    addMember()
    fake.fail = true

    const { state, cookie } = await begin()

    expectRefused( await callback( { state, cookie } ), 'failed' )
  } )

  it( 'logs a refusal at warn without the email, the code or a token', async () => {
    addMember()
    identify( 'stranger@example.com', 'sub-secret' )

    const { state, cookie } = await begin()

    await callback( { state, cookie } )

    const logged = JSON.stringify( vi.mocked( logger.warn ).mock.calls )

    expect( vi.mocked( logger.warn ) ).toHaveBeenCalled()
    expect( logged ).not.toMatch( /stranger@example.com|the-code|sub-secret/ )
  } )
} )

describe( 'POST /api/auth/signout', () => {
  it( 'deletes the session, clears the cookie and answers 204', async () => {
    const user = createTestUser()
    const agent = signedIn( supertest.agent( app ), user )
    const response = await agent.post( '/api/auth/signout' ).send( {} )

    expect( response.status ).toBe( 204 )
    expect( cookiesOf( response ).join( ';' ) ).toMatch( /atlas_session=;/ )
    expect( findSession( hashToken( user.token ) ) ).toBeUndefined()

    const after = await signedIn( supertest.agent( app ), user ).get( '/api/me' )

    expect( after.status ).toBe( 401 )
  } )

  it( 'still answers 204 without a session', async () => {
    const response = await request( app ).post( '/api/auth/signout' ).send( {} )

    expect( response.status ).toBe( 204 )
  } )

  it( 'needs a JSON body like any state-changing request', async () => {
    const response = await request( app ).post( '/api/auth/signout' )

    expect( response.status ).toBe( 415 )
  } )
} )
