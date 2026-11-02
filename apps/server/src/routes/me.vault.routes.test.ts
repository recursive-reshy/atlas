// Node
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
import { Me, VaultChoice } from '@atlas/shared'
// App
import { app } from '../app.js'
// Config
import { config } from '../config.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'

let base: string
let originalVaultsPath: string

beforeEach( async () => {
  base = await mkdtemp( join( tmpdir(), 'mnemosyne-me-vault-' ) )
  originalVaultsPath = config.vaultsPath
  config.vaultsPath = base
} )

afterEach( async () => {
  config.vaultsPath = originalVaultsPath
  await rm( base, { recursive: true, force: true } )
} )

describe( 'GET /api/me/vaults', () => {
  it( 'is 401 without a session', async () => {
    expect( ( await request( app ).get( '/api/me/vaults' ) ).status ).toBe( 401 )
  } )

  it( 'lists the folders nobody has claimed, to a member with no modules', async () => {
    await mkdir( join( base, 'free' ) )
    await mkdir( join( base, 'claimed' ) )
    await mkdir( join( base, 'Not Valid' ) )
    createTestUser( { vault_dir: 'claimed' } )
    const member = createTestUser( { modules: [] } )

    const response = await signedInRequest( app, member ).get( '/api/me/vaults' )

    expect( response.status ).toBe( 200 )
    expect( VaultChoice.parse( response.body ) ).toEqual( { folders: [ 'free' ] } )
  } )

  it( 'is 409 for a user who already has a vault', async () => {
    await mkdir( join( base, 'mine' ) )
    const member = createTestUser( { vault_dir: 'mine' } )
    const response = await signedInRequest( app, member ).get( '/api/me/vaults' )

    expect( response.status ).toBe( 409 )
  } )
} )

describe( 'POST /api/me/vault', () => {
  it( 'claims a folder and answers with the updated user', async () => {
    await mkdir( join( base, 'brother' ) )
    const member = createTestUser( { modules: [ 'melete' ] } )

    const response = await signedInRequest( app, member ).post( '/api/me/vault' )
      .send( { vault_dir: 'brother' } )

    expect( response.status ).toBe( 200 )
    expect( Me.parse( response.body ) ).toMatchObject( { id: member.id, vault_dir: 'brother' } )
    expect( ( await signedInRequest( app, member ).get( '/api/me' ) ).body )
      .toMatchObject( { vault_dir: 'brother' } )
  } )

  it.each( [ '../x', 'a/b', '', 'UPPER', 'a b', '.hidden' ] )(
    'is 400 for the name %j',
    async ( name ) => {
      const response = await signedInRequest( app, createTestUser() ).post( '/api/me/vault' )
        .send( { vault_dir: name } )

      expect( response.status ).toBe( 400 )
    },
  )

  it( 'is 400 for a folder that does not exist or is a symlink', async () => {
    await symlink( tmpdir(), join( base, 'escape' ) )
    const member = createTestUser()

    expect( ( await signedInRequest( app, member ).post( '/api/me/vault' )
      .send( { vault_dir: 'missing' } ) ).status ).toBe( 400 )
    expect( ( await signedInRequest( app, member ).post( '/api/me/vault' )
      .send( { vault_dir: 'escape' } ) ).status ).toBe( 400 )
  } )

  it( 'is 409 for a folder that is taken', async () => {
    await mkdir( join( base, 'shared' ) )
    await signedInRequest( app, createTestUser() ).post( '/api/me/vault' )
      .send( { vault_dir: 'shared' } )

    const response = await signedInRequest( app, createTestUser() ).post( '/api/me/vault' )
      .send( { vault_dir: 'shared' } )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'That vault is already taken' } )
  } )

  it( 'is 409 for a user who already has a vault', async () => {
    await mkdir( join( base, 'another' ) )
    await mkdir( join( base, 'mine' ) )
    const member = createTestUser( { vault_dir: 'mine' } )

    const response = await signedInRequest( app, member ).post( '/api/me/vault' )
      .send( { vault_dir: 'another' } )

    expect( response.status ).toBe( 409 )
  } )
} )

describe( 'POST /api/me/vault/new', () => {
  it( 'creates the folder, claims it and answers 201 with the updated user', async () => {
    const member = createTestUser( { modules: [] } )

    const response = await signedInRequest( app, member ).post( '/api/me/vault/new' )
      .send( { vault_dir: 'fresh' } )

    expect( response.status ).toBe( 201 )
    expect( Me.parse( response.body ).vault_dir ).toBe( 'fresh' )
    expect( ( await signedInRequest( app, member ).get( '/api/me/vaults' ) ).status ).toBe( 409 )
  } )

  it( 'is 409 for a folder that exists, and does not claim it', async () => {
    await mkdir( join( base, 'there' ) )
    const member = createTestUser()

    const response = await signedInRequest( app, member ).post( '/api/me/vault/new' )
      .send( { vault_dir: 'there' } )

    expect( response.status ).toBe( 409 )
    expect( ( await signedInRequest( app, member ).get( '/api/me' ) ).body )
      .toMatchObject( { vault_dir: null } )
  } )

  it( 'is 400 for a bad name', async () => {
    const response = await signedInRequest( app, createTestUser() ).post( '/api/me/vault/new' )
      .send( { vault_dir: '../up' } )

    expect( response.status ).toBe( 400 )
  } )
} )

describe( 'choosing again when the vault folder is missing (ADR 0070)', () => {
  it.each( [ 'member', 'admin' ] as const )( 'lets a %s list, claim and create', async ( role ) => {
    await mkdir( join( base, 'free' ) )
    const user = createTestUser( { role, vault_dir: 'gone' } )
    const agent = signedInRequest( app, user )

    const listed = await agent.get( '/api/me/vaults' )

    expect( VaultChoice.parse( listed.body ) ).toEqual( { folders: [ 'free' ] } )

    const claimed = await agent.post( '/api/me/vault' ).send( { vault_dir: 'free' } )

    expect( claimed.status ).toBe( 200 )
    expect( Me.parse( claimed.body ) ).toMatchObject( { vault_dir: 'free', vault_missing: false } )
  } )

  it( 'lets a user whose folder is gone create a vault, answering with the user', async () => {
    const user = createTestUser( { vault_dir: 'gone' } )

    const response = await signedInRequest( app, user ).post( '/api/me/vault/new' )
      .send( { vault_dir: 'fresh' } )

    expect( response.status ).toBe( 201 )
    expect( Me.parse( response.body ) )
      .toMatchObject( { vault_dir: 'fresh', vault_missing: false } )
  } )

  it( 'answers a vault route with the 409 message, not a 500', async () => {
    const user = createTestUser( { vault_dir: 'gone' } )

    const response = await signedInRequest( app, user ).get( '/api/vault/folders' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Your vault folder is missing' } )
  } )
} )
