// Node
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
// Packages
import request from 'supertest'
import {
  describe,
  it,
  expect,
  vi,
} from 'vitest'
// Shared
import { AdminUser, UsageResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
import { config } from '../config.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { findSession } from '../repositories/sessions.repository.js'
import {
  findUserByEmail,
  findUserById,
} from '../repositories/users.repository.js'
// Services
import { hashToken } from '../services/session.service.js'
import * as seeding from '../services/seedUser.service.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'

const tablesWithUserId = (): string[] => {
  const db = getDatabase()
  const tables = db.prepare( `SELECT name FROM sqlite_master WHERE type = 'table'` )
    .all() as { name: string }[]

  return tables
    .map( ( { name } ) => name )
    .filter( ( name ) => {
      const columns = db.prepare( `PRAGMA table_info( ${ name } )` ).all() as { name: string }[]

      return columns.some( ( column ) => column.name === 'user_id' )
    } )
}

const countsFor = ( userId: string ): Record< string, number > => {
  return Object.fromEntries( tablesWithUserId().map( ( table ) => {
    const row = getDatabase().prepare( `SELECT COUNT(*) AS n FROM ${ table } WHERE user_id = ?` )
      .get( userId ) as { n: number }

    return [ table, row.n ]
  } ) )
}

const addContent = ( userId: string ): void => {
  const db = getDatabase()
  const now = new Date().toISOString()

  db.prepare( `INSERT INTO jobs ( id, user_id, url, status, created_at, updated_at )
    VALUES ( ?, ?, 'https://example.com', 'queued', ?, ? )` )
    .run( crypto.randomUUID(), userId, now, now )
  db.prepare( `INSERT INTO feeds ( id, user_id, url, feed_url, name, created_at )
    VALUES ( ?, ?, 'https://example.com', 'https://example.com/feed', 'Feed', ? )` )
    .run( crypto.randomUUID(), userId, now )
}

describe( 'admin routes: access', () => {
  it( 'is 401 without a session', async () => {
    const response = await request( app ).get( '/api/admin/users' )

    expect( response.status ).toBe( 401 )
  } )

  it( 'is 404 for a member on every route', async () => {
    const member = createTestUser()
    const other = createTestUser()
    const agent = signedInRequest( app, member )

    for( const response of [
      await agent.get( '/api/admin/users' ),
      await agent.get( '/api/admin/usage' ),
      await agent.post( '/api/admin/users' ).send( {} ),
      await agent.patch( `/api/admin/users/${ other.id }` ).send( { name: 'x' } ),
      await agent.post( `/api/admin/users/${ other.id }/reset-vault` ),
      await agent.delete( `/api/admin/users/${ other.id }` ).send( { confirm: 'x' } ),
    ] ) {
      expect( response.status ).toBe( 404 )
    }
  } )
} )

describe( 'GET /api/admin/users', () => {
  it( 'lists the admin first, then by name', async () => {
    const admin = createTestUser( { role: 'admin', email: 'boss@example.com' } )
    const zed = createTestUser( {
      email: 'zed@example.com',
      modules: [ 'melete' ],
      vault_dir: 'zed',
    } )

    getDatabase().prepare( 'UPDATE users SET name = ? WHERE id = ?' ).run( 'Zed', zed.id )
    createTestUser( { email: 'amy@example.com' } )
    getDatabase().prepare( 'UPDATE users SET name = ? WHERE email = ?' )
      .run( 'Amy', 'amy@example.com' )

    const response = await signedInRequest( app, admin ).get( '/api/admin/users' )
    const users = AdminUser.array().parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( users.map( ( user ) => user.name ) ).toEqual( [ 'Test admin', 'Amy', 'Zed' ] )
    expect( users[ 0 ]?.modules ).toEqual( [ 'transcriber', 'melete' ] )
    expect( users[ 2 ] ).toMatchObject( {
      role: 'member',
      status: 'active',
      modules: [ 'melete' ],
      vault_dir: 'zed',
    } )
  } )
} )

describe( 'POST /api/admin/users', () => {
  it( 'adds an active member with modules and seeded prompts', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const response = await signedInRequest( app, admin ).post( '/api/admin/users' )
      .send( { email: 'Brother@Example.com', name: 'Brother', modules: [ 'melete' ] } )

    expect( response.status ).toBe( 201 )

    const created = AdminUser.parse( response.body )

    expect( created ).toMatchObject( {
      email: 'brother@example.com',
      name: 'Brother',
      role: 'member',
      status: 'active',
      modules: [ 'melete' ],
      vault_dir: null,
      last_signin_at: null,
    } )

    const profiles = getDatabase()
      .prepare( 'SELECT COUNT(*) AS n FROM prompt_profiles WHERE user_id = ?' )
      .get( created.id ) as { n: number }
    const setting = getDatabase()
      .prepare( `SELECT value FROM settings WHERE user_id = ? AND key = 'default_profile_id'` )
      .get( created.id )

    expect( profiles.n ).toBeGreaterThan( 0 )
    expect( setting ).toBeDefined()
  } )

  it( 'refuses a duplicate email in any case with 409', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const taken = createTestUser( { email: 'taken@example.com' } )
    const response = await signedInRequest( app, admin ).post( '/api/admin/users' )
      .send( { email: 'TAKEN@example.com', name: 'Again', modules: [] } )

    expect( response.status ).toBe( 409 )
    expect( findUserById( taken.id ) ).toBeDefined()
  } )

  it( 'refuses a bad body with 400', async () => {
    const agent = signedInRequest( app, createTestUser( { role: 'admin' } ) )

    for( const body of [
      { email: 'nope', name: 'A', modules: [] },
      { email: 'a@example.com', name: '', modules: [] },
      { email: 'a@example.com', name: 'A', modules: [ 'bogus' ] },
    ] ) {
      expect( ( await agent.post( '/api/admin/users' ).send( body ) ).status ).toBe( 400 )
    }
  } )

  it( 'leaves nothing behind when seeding fails', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const seed = vi.spyOn( seeding, 'seedUser' ).mockImplementation( () => {
      throw new Error( 'boom' )
    } )

    const response = await signedInRequest( app, admin ).post( '/api/admin/users' )
      .send( { email: 'half@example.com', name: 'Half', modules: [ 'melete' ] } )

    seed.mockRestore()

    expect( response.status ).toBe( 500 )
    expect( findUserByEmail( 'half@example.com' ) ).toBeUndefined()
  } )
} )

