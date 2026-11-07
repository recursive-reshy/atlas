// Node
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Repositories
import { SCHEMA_BASE, migrations } from './database.js'
import {
  LOCK_PATH,
  lockMigrations,
  migrationHash,
  readLock,
  unlockedVersions,
} from './migrationLock.js'

describe( 'the migration lock (ADR 0085)', () => {
  it( 'matches the hash of every locked migration', () => {
    const lock = readLock( LOCK_PATH )

    for( const [ version, hash ] of Object.entries( lock ) ) {
      const migration = migrations[ Number( version ) - SCHEMA_BASE - 1 ]

      expect(
        migration === undefined ? undefined : migrationHash( migration ),
        `Migration ${ version } is locked and has changed. Released migrations can't change: `
        + 'add a new migration instead (ADR 0085).',
      ).toBe( hash )
    }
  } )

  it( 'locks a contiguous prefix of the list, starting after SCHEMA_BASE', () => {
    const versions = Object.keys( readLock( LOCK_PATH ) ).map( Number ).sort( ( a, b ) => a - b )

    expect( versions[ 0 ] ).toBe( SCHEMA_BASE + 1 )
    expect( versions ).toEqual(
      versions.map( ( _, index ) => SCHEMA_BASE + 1 + index ),
    )
    expect( versions.at( -1 )! ).toBeLessThanOrEqual( SCHEMA_BASE + migrations.length )
  } )

  it( 'locks released schemas 10 to 13', () => {
    expect( Object.keys( readLock( LOCK_PATH ) ) ).toEqual(
      expect.arrayContaining( [ '10', '11', '12', '13' ] ),
    )
  } )

  it( 'keeps SCHEMA_BASE at 9', () => {
    expect(
      SCHEMA_BASE,
      'SCHEMA_BASE is the 0.9 baseline. Raising it would set aside databases the VM '
      + 'already holds; it needs its own ADR (ADR 0084).',
    ).toBe( 9 )
  } )
} )

describe( 'migrationHash', () => {
  it( 'hashes a SQL string and a function migration', () => {
    expect( migrationHash( 'SELECT 1' ) ).toMatch( /^[0-9a-f]{64}$/ )
    expect( migrationHash( 'SELECT 1' ) ).not.toBe( migrationHash( 'SELECT 2' ) )
    expect( migrationHash( () => undefined ) ).toMatch( /^[0-9a-f]{64}$/ )
  } )
} )

describe( 'lockMigrations', () => {
  let directory = ''
  let path = ''

  beforeEach( () => {
    directory = mkdtempSync( join( tmpdir(), 'atlas-lock-' ) )
    path = join( directory, 'migrations.lock.json' )
  } )

  afterEach( () => {
    rmSync( directory, { recursive: true, force: true } )
  } )

  it( 'adds the migrations that are not locked and returns their versions', () => {
    writeFileSync( path, '{}\n' )

    const added = lockMigrations( path, [ 'A', 'B' ] )

    expect( added ).toEqual( [ SCHEMA_BASE + 1, SCHEMA_BASE + 2 ] )
    expect( readLock( path ) ).toEqual( {
      [ SCHEMA_BASE + 1 ]: migrationHash( 'A' ),
      [ SCHEMA_BASE + 2 ]: migrationHash( 'B' ),
    } )
  } )

  it( 'never rewrites an entry that is already locked', () => {
    writeFileSync( path, `${ JSON.stringify( { [ SCHEMA_BASE + 1 ]: 'tampered' } ) }\n` )

    const added = lockMigrations( path, [ 'A', 'B' ] )

    expect( added ).toEqual( [ SCHEMA_BASE + 2 ] )
    expect( readLock( path )[ SCHEMA_BASE + 1 ] ).toBe( 'tampered' )
  } )

  it( 'writes nothing in check mode and reports the unlocked versions', () => {
    writeFileSync( path, '{}\n' )

    const before = readFileSync( path, 'utf8' )

    expect( lockMigrations( path, [ 'A' ], { check: true } ) ).toEqual( [ SCHEMA_BASE + 1 ] )
    expect( readFileSync( path, 'utf8' ) ).toBe( before )
  } )

  it( 'reports which versions are unlocked', () => {
    expect( unlockedVersions( { [ SCHEMA_BASE + 1 ]: 'x' }, [ 'A', 'B', 'C' ] ) )
      .toEqual( [ SCHEMA_BASE + 2, SCHEMA_BASE + 3 ] )
  } )
} )
