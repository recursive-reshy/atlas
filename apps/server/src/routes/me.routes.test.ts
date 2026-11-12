// Packages
import request from 'supertest'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
// Shared
import { Me } from '@atlas/shared'
// App
import { app } from '../app.js'
// Config
import { config } from '../config.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'

let base: string
let originalVaultsPath: string

beforeEach( async () => {
  base = await mkdtemp( join( tmpdir(), 'atlas-me-' ) )
  originalVaultsPath = config.vaultsPath
  config.vaultsPath = base
} )

afterEach( async () => {
  config.vaultsPath = originalVaultsPath
  await rm( base, { recursive: true, force: true } )
} )

describe( 'GET /api/me', () => {
  it( 'is 401 without a session', async () => {
    const response = await request( app ).get( '/api/me' )

    expect( response.status ).toBe( 401 )
    expect( response.body ).toEqual( { error: 'unauthenticated' } )
  } )

  it( 'gives the admin every module', async () => {
    const admin = createTestUser( { role: 'admin', email: 'boss@example.com' } )
    const response = await signedInRequest( app, admin ).get( '/api/me' )

    expect( response.status ).toBe( 200 )
    expect( Me.parse( response.body ) ).toMatchObject( {
      id: admin.id,
      email: 'boss@example.com',
      role: 'admin',
      modules: [ 'transcriber', 'melete', 'themis' ],
      vault_dir: null,
    } )
  } )

  it( 'gives the study day, which turns over at the day start, not at midnight', async () => {
    const member = createTestUser( { modules: [] } )

    try {
      // 03:59 and 04:00 in Singapore (UTC+8) with the default day start of 4
      vi.useFakeTimers( { toFake: [ 'Date' ] } )
      vi.setSystemTime( new Date( '2026-11-07T19:59:00Z' ) )
      const before = await signedInRequest( app, member ).get( '/api/me' )

      vi.setSystemTime( new Date( '2026-11-07T20:00:00Z' ) )
      const after = await signedInRequest( app, member ).get( '/api/me' )

      expect( Me.parse( before.body ).study_today ).toBe( '2026-11-07' )
      expect( Me.parse( after.body ).study_today ).toBe( '2026-11-08' )
    } finally {
      vi.useRealTimers()
    }
  } )

  it( 'gives a member their modules and vault', async () => {
    await mkdir( join( base, 'brother' ) )

    const member = createTestUser( { modules: [ 'melete' ], vault_dir: 'brother' } )
    const response = await signedInRequest( app, member ).get( '/api/me' )

    expect( Me.parse( response.body ) ).toMatchObject( {
      id: member.id,
      role: 'member',
      name: 'Test member',
      modules: [ 'melete' ],
      vault_dir: 'brother',
      vault_missing: false,
    } )
  } )

  it( 'says the vault is missing, and keeps its name, when the folder is gone', async () => {
    const member = createTestUser( { modules: [ 'melete' ], vault_dir: 'gone' } )
    const response = await signedInRequest( app, member ).get( '/api/me' )

    expect( Me.parse( response.body ) ).toMatchObject( { vault_dir: 'gone', vault_missing: true } )
  } )

  it( 'does not call a user with no vault missing one', async () => {
    const member = createTestUser( { modules: [] } )
    const response = await signedInRequest( app, member ).get( '/api/me' )

    expect( Me.parse( response.body ) ).toMatchObject( { vault_dir: null, vault_missing: false } )
  } )

  it( 'gives a member with no modules an empty list', async () => {
    const member = createTestUser( { modules: [] } )
    const response = await signedInRequest( app, member ).get( '/api/me' )

    expect( Me.parse( response.body ).modules ).toEqual( [] )
  } )
} )
