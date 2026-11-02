// Node
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
// Shared
import { ListFoldersResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Test support
import {
  createTestUser,
  defaultTestVaultPath,
  signedInRequest as request,
} from '../test-support/auth.js'
import { config } from '../config.js'

const vault = vi.hoisted( () => `/tmp/mnemosyne-vault-routes-${ process.pid }` )

// Its own vault, so this file can run beside the jobs routes tests, which wipe the shared one.
vi.mock( '../config.js', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( '../config.js' ) >()

  return { config: { ...original.config, vaultsPath: vault } }
} )

beforeEach( async () => {
  await rm( config.vaultsPath, { recursive: true, force: true } )
  await mkdir( defaultTestVaultPath(), { recursive: true } )
} )

afterEach( async () => {
  await rm( config.vaultsPath, { recursive: true, force: true } )
} )

describe( 'GET /api/vault/folders', () => {
  it( 'returns the default folder and the tree', async () => {
    await mkdir( join( defaultTestVaultPath(), 'Learning', 'AI' ), { recursive: true } )
    await mkdir( join( defaultTestVaultPath(), '.obsidian' ) )

    const response = await request( app ).get( '/api/vault/folders' )

    expect( response.status ).toBe( 200 )
    expect( ListFoldersResponse.parse( response.body ) ).toEqual( {
      default_folder: 'Mnemosyne',
      folders: [
        {
          name: 'Learning',
          path: 'Learning',
          children: [ { name: 'AI', path: 'Learning/AI', children: [] } ],
        },
      ],
    } )
  } )

  it( 'is 409 for a user who has not chosen a vault', async () => {
    const response = await request( app, createTestUser() ).get( '/api/vault/folders' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Choose your vault first' } )
  } )

  it( 'shows each user only the folders of their own vault', async () => {
    await mkdir( join( config.vaultsPath, 'brother', 'Private' ), { recursive: true } )
    await mkdir( join( defaultTestVaultPath(), 'Learning' ), { recursive: true } )

    const response = await request( app, createTestUser( { vault_dir: 'brother' } ) )
      .get( '/api/vault/folders' )

    expect( ( response.body as ListFoldersResponse ).folders.map( ( { path } ) => path ) )
      .toEqual( [ 'Private' ] )
  } )

  it( 'returns an empty list for an empty vault', async () => {
    const response = await request( app ).get( '/api/vault/folders' )

    expect( response.status ).toBe( 200 )
    expect( response.body ).toEqual( { default_folder: 'Mnemosyne', folders: [] } )
  } )
} )