describe( 'PATCH /api/admin/users/:id', () => {
  it( 'changes name, modules and status', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const member = createTestUser( { modules: [ 'transcriber' ] } )
    const agent = signedInRequest( app, admin )

    const renamed = await agent.patch( `/api/admin/users/${ member.id }` ).send( { name: 'New' } )

    expect( AdminUser.parse( renamed.body ) ).toMatchObject( {
      name: 'New',
      modules: [ 'transcriber' ],
    } )

    const swapped = await agent.patch( `/api/admin/users/${ member.id }` )
      .send( { modules: [ 'melete' ] } )

    expect( AdminUser.parse( swapped.body ).modules ).toEqual( [ 'melete' ] )

    const both = await agent.patch( `/api/admin/users/${ member.id }` )
      .send( { name: 'Both', modules: [] } )

    expect( AdminUser.parse( both.body ) ).toMatchObject( { name: 'Both', modules: [] } )
  } )

  it( 'refuses an empty or invalid body with 400', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const member = createTestUser()
    const agent = signedInRequest( app, admin )

    expect( ( await agent.patch( `/api/admin/users/${ member.id }` )
      .send( {} ) ).status ).toBe( 400 )
    expect( ( await agent.patch( `/api/admin/users/${ member.id }` )
      .send( { status: 'gone' } ) ).status ).toBe( 400 )
  } )

  it( 'removing signs the user out at once, and restoring brings them back', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const member = createTestUser( { modules: [ 'melete' ] } )
    const agent = signedInRequest( app, admin )

    expect( ( await signedInRequest( app, member ).get( '/api/me' ) ).status ).toBe( 200 )

    const removed = await agent.patch( `/api/admin/users/${ member.id }` )
      .send( { status: 'removed' } )

    expect( AdminUser.parse( removed.body ).status ).toBe( 'removed' )
    expect( findSession( hashToken( member.token ) ) ).toBeUndefined()
    expect( ( await signedInRequest( app, member ).get( '/api/me' ) ).status ).toBe( 401 )

    const restored = await agent.patch( `/api/admin/users/${ member.id }` )
      .send( { status: 'active' } )

    expect( AdminUser.parse( restored.body ) ).toMatchObject( {
      status: 'active',
      modules: [ 'melete' ],
    } )
  } )

  it( 'refuses the admin targeting themself with 409', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const response = await signedInRequest( app, admin ).patch( `/api/admin/users/${ admin.id }` )
      .send( { status: 'removed' } )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'You can\'t change your own account here' } )
    expect( findUserById( admin.id )?.status ).toBe( 'active' )
  } )

  it( 'is 404 for an unknown user', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const response = await signedInRequest( app, admin )
      .patch( `/api/admin/users/${ crypto.randomUUID() }` ).send( { name: 'x' } )

    expect( response.status ).toBe( 404 )
  } )
} )

