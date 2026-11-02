// Node
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
// Config
import { config } from '../config.js'
// Logger
import { logger } from '../logger.js'
// Errors
import { NotFoundError, VaultMissingError, VaultNotChosenError } from '../errors.js'
// Test support
import { createTestUser } from '../test-support/auth.js'
// Services
import {
  listFolders,
  vaultDirFor,
  vaultIsMissing,
  vaultRootFor,
} from './vault.service.js'

let base: string
let originalVaultsPath: string

beforeEach( async () => {
  base = await mkdtemp( join( tmpdir(), 'atlas-vault-service-' ) )
  originalVaultsPath = config.vaultsPath
  config.vaultsPath = base
} )

afterEach( async () => {
  config.vaultsPath = originalVaultsPath
  await rm( base, { recursive: true, force: true } )
} )

describe( 'vaultDirFor', () => {
  it( 'is the user\'s vault folder name, whether or not the folder exists', () => {
    const user = createTestUser( { vault_dir: 'gone' } )

    expect( vaultDirFor( user.id ) ).toBe( 'gone' )
  } )

  it( 'is null for a user without a vault and for an unknown user', () => {
    expect( vaultDirFor( createTestUser().id ) ).toBeNull()
    expect( vaultDirFor( crypto.randomUUID() ) ).toBeNull()
  } )
} )

describe( 'vaultRootFor', () => {
  it( 'is the user\'s folder under the vaults root', async () => {
    await mkdir( join( base, 'naresh' ) )

    const user = createTestUser( { vault_dir: 'naresh' } )

    expect( vaultRootFor( user.id ) ).toBe( join( config.vaultsPath, 'naresh' ) )
  } )

  it( 'gives two users two different roots', async () => {
    await mkdir( join( base, 'naresh' ) )
    await mkdir( join( base, 'brother' ) )

    const first = createTestUser( { vault_dir: 'naresh' } )
    const second = createTestUser( { vault_dir: 'brother' } )

    expect( vaultRootFor( first.id ) ).not.toBe( vaultRootFor( second.id ) )
    expect( vaultRootFor( second.id ) ).toBe( join( config.vaultsPath, 'brother' ) )
  } )

  it( 'throws VaultNotChosenError for a user without a vault', () => {
    const user = createTestUser()

    expect( () => vaultRootFor( user.id ) ).toThrow( VaultNotChosenError )
    expect( () => vaultRootFor( user.id ) ).toThrow( 'Choose your vault first' )
  } )

  it( 'throws VaultMissingError when the folder is gone', () => {
    const user = createTestUser( { vault_dir: 'gone' } )

    expect( () => vaultRootFor( user.id ) ).toThrow( VaultMissingError )
    expect( () => vaultRootFor( user.id ) ).toThrow( 'Your vault folder is missing' )
  } )

  it( 'throws VaultMissingError when a file has taken its place', async () => {
    await writeFile( join( base, 'file' ), 'x' )

    const user = createTestUser( { vault_dir: 'file' } )

    expect( () => vaultRootFor( user.id ) ).toThrow( VaultMissingError )
  } )

  it( 'throws VaultMissingError when a symlink has taken its place', async () => {
    await mkdir( join( base, 'elsewhere' ) )
    await symlink( join( base, 'elsewhere' ), join( base, 'linked' ) )

    const user = createTestUser( { vault_dir: 'linked' } )

    expect( () => vaultRootFor( user.id ) ).toThrow( VaultMissingError )
  } )

  it( 'throws NotFoundError for an unknown user', () => {
    expect( () => vaultRootFor( 'nobody' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'vaultIsMissing', () => {
  it( 'is false for a user without a vault, or with a folder that exists', async () => {
    await mkdir( join( base, 'here' ) )

    expect( vaultIsMissing( createTestUser().id ) ).toBe( false )
    expect( vaultIsMissing( createTestUser( { vault_dir: 'here' } ).id ) ).toBe( false )
  } )

  it( 'is true when the folder is gone', () => {
    expect( vaultIsMissing( createTestUser( { vault_dir: 'gone' } ).id ) ).toBe( true )
  } )
} )

describe( 'listFolders', () => {
  const isRoot = process.getuid?.() === 0

  afterEach( async () => {
    await chmod( join( base, 'naresh', 'Locked' ), 0o755 ).catch( () => undefined )
  } )

  it.skipIf( isRoot )( 'logs one warning for each folder it cannot read', async () => {
    await mkdir( join( base, 'naresh', 'Locked' ), { recursive: true } )
    await mkdir( join( base, 'naresh', 'Open' ) )
    await chmod( join( base, 'naresh', 'Locked' ), 0o000 )

    const user = createTestUser( { vault_dir: 'naresh' } )
    const warn = vi.spyOn( logger, 'warn' ).mockImplementation( () => undefined )

    const { folders } = await listFolders( user.id )

    expect( folders.map( ( { name } ) => name ) ).toEqual( [ 'Locked', 'Open' ] )
    expect( warn ).toHaveBeenCalledTimes( 1 )
    expect( warn ).toHaveBeenCalledWith(
      { user_id: user.id, path: 'Locked', code: 'EACCES' },
      'Skipped a vault folder that could not be read',
    )
  } )

  it( 'logs nothing when every folder can be read', async () => {
    await mkdir( join( base, 'naresh', 'Open' ), { recursive: true } )

    const user = createTestUser( { vault_dir: 'naresh' } )
    const warn = vi.spyOn( logger, 'warn' ).mockImplementation( () => undefined )

    await listFolders( user.id )

    expect( warn ).not.toHaveBeenCalled()
  } )
} )
