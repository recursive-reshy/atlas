// Node
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Express
import express from 'express'
import type { Express } from 'express'
// Packages
import request from 'supertest'
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest'
// Shared
import { Me } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Errors
import { errorMiddleware } from '../errors.js'
// Middleware
import { requireUser } from '../middleware/auth.js'
import { jsonOnly } from '../middleware/jsonOnly.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
// Routes
import { meRoutes } from './me.routes.js'
import { testSessionRoutes } from './testSession.routes.js'

let base: string
let originalVaultsPath: string
let app: Express

// The same order as app.ts, with the route the real app mounts only when E2E_TEST_SIGNIN is set
const buildApp = (): Express => {
  const built = express()

  built.use( '/api', express.json() )
  built.use( '/api', jsonOnly )
  built.use( '/api', testSessionRoutes )
  built.use( '/api', requireUser )
  built.use( '/api', meRoutes )
  built.use( errorMiddleware )

  return built
}

const signIn = ( body: object ): request.Test => {
  return request( app ).post( '/api/test/session' ).send( body )
}

const meWith = async ( cookie: string[] ): Promise< Me > => {
  const res = await request( app ).get( '/api/me' ).set( 'Cookie', cookie )

  return Me.parse( res.body )
}

beforeEach( async () => {
  base = await mkdtemp( join( tmpdir(), 'atlas-test-session-' ) )
  originalVaultsPath = config.vaultsPath
  config.vaultsPath = base
  app = buildApp()
} )

afterEach( async () => {
  config.vaultsPath = originalVaultsPath
  await rm( base, { recursive: true, force: true } )
} )

describe( 'POST /api/test/session', () => {
  it( 'creates the admin for ADMIN_EMAIL and signs them in', async () => {
    await mkdir( join( base, 'admin' ) )

    const res = await signIn( { email: config.adminEmail, vault_dir: 'admin' } )

    expect( res.status ).toBe( 204 )

    const me = await meWith( res.get( 'Set-Cookie' ) ?? [] )

    expect( me.role ).toBe( 'admin' )
    expect( me.email ).toBe( config.adminEmail )
    expect( me.vault_dir ).toBe( 'admin' )
    expect( me.modules ).toEqual( [ 'transcriber', 'melete' ] )
  } )

  it( 'creates a member with the modules and vault in the body', async () => {
    await mkdir( join( base, 'member' ) )

    const res = await signIn( {
      email: 'member@e2e.test',
      modules: [ 'melete' ],
      vault_dir: 'member',
    } )
    const me = await meWith( res.get( 'Set-Cookie' ) ?? [] )

    expect( me.role ).toBe( 'member' )
    expect( me.modules ).toEqual( [ 'melete' ] )
    expect( me.vault_dir ).toBe( 'member' )
  } )

  it( 'leaves a member with no vault and no modules when the body names none', async () => {
    const res = await signIn( { email: 'plain@e2e.test' } )
    const me = await meWith( res.get( 'Set-Cookie' ) ?? [] )

    expect( me.vault_dir ).toBeNull()
    expect( me.modules ).toEqual( [] )
  } )

  it( 'reuses an existing user and replaces their modules', async () => {
    await signIn( { email: 'member@e2e.test', modules: [ 'melete' ] } )

    const res = await signIn( { email: 'Member@E2E.test', modules: [ 'transcriber' ] } )
    const me = await meWith( res.get( 'Set-Cookie' ) ?? [] )
    const row = getDatabase()
      .prepare( 'SELECT COUNT(*) AS count FROM users WHERE email = ?' )
      .get( 'member@e2e.test' ) as { count: number }

    expect( row.count ).toBe( 1 )
    expect( me.modules ).toEqual( [ 'transcriber' ] )
  } )

  it( 'keeps the vault a user already has', async () => {
    await mkdir( join( base, 'first' ) )
    await mkdir( join( base, 'second' ) )
    await signIn( { email: 'member@e2e.test', vault_dir: 'first' } )

    const res = await signIn( { email: 'member@e2e.test', vault_dir: 'second' } )

    expect( ( await meWith( res.get( 'Set-Cookie' ) ?? [] ) ).vault_dir ).toBe( 'first' )
  } )

  it( 'is 400 for a vault folder that does not exist', async () => {
    const res = await signIn( { email: 'member@e2e.test', vault_dir: 'nowhere' } )

    expect( res.status ).toBe( 400 )
  } )

  it( 'is 400 for a body without a valid email', async () => {
    expect( ( await signIn( {} ) ).status ).toBe( 400 )
    expect( ( await signIn( { email: 'not-an-email' } ) ).status ).toBe( 400 )
  } )
} )
