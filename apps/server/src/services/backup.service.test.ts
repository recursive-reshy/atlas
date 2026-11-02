// Node
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import Database from 'better-sqlite3'
// Shared
import { BackupResult } from '@atlas/shared'
// Errors
import { ConflictError } from '../errors.js'
// Repositories
import { closeDatabase, getDatabase, openDatabase } from '../repositories/database.js'
import { getHealth, listErrors } from '../repositories/health.repository.js'
// Services
import { backupName, recordOpenBackups, runBackup } from './backup.service.js'

let root = ''
let dir = ''

beforeEach( async () => {
  root = await mkdtemp( join( tmpdir(), 'mnemosyne-backup-test-' ) )
  dir = join( root, 'backups' )

  closeDatabase()
  openDatabase( join( root, 'source.db' ) )
  getDatabase().exec( 'CREATE TABLE note ( id INTEGER PRIMARY KEY, body TEXT )' )
  getDatabase().prepare( 'INSERT INTO note ( body ) VALUES ( ? )' ).run( 'hello' )
} )

afterEach( async () => {
  vi.useRealTimers()
  closeDatabase()
  await rm( root, { recursive: true, force: true } )
} )

describe( 'backupName', () => {
  it( 'uses Singapore time, without colons', () => {
    expect( backupName( new Date( '2026-10-22T20:30:05Z' ) ) )
      .toBe( 'mnemosyne-20261023-043005.db' )
  } )

  it( 'zero-pads a midnight hour', () => {
    expect( backupName( new Date( '2026-10-22T16:00:00Z' ) ) )
      .toBe( 'mnemosyne-20261023-000000.db' )
  } )
} )

describe( 'runBackup', () => {
  it( 'writes a checked copy named by Singapore time and creates the folder', async () => {
    vi.useFakeTimers( { now: new Date( '2026-10-22T20:30:00Z' ), toFake: [ 'Date' ] } )

    const result = await runBackup( { dir } )

    expect( BackupResult.parse( result ) ).toEqual( {
      file: 'mnemosyne-20261023-043000.db',
      bytes: ( await stat( join( dir, result.file ) ) ).size,
      at: '2026-10-22T20:30:00.000Z',
    } )
    expect( await readdir( dir ) ).toEqual( [ 'mnemosyne-20261023-043000.db' ] )

    const copy = new Database( join( dir, result.file ), { readonly: true } )

    expect( copy.prepare( 'SELECT body FROM note' ).all() ).toEqual( [ { body: 'hello' } ] )
    expect( copy.pragma( 'quick_check', { simple: true } ) ).toBe( 'ok' )
    copy.close()
  } )

  it( 'records the file and size as the backup row', async () => {
    const result = await runBackup( { dir } )

    expect( getHealth( null, 'backup', 'default' ) ).toMatchObject( {
      last_error: null,
      failing_since: null,
      detail: JSON.stringify( { file: result.file, bytes: result.bytes } ),
    } )
  } )

  it( 'refuses a second backup while one runs, then allows the next', async () => {
    const first = runBackup( { dir } )

    await expect( runBackup( { dir } ) ).rejects.toBeInstanceOf( ConflictError )
    await expect( first ).resolves.toHaveProperty( 'bytes' )
    await expect( runBackup( { dir } ) ).resolves.toBeDefined()
  } )

  it( 'deletes the partial file and records a failure when the check fails', async () => {
    const check = vi.fn().mockReturnValue( 'row 3 missing from index' )

    await expect( runBackup( { dir, check } ) ).rejects.toThrow( 'row 3 missing from index' )

    expect( await readdir( dir ) ).toEqual( [] )
    expect( getHealth( null, 'backup', 'default' )?.last_error )
      .toContain( 'row 3 missing from index' )
    expect( listErrors( null, 'backup', 'default' ) ).toHaveLength( 1 )
  } )

  it( 'records a failure and leaves no partial when the folder cannot be made', async () => {
    await writeFile( join( root, 'file' ), 'x' )

    await expect( runBackup( { dir: join( root, 'file', 'backups' ) } ) ).rejects.toThrow()

    expect( getHealth( null, 'backup', 'default' )?.last_error ).not.toBeNull()
    await expect( runBackup( { dir } ) ).resolves.toBeDefined()
    expect( getHealth( null, 'backup', 'default' )?.last_error ).toBeNull()
  } )

  it( 'releases the lock after a failure', async () => {
    await expect( runBackup( { dir, check: () => 'bad' } ) ).rejects.toThrow()
    await expect( runBackup( { dir } ) ).resolves.toBeDefined()
  } )

  it( 'never touches a finished backup already in the folder', async () => {
    await mkdir( dir, { recursive: true } )
    await writeFile( join( dir, 'mnemosyne-20200101-000000.db' ), 'old' )

    await runBackup( { dir } )

    expect( await readFile( join( dir, 'mnemosyne-20200101-000000.db' ), 'utf8' ) ).toBe( 'old' )
    expect( await readdir( dir ) ).toHaveLength( 2 )
  } )
} )

describe( 'recordOpenBackups', () => {
  it( 'records nothing when opening the database made no copy', () => {
    recordOpenBackups( { setAside: null, preMigrationBackup: null } )

    expect( getHealth( null, 'backup', 'default' ) ).toBeUndefined()
  } )

  it.each( [ 'setAside', 'preMigrationBackup' ] as const )(
    'records the %s copy as the last backup, with its file and size',
    async ( which ) => {
      const copy = join( root, 'pre-0.9-20261023-043000.db' )

      await writeFile( copy, 'x'.repeat( 2048 ) )
      recordOpenBackups( { setAside: null, preMigrationBackup: null, [ which ]: copy } )

      const record = getHealth( null, 'backup', 'default' )

      expect( record ).toMatchObject( { last_error: null } )
      expect( JSON.parse( record?.detail ?? '{}' ) )
        .toEqual( { file: 'pre-0.9-20261023-043000.db', bytes: 2048 } )
    },
  )

  it( 'records a failure when the copy cannot be read', () => {
    recordOpenBackups( { setAside: join( root, 'missing.db' ), preMigrationBackup: null } )

    expect( getHealth( null, 'backup', 'default' )?.last_error ).toContain( 'missing.db' )
  } )
} )