describe( 'POST /api/admin/users/:id/reset-vault', () => {
  it( 'clears the vault choice and leaves the folder alone', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const member = createTestUser( { vault_dir: 'brother' } )

    mkdirSync( join( config.vaultsPath, 'brother' ), { recursive: true } )

    const response = await signedInRequest( app, admin )
      .post( `/api/admin/users/${ member.id }/reset-vault` )

    expect( response.status ).toBe( 200 )
    expect( AdminUser.parse( response.body ).vault_dir ).toBeNull()
    expect( findUserById( member.id )?.vault_dir ).toBeNull()
  } )

  it( 'refuses the admin themself and unknown users', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const agent = signedInRequest( app, admin )

    expect( ( await agent.post( `/api/admin/users/${ admin.id }/reset-vault` ) ).status )
      .toBe( 409 )
    expect( ( await agent.post( `/api/admin/users/${ crypto.randomUUID() }/reset-vault` ) ).status )
      .toBe( 404 )
  } )
} )

describe( 'DELETE /api/admin/users/:id', () => {
  it( 'only deletes a removed user', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const member = createTestUser()
    const response = await signedInRequest( app, admin ).delete( `/api/admin/users/${ member.id }` )
      .send( { confirm: findUserById( member.id )?.email } )

    expect( response.status ).toBe( 409 )
    expect( findUserById( member.id ) ).toBeDefined()
  } )

  it( 'needs the email typed to confirm', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const member = createTestUser()
    const agent = signedInRequest( app, admin )

    await agent.patch( `/api/admin/users/${ member.id }` ).send( { status: 'removed' } )

    const response = await agent.delete( `/api/admin/users/${ member.id }` )
      .send( { confirm: 'wrong@example.com' } )

    expect( response.status ).toBe( 400 )
    expect( findUserById( member.id ) ).toBeDefined()
  } )

  it( 'deletes the user and all their data, leaving others and the vault alone', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const gone = createTestUser( { vault_dir: 'gone' } )
    const kept = createTestUser( { vault_dir: 'kept' } )
    const agent = signedInRequest( app, admin )

    mkdirSync( join( config.vaultsPath, 'gone' ), { recursive: true } )
    addContent( gone.id )
    addContent( kept.id )

    const before = countsFor( kept.id )

    expect( countsFor( gone.id ).jobs ).toBe( 1 )

    await agent.patch( `/api/admin/users/${ gone.id }` ).send( { status: 'removed' } )

    const response = await agent.delete( `/api/admin/users/${ gone.id }` )
      .send( { confirm: gone.email } )

    expect( response.status ).toBe( 204 )
    expect( findUserById( gone.id ) ).toBeUndefined()
    expect( Object.values( countsFor( gone.id ) ).every( ( count ) => count === 0 ) ).toBe( true )
    expect( countsFor( kept.id ) ).toEqual( before )
  } )

  it( 'refuses the admin themself and unknown users', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const agent = signedInRequest( app, admin )

    expect( ( await agent.delete( `/api/admin/users/${ admin.id }` )
      .send( { confirm: admin.email } ) ).status ).toBe( 409 )
    expect( ( await agent.delete( `/api/admin/users/${ crypto.randomUUID() }` )
      .send( { confirm: 'x' } ) ).status ).toBe( 404 )
  } )
} )

describe( 'GET /api/admin/usage', () => {
  it( 'gives every user\'s totals for the month', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const member = createTestUser()
    const response = await signedInRequest( app, admin ).get( '/api/admin/usage?month=2026-10' )
    const usage = UsageResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( usage.month ).toBe( '2026-10' )
    expect( usage.time_zone ).toBe( config.timeZone )
    expect( usage.users.map( ( user ) => user.user_id ) )
      .toEqual( expect.arrayContaining( [ admin.id, member.id ] ) )
  } )

  it( 'defaults to the current month', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const response = await signedInRequest( app, admin ).get( '/api/admin/usage' )

    expect( response.status ).toBe( 200 )
    expect( UsageResponse.parse( response.body ).month ).toMatch( /^\d{4}-\d{2}$/ )
  } )

  it( 'refuses a month that isn\'t YYYY-MM with 400', async () => {
    const agent = signedInRequest( app, createTestUser( { role: 'admin' } ) )

    for( const month of [ '2026-13', 'abc', '2026-1' ] ) {
      expect( ( await agent.get( `/api/admin/usage?month=${ month }` ) ).status, month ).toBe( 400 )
    }
  } )
} )
