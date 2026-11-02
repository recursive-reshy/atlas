// Node
import { createHash } from 'node:crypto'
// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import { findSession } from '../repositories/sessions.repository.js'
import { setModules } from '../repositories/userModules.repository.js'
import { insertUser, updateUser } from '../repositories/users.repository.js'
// Services
import {
  SESSION_COOKIE,
  cookieOptions,
  createSession,
  endSession,
  hashToken,
  resolveSession,
  sweepSessions,
} from './session.service.js'

const START = new Date( '2026-10-24T10:00:00.000Z' )
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

const addUser = ( id: string, role: 'admin' | 'member' = 'member' ): string => {
  insertUser( {
    id,
    email: `${ id }@x.test`,
    name: id,
    role,
    status: 'active',
    created_at: START.toISOString(),
  } )

  return id
}

const after = ( ms: number ): Date => new Date( START.getTime() + ms )

describe( 'createSession', () => {
  it( 'returns a 32-byte base64url token and stores only its SHA-256 hex', () => {
    const { token } = createSession( addUser( 'a' ), START )

    expect( token ).toMatch( /^[A-Za-z0-9_-]{43}$/ )
    expect( Buffer.from( token, 'base64url' ) ).toHaveLength( 32 )

    const hash = createHash( 'sha256' ).update( token ).digest( 'hex' )

    expect( hashToken( token ) ).toBe( hash )
    expect( findSession( hash ) ).toEqual( {
      token_hash: hash,
      user_id: 'a',
      created_at: START.toISOString(),
      last_seen_at: START.toISOString(),
      expires_at: after( 30 * DAY_MS ).toISOString(),
    } )
    expect( findSession( token ) ).toBeUndefined()
  } )

  it( 'makes a different token each time', () => {
    const user = addUser( 'a' )

    expect( createSession( user, START ).token ).not.toBe( createSession( user, START ).token )
  } )
} )

describe( 'cookieOptions', () => {
  it( 'is HttpOnly, Lax, site-wide and lasts SESSION_DAYS', () => {
    expect( cookieOptions( false ) ).toEqual( {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: false,
      maxAge: 30 * DAY_MS,
    } )
  } )

  it( 'is Secure only when asked', () => {
    expect( cookieOptions( true ).secure ).toBe( true )
  } )

  it( 'names the cookie atlas_session', () => {
    expect( SESSION_COOKIE ).toBe( 'atlas_session' )
  } )
} )

describe( 'resolveSession', () => {
  it( 'returns the member with their modules and vault', () => {
    const user = addUser( 'a' )

    setModules( user, [ 'melete' ] )

    const { token } = createSession( user, START )

    expect( resolveSession( token, after( 1000 ) ) ).toEqual( {
      user: { id: 'a', role: 'member', modules: [ 'melete' ], vault_dir: null },
      refreshed: false,
    } )
  } )

  it( 'gives the admin every module', () => {
    const { token } = createSession( addUser( 'boss', 'admin' ), START )

    expect( resolveSession( token, after( 1000 ) )?.user.modules )
      .toEqual( [ 'transcriber', 'melete' ] )
  } )

  it( 'is null for an unknown token, a missing token and an expired session', () => {
    const { token } = createSession( addUser( 'a' ), START )

    expect( resolveSession( 'nope', START ) ).toBeNull()
    expect( resolveSession( undefined, START ) ).toBeNull()
    expect( resolveSession( token, after( 30 * DAY_MS ) ) ).toBeNull()
    expect( resolveSession( token, after( 30 * DAY_MS - 1 ) ) ).not.toBeNull()
  } )

  it( 'is null for a removed user', () => {
    const user = addUser( 'a' )
    const { token } = createSession( user, START )

    updateUser( user, { status: 'removed' } )

    expect( resolveSession( token, after( 1000 ) ) ).toBeNull()
  } )

  it( 'leaves the session alone within the hour', () => {
    const { token } = createSession( addUser( 'a' ), START )
    const before = findSession( hashToken( token ) )

    expect( resolveSession( token, after( HOUR_MS - 1 ) )?.refreshed ).toBe( false )
    expect( findSession( hashToken( token ) ) ).toEqual( before )
  } )

  it( 'extends the session once the hour has passed', () => {
    const { token } = createSession( addUser( 'a' ), START )
    const later = after( HOUR_MS )

    expect( resolveSession( token, later )?.refreshed ).toBe( true )
    expect( findSession( hashToken( token ) ) ).toMatchObject( {
      created_at: START.toISOString(),
      last_seen_at: later.toISOString(),
      expires_at: new Date( later.getTime() + 30 * DAY_MS ).toISOString(),
    } )
    expect( resolveSession( token, after( HOUR_MS + 1000 ) )?.refreshed ).toBe( false )
  } )
} )

describe( 'endSession', () => {
  it( 'deletes the session and tolerates a missing token', () => {
    const { token } = createSession( addUser( 'a' ), START )

    endSession( token )
    endSession( undefined )

    expect( resolveSession( token, START ) ).toBeNull()
  } )
} )

describe( 'sweepSessions', () => {
  it( 'deletes only expired sessions and says how many', () => {
    const user = addUser( 'a' )
    const old = createSession( user, START )
    const fresh = createSession( user, after( 20 * DAY_MS ) )

    expect( sweepSessions( after( 31 * DAY_MS ) ) ).toBe( 1 )
    expect( findSession( hashToken( old.token ) ) ).toBeUndefined()
    expect( findSession( hashToken( fresh.token ) ) ).toBeDefined()
  } )
} )
