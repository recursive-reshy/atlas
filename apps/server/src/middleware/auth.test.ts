// Express
import express from 'express'
import type { Express } from 'express'
// Packages
import request from 'supertest'
import {
  afterEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest'
// Errors
import { errorMiddleware } from '../errors.js'
// Logging
import { getLogContext } from '../logContext.js'
// Middleware
import {
  currentUser,
  parseCookies,
  requireAdmin,
  requireUser,
} from './auth.js'
// Repositories
import { findSession } from '../repositories/sessions.repository.js'
import { setModules } from '../repositories/userModules.repository.js'
import { insertUser, setVaultDir, updateUser } from '../repositories/users.repository.js'
// Services
import { SESSION_COOKIE, createSession, hashToken } from '../services/session.service.js'

const HOUR_MS = 3_600_000

const buildApp = (): Express => {
  const app = express()

  app.use( '/api', requireUser )
  app.get( '/api/whoami', ( req, res ) => {
    res.status( 200 ).json( { user: currentUser( req ), context: getLogContext() ?? null } )
  } )
  app.use( '/api/admin', requireAdmin )
  app.get( '/api/admin/ping', ( _req, res ) => {
    res.status( 200 ).json( { ok: true } )
  } )
  app.get( '/bare', ( req, res ) => {
    res.status( 200 ).json( { user: currentUser( req ) } )
  } )
  app.use( errorMiddleware )

  return app
}

const addUser = ( id: string, role: 'admin' | 'member' = 'member' ): string => {
  insertUser( {
    id,
    email: `${ id }@x.test`,
    name: id,
    role,
    status: 'active',
    created_at: new Date().toISOString(),
  } )

  return id
}

const cookieFor = ( token: string ): string => `${ SESSION_COOKIE }=${ token }`

const setCookies = ( headers: Record< string, unknown > ): string[] => {
  return ( headers[ 'set-cookie' ] ?? [] ) as string[]
}

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'parseCookies', () => {
  it( 'reads several cookies, keeps = inside values and skips malformed pairs', () => {
    expect( parseCookies( 'a=1; b=x=y=; junk; =novalue; c=3' ) )
      .toEqual( { a: '1', b: 'x=y=', c: '3' } )
  } )

  it( 'decodes percent-escapes and survives bad ones', () => {
    expect( parseCookies( 'a=%20x; b=%E0%A4%A' ) ).toEqual( { a: ' x', b: '%E0%A4%A' } )
  } )

  it( 'is empty without a header', () => {
    expect( parseCookies( undefined ) ).toEqual( {} )
  } )
} )

