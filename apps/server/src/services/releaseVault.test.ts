// Node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
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
import { app } from '../app.js'
import { config } from '../config.js'
// Repositories
import { findUserById } from '../repositories/users.repository.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'
// Services
import { listUnclaimedVaults, releaseVaultFolder } from './vaultOnboarding.service.js'

let base: string
let originalVaultsPath: string

beforeEach( () => {
  base = mkdtempSync( join( tmpdir(), 'atlas-release-' ) )
  originalVaultsPath = config.vaultsPath
  config.vaultsPath = base
} )

afterEach( () => {
  config.vaultsPath = originalVaultsPath
  rmSync( base, { recursive: true, force: true } )
} )

const released = (): string[] => {
  const path = join( base, '.released' )

  return existsSync( path ) ? readdirSync( path ) : []
}

describe( 'releaseVaultFolder', () => {
  const at = new Date( '2026-11-10T09:05:03.250Z' )

  it( 'moves the folder to .released with a UTC timestamp, keeping its files', () => {
    mkdirSync( join( base, 'gone' ) )
    writeFileSync( join( base, 'gone', 'note.md' ), 'hello' )

    releaseVaultFolder( 'gone', at )

    expect( existsSync( join( base, 'gone' ) ) ).toBe( false )
    expect( released() ).toEqual( [ 'gone-20261110T090503' ] )
    expect( existsSync( join( base, '.released', 'gone-20261110T090503', 'note.md' ) ) )
      .toBe( true )
  } )

  it( 'does not overwrite an earlier release made in the same second', () => {
    mkdirSync( join( base, 'gone' ) )
    releaseVaultFolder( 'gone', at )
    mkdirSync( join( base, 'gone' ) )
    releaseVaultFolder( 'gone', at )

    expect( released().sort() ).toEqual( [ 'gone-20261110T090503', 'gone-20261110T090503-2' ] )
  } )

  it( 'does nothing for a missing folder', () => {
    expect( () => releaseVaultFolder( 'nothing', at ) ).not.toThrow()
    expect( released() ).toEqual( [] )
  } )

  it( 'does not throw when the move fails, and leaves the folder in place', () => {
    mkdirSync( join( base, 'gone' ) )
    writeFileSync( join( base, '.released' ), 'in the way' )

    expect( () => releaseVaultFolder( 'gone', at ) ).not.toThrow()
    expect( existsSync( join( base, 'gone' ) ) ).toBe( true )
  } )
} )

describe( 'released vaults through the admin routes (ADR 0097)', () => {
  it( 'reset-vault moves the folder aside and nobody is offered it', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const member = createTestUser( { vault_dir: 'brother' } )
    const other = createTestUser()

    mkdirSync( join( base, 'brother' ) )

    const response = await signedInRequest( app, admin )
      .post( `/api/admin/users/${ member.id }/reset-vault` )

    expect( response.status ).toBe( 200 )
    expect( findUserById( member.id )?.vault_dir ).toBeNull()
    expect( existsSync( join( base, 'brother' ) ) ).toBe( false )
    expect( released() ).toHaveLength( 1 )
    expect( released()[ 0 ] ).toMatch( /^brother-\d{8}T\d{6}$/ )
    expect( ( await listUnclaimedVaults( other.id ) ).folders ).toEqual( [] )
  } )

  it( 'reset-vault still succeeds for a user whose folder is already gone', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const member = createTestUser( { vault_dir: 'brother' } )
    const response = await signedInRequest( app, admin )
      .post( `/api/admin/users/${ member.id }/reset-vault` )

    expect( response.status ).toBe( 200 )
    expect( released() ).toEqual( [] )
  } )

  it( 'deleting a user moves their folder aside and nobody is offered it', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const gone = createTestUser( { vault_dir: 'gone' } )
    const other = createTestUser()
    const agent = signedInRequest( app, admin )

    mkdirSync( join( base, 'gone' ) )
    await agent.patch( `/api/admin/users/${ gone.id }` ).send( { status: 'removed' } )

    const response = await agent.delete( `/api/admin/users/${ gone.id }` )
      .send( { confirm: gone.email } )

    expect( response.status ).toBe( 204 )
    expect( existsSync( join( base, 'gone' ) ) ).toBe( false )
    expect( released()[ 0 ] ).toMatch( /^gone-\d{8}T\d{6}$/ )
    expect( ( await listUnclaimedVaults( other.id ) ).folders ).toEqual( [] )
  } )

  it( 'deleting a user still succeeds when the folder cannot be moved', async () => {
    const admin = createTestUser( { role: 'admin' } )
    const gone = createTestUser( { vault_dir: 'gone' } )
    const agent = signedInRequest( app, admin )

    mkdirSync( join( base, 'gone' ) )
    writeFileSync( join( base, '.released' ), 'in the way' )
    await agent.patch( `/api/admin/users/${ gone.id }` ).send( { status: 'removed' } )

    const response = await agent.delete( `/api/admin/users/${ gone.id }` )
      .send( { confirm: gone.email } )

    expect( response.status ).toBe( 204 )
    expect( findUserById( gone.id ) ).toBeUndefined()
  } )
} )
