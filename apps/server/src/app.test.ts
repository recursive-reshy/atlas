// Packages
import { describe, it, expect } from 'vitest'
import request from 'supertest'
// App
import { app } from './app.js'
// Test support
import { signedInRequest } from './test-support/auth.js'

describe( 'unknown /api routes', () => {
  it( 'responds 404 for a path that does not exist', async () => {
    const response = await signedInRequest( app ).get( '/api/does-not-exist' )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Not Found' } )
  } )

  it( 'responds 404 for the wrong method on a known path', async () => {
    const response = await signedInRequest( app ).post( '/api/health' )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Not Found' } )
  } )
} )

describe( 'the middleware order', () => {
  it( 'serves health and the sign-in routes without a session', async () => {
    expect( ( await request( app ).get( '/api/health' ) ).status ).toBe( 200 )
    const start = await request( app ).get( '/api/auth/google' ).set( 'Host', 'localhost:3100' )

    expect( start.status ).toBe( 302 )
    expect( ( await request( app ).post( '/api/auth/signout' ).send( {} ) ).status ).toBe( 204 )
  } )

  it.each( [
    '/api/me',
    '/api/jobs',
    '/api/feeds',
    '/api/inbox',
    '/api/gmail/account',
    '/api/gmail/sources',
    '/api/vault/folders',
    '/api/settings',
    '/api/models',
    '/api/prompt-profiles',
    '/api/status',
    '/api/melete/today',
    '/api/does-not-exist',
  ] )( 'answers 401 for GET %s without a session', async ( path ) => {
    const response = await request( app ).get( path )

    expect( response.status ).toBe( 401 )
    expect( response.body ).toEqual( { error: 'unauthenticated' } )
  } )

  it( 'answers 401 for a signed-out JSON POST to a data route', async () => {
    const response = await request( app ).post( '/api/jobs' ).send( {} )

    expect( response.status ).toBe( 401 )
  } )

  it( 'refuses a POST that is not JSON with 415 before it looks at the session', async () => {
    const response = await request( app ).post( '/api/jobs' ).type( 'form' ).send( 'a=1' )

    expect( response.status ).toBe( 415 )
  } )
} )
