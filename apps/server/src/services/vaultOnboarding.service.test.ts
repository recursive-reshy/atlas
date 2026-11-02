// Node
import {
  lstat,
  mkdir,
  mkdtemp,
  realpath,
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
} from 'vitest'
// Config
import { config } from '../config.js'
// Errors
import { ConflictError, ValidationError } from '../errors.js'
// Repositories
import { findUserById } from '../repositories/users.repository.js'
// Test support
import { createTestUser } from '../test-support/auth.js'
// Services
import { claimVault, createVault, listUnclaimedVaults } from './vaultOnboarding.service.js'

let base: string
let outside: string
let originalVaultsPath: string

const exists = async ( path: string ): Promise< boolean > => {
  return lstat( path ).then( () => true, () => false )
}

beforeEach( async () => {
  base = await realpath( await mkdtemp( join( tmpdir(), 'atlas-onboarding-' ) ) )
  outside = join( base, 'outside' )
  await mkdir( outside )
  await mkdir( join( base, 'vaults' ) )
  originalVaultsPath = config.vaultsPath
  config.vaultsPath = join( base, 'vaults' )
} )

afterEach( async () => {
  config.vaultsPath = originalVaultsPath
  await rm( base, { recursive: true, force: true } )
} )

const folder = async ( name: string ): Promise< void > => {
  await mkdir( join( config.vaultsPath, name ) )
}

describe( 'listUnclaimedVaults', () => {
  it( 'lists plain folders with valid names, sorted', async () => {
    await folder( 'zeta' )
    await folder( 'alpha' )
    await folder( 'My Vault' )
    await folder( 'UPPER' )
    await folder( '.obsidian' )
    await writeFile( join( config.vaultsPath, 'notes.md' ), '# x' )
    await symlink( outside, join( config.vaultsPath, 'linked' ) )

    const user = createTestUser()

    await expect( listUnclaimedVaults( user.id ) )
      .resolves.toEqual( { folders: [ 'alpha', 'zeta' ] } )
  } )

  it( 'leaves out folders that someone has claimed', async () => {
    await folder( 'naresh' )
    await folder( 'brother' )
    createTestUser( { vault_dir: 'naresh' } )

    const user = createTestUser()

    await expect( listUnclaimedVaults( user.id ) ).resolves.toEqual( { folders: [ 'brother' ] } )
  } )

  it( 'is a conflict for a user who already has a vault', async () => {
    await folder( 'mine' )
    const user = createTestUser( { vault_dir: 'mine' } )

    await expect( listUnclaimedVaults( user.id ) ).rejects.toThrow( ConflictError )
  } )
} )

describe( 'claimVault', () => {
  it( 'gives the user an existing, unclaimed folder', async () => {
    await folder( 'brother' )
    const user = createTestUser()

    await claimVault( user.id, 'brother' )

    expect( findUserById( user.id )?.vault_dir ).toBe( 'brother' )
  } )

  it( 'refuses a folder that does not exist', async () => {
    const user = createTestUser()

    await expect( claimVault( user.id, 'missing' ) ).rejects.toThrow( ValidationError )
    expect( findUserById( user.id )?.vault_dir ).toBeNull()
  } )

  it( 'refuses a file', async () => {
    await writeFile( join( config.vaultsPath, 'file' ), 'x' )
    const user = createTestUser()

    await expect( claimVault( user.id, 'file' ) ).rejects.toThrow( ValidationError )
  } )

  it( 'refuses a symlink, to a folder outside the root or inside it', async () => {
    await folder( 'real' )
    await symlink( outside, join( config.vaultsPath, 'escape' ) )
    await symlink( join( config.vaultsPath, 'real' ), join( config.vaultsPath, 'alias' ) )
    const user = createTestUser()

    await expect( claimVault( user.id, 'escape' ) ).rejects.toThrow( ValidationError )
    await expect( claimVault( user.id, 'alias' ) ).rejects.toThrow( ValidationError )
    expect( findUserById( user.id )?.vault_dir ).toBeNull()
  } )

  it( 'says a claimed folder is taken and changes nothing', async () => {
    await folder( 'shared' )
    const first = createTestUser()
    const second = createTestUser()

    await claimVault( first.id, 'shared' )

    await expect( claimVault( second.id, 'shared' ) )
      .rejects.toThrow( 'That vault is already taken' )
    expect( findUserById( second.id )?.vault_dir ).toBeNull()
    expect( findUserById( first.id )?.vault_dir ).toBe( 'shared' )
  } )

  it( 'lets only one of two simultaneous claims win', async () => {
    await folder( 'shared' )
    const first = createTestUser()
    const second = createTestUser()

    const results = await Promise.allSettled( [
      claimVault( first.id, 'shared' ),
      claimVault( second.id, 'shared' ),
    ] )

    expect( results.filter( ( { status } ) => status === 'fulfilled' ) ).toHaveLength( 1 )
    expect( results.filter( ( { status } ) => status === 'rejected' ) ).toHaveLength( 1 )
  } )

  it( 'refuses a user who already has a vault', async () => {
    await folder( 'other' )
    await folder( 'mine' )
    const user = createTestUser( { vault_dir: 'mine' } )

    await expect( claimVault( user.id, 'other' ) ).rejects.toThrow( ConflictError )
    expect( findUserById( user.id )?.vault_dir ).toBe( 'mine' )
  } )

  it( 'lets one user\'s two simultaneous claims bind only one folder', async () => {
    await folder( 'one' )
    await folder( 'two' )
    const user = createTestUser()

    const results = await Promise.allSettled( [
      claimVault( user.id, 'one' ),
      claimVault( user.id, 'two' ),
    ] )

    expect( results.filter( ( { status } ) => status === 'fulfilled' ) ).toHaveLength( 1 )
  } )
} )