describe( 'requireUser', () => {
  const unauthenticated = ( response: request.Response ): void => {
    expect( response.status ).toBe( 401 )
    expect( response.body ).toEqual( { error: 'unauthenticated' } )
    expect( setCookies( response.headers ).join( ';' ) ).toMatch( /atlas_session=;/ )
  }

  it( 'answers 401 and clears the cookie when there is no cookie', async () => {
    unauthenticated( await request( buildApp() ).get( '/api/whoami' ) )
  } )

  it( 'answers 401 for an unknown token', async () => {
    unauthenticated(
      await request( buildApp() ).get( '/api/whoami' ).set( 'Cookie', cookieFor( 'nope' ) ),
    )
  } )

  it( 'answers 401 for an expired session', async () => {
    vi.useFakeTimers( { toFake: [ 'Date' ] } )
    vi.setSystemTime( new Date( '2026-01-01T00:00:00Z' ) )

    const { token } = createSession( addUser( 'a' ), new Date() )

    vi.setSystemTime( new Date( '2026-03-01T00:00:00Z' ) )

    unauthenticated(
      await request( buildApp() ).get( '/api/whoami' ).set( 'Cookie', cookieFor( token ) ),
    )
  } )

  it( 'answers 401 for a removed user', async () => {
    const user = addUser( 'a' )
    const { token } = createSession( user, new Date() )

    updateUser( user, { status: 'removed' } )

    unauthenticated(
      await request( buildApp() ).get( '/api/whoami' ).set( 'Cookie', cookieFor( token ) ),
    )
  } )

  it( 'sets req.user from the session, among other cookies', async () => {
    const user = addUser( 'a' )

    setModules( user, [ 'transcriber' ] )
    setVaultDir( user, 'a-vault' )

    const { token } = createSession( user, new Date() )
    const response = await request( buildApp() ).get( '/api/whoami' )
      .set( 'Cookie', `theme=dark; ${ cookieFor( token ) }; other=1` )

    expect( response.status ).toBe( 200 )
    expect( response.body ).toMatchObject( {
      user: { id: 'a', role: 'member', modules: [ 'transcriber' ], vault_dir: 'a-vault' },
    } )
    expect( setCookies( response.headers ) ).toEqual( [] )
  } )

  it( 'gives the admin every module', async () => {
    const { token } = createSession( addUser( 'boss', 'admin' ), new Date() )
    const response = await request( buildApp() ).get( '/api/whoami' )
      .set( 'Cookie', cookieFor( token ) )

    expect( response.body ).toMatchObject( {
      user: { role: 'admin', modules: [ 'transcriber', 'melete' ] },
    } )
  } )

  it( 'puts the user ID, and never the email, in the log context', async () => {
    const { token } = createSession( addUser( 'a' ), new Date() )
    const response = await request( buildApp() ).get( '/api/whoami' )
      .set( 'Cookie', cookieFor( token ) )

    expect( response.body ).toMatchObject( { context: { user_id: 'a' } } )
    expect( JSON.stringify( response.body ) ).not.toContain( '@x.test' )
  } )

  it( 're-sends the cookie and extends the session once an hour has passed', async () => {
    vi.useFakeTimers( { toFake: [ 'Date' ] } )
    vi.setSystemTime( new Date( '2026-10-24T10:00:00Z' ) )

    const { token } = createSession( addUser( 'a' ), new Date() )
    const app = buildApp()

    const soon = await request( app ).get( '/api/whoami' ).set( 'Cookie', cookieFor( token ) )

    expect( setCookies( soon.headers ) ).toEqual( [] )

    vi.setSystemTime( new Date( Date.now() + HOUR_MS ) )

    const later = await request( app ).get( '/api/whoami' ).set( 'Cookie', cookieFor( token ) )
    const [ cookie ] = setCookies( later.headers )

    expect( cookie ).toContain( `${ SESSION_COOKIE }=${ token }` )
    expect( cookie ).toContain( 'HttpOnly' )
    expect( cookie ).toContain( 'SameSite=Lax' )
    expect( cookie ).toContain( 'Max-Age=2592000' )
    expect( cookie ).not.toContain( 'Secure' )
    expect( findSession( hashToken( token ) )?.last_seen_at ).toBe( new Date().toISOString() )
  } )

  it( 'marks the re-sent cookie Secure behind an https forward from loopback', async () => {
    vi.useFakeTimers( { toFake: [ 'Date' ] } )
    vi.setSystemTime( new Date( '2026-10-24T10:00:00Z' ) )

    const { token } = createSession( addUser( 'a' ), new Date() )

    vi.setSystemTime( new Date( Date.now() + HOUR_MS ) )

    const response = await request( buildApp() ).get( '/api/whoami' )
      .set( 'Cookie', cookieFor( token ) )
      .set( 'X-Forwarded-Proto', 'https' )

    expect( setCookies( response.headers )[ 0 ] ).toContain( 'Secure' )
  } )
} )

describe( 'requireAdmin', () => {
  it( 'passes the admin', async () => {
    const { token } = createSession( addUser( 'boss', 'admin' ), new Date() )
    const response = await request( buildApp() ).get( '/api/admin/ping' )
      .set( 'Cookie', cookieFor( token ) )

    expect( response.status ).toBe( 200 )
  } )

  it( 'answers a member 404, the same as an unknown route', async () => {
    const { token } = createSession( addUser( 'a' ), new Date() )
    const response = await request( buildApp() ).get( '/api/admin/ping' )
      .set( 'Cookie', cookieFor( token ) )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Not Found' } )
  } )
} )

describe( 'currentUser', () => {
  it( 'throws when no user was set', async () => {
    const response = await request( buildApp() ).get( '/bare' )

    expect( response.status ).toBe( 500 )
  } )
} )