describe( 'createVault', () => {
  it( 'makes the folder and gives it to the user', async () => {
    const user = createTestUser()

    await createVault( user.id, 'fresh' )

    expect( ( await lstat( join( config.vaultsPath, 'fresh' ) ) ).isDirectory() ).toBe( true )
    expect( findUserById( user.id )?.vault_dir ).toBe( 'fresh' )
  } )

  it( 'refuses an existing folder and leaves it alone', async () => {
    await folder( 'taken' )
    await writeFile( join( config.vaultsPath, 'taken', 'note.md' ), '# keep' )
    const user = createTestUser()

    await expect( createVault( user.id, 'taken' ) ).rejects.toThrow( ConflictError )
    expect( await exists( join( config.vaultsPath, 'taken', 'note.md' ) ) ).toBe( true )
    expect( findUserById( user.id )?.vault_dir ).toBeNull()
  } )

  it( 'removes the folder it made when the claim fails', async () => {
    // Someone holds the name in the database although no folder exists yet
    createTestUser( { vault_dir: 'raced' } )
    const user = createTestUser()

    await expect( createVault( user.id, 'raced' ) ).rejects.toThrow( 'That vault is already taken' )
    expect( await exists( join( config.vaultsPath, 'raced' ) ) ).toBe( false )
  } )

  it( 'refuses a user who already has a vault, without making a folder', async () => {
    await folder( 'mine' )
    const user = createTestUser( { vault_dir: 'mine' } )

    await expect( createVault( user.id, 'another' ) ).rejects.toThrow( ConflictError )
    expect( await exists( join( config.vaultsPath, 'another' ) ) ).toBe( false )
  } )
} )

describe( 'a user whose vault folder is missing (ADR 0070)', () => {
  it( 'is offered the unclaimed folders', async () => {
    await folder( 'brother' )
    const user = createTestUser( { vault_dir: 'gone' } )

    await expect( listUnclaimedVaults( user.id ) ).resolves.toEqual( { folders: [ 'brother' ] } )
  } )

  it( 'can claim another folder, which replaces the missing one', async () => {
    await folder( 'brother' )
    const user = createTestUser( { vault_dir: 'gone' } )

    await claimVault( user.id, 'brother' )

    expect( findUserById( user.id )?.vault_dir ).toBe( 'brother' )
  } )

  it( 'can create a new vault', async () => {
    const user = createTestUser( { vault_dir: 'gone' } )

    await createVault( user.id, 'fresh' )

    expect( findUserById( user.id )?.vault_dir ).toBe( 'fresh' )
    expect( await exists( join( config.vaultsPath, 'fresh' ) ) ).toBe( true )
  } )

  it( 'can recreate the folder under its old name', async () => {
    const user = createTestUser( { vault_dir: 'gone' } )

    await createVault( user.id, 'gone' )

    expect( findUserById( user.id )?.vault_dir ).toBe( 'gone' )
    expect( await exists( join( config.vaultsPath, 'gone' ) ) ).toBe( true )
  } )

  it( 'still cannot take a folder someone else has', async () => {
    await folder( 'theirs' )
    createTestUser( { vault_dir: 'theirs' } )
    const user = createTestUser( { vault_dir: 'gone' } )

    await expect( claimVault( user.id, 'theirs' ) ).rejects.toThrow( 'That vault is already taken' )
    expect( findUserById( user.id )?.vault_dir ).toBe( 'gone' )
  } )

  it( 'is refused once the folder is back', async () => {
    const user = createTestUser( { vault_dir: 'gone' } )

    await folder( 'gone' )
    await folder( 'other' )

    await expect( claimVault( user.id, 'other' ) ).rejects.toThrow( 'You already have a vault' )
    expect( findUserById( user.id )?.vault_dir ).toBe( 'gone' )
  } )

  it( 'lets two simultaneous choices bind only one folder', async () => {
    await folder( 'one' )
    await folder( 'two' )
    const user = createTestUser( { vault_dir: 'gone' } )

    const results = await Promise.allSettled( [
      claimVault( user.id, 'one' ),
      claimVault( user.id, 'two' ),
    ] )

    expect( results.filter( ( { status } ) => status === 'fulfilled' ) ).toHaveLength( 1 )
  } )
} )
