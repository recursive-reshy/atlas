// Node
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import Database from 'better-sqlite3'
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
// Repositories
import {
  SCHEMA_BASE,
  closeDatabase,
  getDatabase,
  migrations,
  openDatabase,
} from './database.js'
import type { Migration } from './database.js'

const CURRENT = SCHEMA_BASE + migrations.length

describe( 'openDatabase on a file', () => {
  let directory = ''
  let databasePath = ''
  let backupDir = ''

  beforeEach( () => {
    directory = mkdtempSync( join( tmpdir(), 'atlas-open-' ) )
    databasePath = join( directory, 'atlas.db' )
    backupDir = join( directory, 'backups' )
    vi.useFakeTimers( { now: new Date( '2026-10-22T20:30:05Z' ), toFake: [ 'Date' ] } )
  } )

  afterEach( () => {
    vi.useRealTimers()
    closeDatabase()
    rmSync( directory, { recursive: true, force: true } )
  } )

  // A file as the previous release left it: some schema version, one row to recognise it by.
  const writeOld = ( version: number ): void => {
    const old = new Database( databasePath )

    old.pragma( 'journal_mode = WAL' )
    old.exec( 'CREATE TABLE marker ( note TEXT )' )
    old.prepare( 'INSERT INTO marker ( note ) VALUES ( ? )' ).run( 'from 0.8' )
    old.pragma( `user_version = ${ version }` )
    old.close()
  }

  const read = < Result >( path: string, work: ( db: Database.Database ) => Result ): Result => {
    const db = new Database( path, { readonly: true } )

    try {
      return work( db )
    } finally {
      db.close()
    }
  }

  const tablesIn = ( path: string ): string[] => {
    return read( path, ( db ) => db
      .prepare( "SELECT name FROM sqlite_master WHERE type = 'table'" )
      .all()
      .map( ( row ) => ( row as { name: string } ).name ) )
  }

  describe.each( [ 1, 5, 9 ] )( 'a database at schema %i', ( version ) => {
    beforeEach( () => {
      writeOld( version )
    } )

    it( 'is copied to the backups folder as pre-0.9-<timestamp>.db', () => {
      const result = openDatabase( databasePath, { backupDir } )
      const copy = join( backupDir, 'pre-0.9-20261023-043005.db' )

      expect( result ).toEqual( { setAside: copy, preMigrationBackup: null } )
      expect( readdirSync( backupDir ) ).toEqual( [ 'pre-0.9-20261023-043005.db' ] )
      expect( read( copy, ( db ) => db.prepare( 'SELECT note FROM marker' ).all() ) )
        .toEqual( [ { note: 'from 0.8' } ] )
      expect( read( copy, ( db ) => db.pragma( 'user_version', { simple: true } ) ) )
        .toBe( version )
    } )

    it( 'is replaced by an empty database at the current version', () => {
      openDatabase( databasePath, { backupDir } )

      expect( getDatabase().pragma( 'user_version', { simple: true } ) ).toBe( CURRENT )
      expect( getDatabase().prepare( 'SELECT COUNT(*) AS count FROM users' ).get() )
        .toEqual( { count: 0 } )
      expect( getDatabase().prepare( 'SELECT COUNT(*) AS count FROM jobs' ).get() )
        .toEqual( { count: 0 } )

      closeDatabase()

      expect( tablesIn( databasePath ) ).not.toContain( 'marker' )
    } )

    it( 'leaves no write-ahead or shared-memory file from the old database', () => {
      writeFileSync( `${ databasePath }-wal`, '' )
      writeFileSync( `${ databasePath }-shm`, '' )

      openDatabase( databasePath, { backupDir } )
      closeDatabase()

      expect( existsSync( `${ databasePath }-wal` ) ).toBe( false )
      expect( existsSync( `${ databasePath }-shm` ) ).toBe( false )
    } )
  } )

  it( 'refuses to start, and deletes nothing, when the copy fails', () => {
    writeOld( 9 )
    // A file where the backups folder should be, so the folder can't be made.
    writeFileSync( backupDir, 'in the way' )

    const before = readFileSync( databasePath )

    expect( () => openDatabase( databasePath, { backupDir } ) ).toThrow()
    expect( () => getDatabase() ).toThrow( 'Database is not open' )
    expect( readFileSync( databasePath ).equals( before ) ).toBe( true )
    expect( read( databasePath, ( db ) => db.prepare( 'SELECT note FROM marker' ).all() ) )
      .toEqual( [ { note: 'from 0.8' } ] )
  } )

  it( 'refuses a set-aside when no backups folder is given', () => {
    writeOld( 9 )

    expect( () => openDatabase( databasePath ) ).toThrow( /backups folder/ )
    expect( read( databasePath, ( db ) => db.prepare( 'SELECT note FROM marker' ).all() ) )
      .toEqual( [ { note: 'from 0.8' } ] )
  } )

  it( 'refuses a database from a newer version and leaves the file as it was', () => {
    writeOld( CURRENT + 1 )

    const before = readFileSync( databasePath )

    expect( () => openDatabase( databasePath, { backupDir } ) ).toThrow( /newer version/ )
    expect( readFileSync( databasePath ).equals( before ) ).toBe( true )
    expect( existsSync( backupDir ) ).toBe( false )
  } )

  describe( 'a later migration', () => {
    const second: Migration = 'CREATE TABLE later ( id INTEGER )'
    const withSecond = [ ...migrations, second ]

    beforeEach( () => {
      openDatabase( databasePath, { backupDir } )
      getDatabase().prepare( `INSERT INTO users ( id, email, name, role, status, created_at )
        VALUES ( 'u', 'u@x.test', 'U', 'member', 'active', 'now' )` ).run()
      getDatabase().prepare( `INSERT INTO settings ( user_id, key, value )
        VALUES ( 'u', 'kept', '1' )` ).run()
      closeDatabase()
    } )

    it( 'gets a pre-migration backup of the version it starts from', () => {
      const result = openDatabase( databasePath, { backupDir, migrations: withSecond } )
      const name = `pre-migration-v${ CURRENT }-to-v${ CURRENT + 1 }-20261023-043005.db`

      expect( result ).toEqual( { setAside: null, preMigrationBackup: join( backupDir, name ) } )
      expect( readdirSync( backupDir ) ).toEqual( [ name ] )
      const copy = join( backupDir, name )

      expect( read( copy, ( db ) => db.pragma( 'user_version', { simple: true } ) ) )
        .toBe( CURRENT )
      expect( tablesIn( copy ) ).not.toContain( 'later' )
      expect( getDatabase().pragma( 'user_version', { simple: true } ) ).toBe( CURRENT + 1 )
      expect( getDatabase().prepare( 'SELECT value FROM settings WHERE key = ?' ).get( 'kept' ) )
        .toEqual( { value: '1' } )
    } )

    it( 'refuses to start, and does not migrate, when the backup fails', () => {
      writeFileSync( backupDir, 'in the way' )

      expect( () => openDatabase( databasePath, { backupDir, migrations: withSecond } ) ).toThrow()
      expect( () => getDatabase() ).toThrow( 'Database is not open' )
      expect( read( databasePath, ( db ) => db.pragma( 'user_version', { simple: true } ) ) )
        .toBe( CURRENT )
    } )

    it( 'writes no backup when the database is already current', () => {
      const result = openDatabase( databasePath, { backupDir } )

      expect( result ).toEqual( { setAside: null, preMigrationBackup: null } )
      expect( existsSync( backupDir ) ).toBe( false )
    } )
  } )

  it( 'writes no backup for a new file or an in-memory database', () => {
    expect( openDatabase( databasePath, { backupDir } ) )
      .toEqual( { setAside: null, preMigrationBackup: null } )
    closeDatabase()

    expect( openDatabase( ':memory:' ) ).toEqual( { setAside: null, preMigrationBackup: null } )
    expect( existsSync( backupDir ) ).toBe( false )
  } )

  it( 'refuses to start when foreign_key_check reports a row', () => {
    openDatabase( databasePath, { backupDir } )
    closeDatabase()

    const writer = new Database( databasePath )

    writer.pragma( 'foreign_keys = OFF' )
    writer.prepare( `INSERT INTO prompt_versions
      ( user_id, profile_id, version, guidance, source, created_at )
      VALUES ( 'nobody', 'nobody', 1, 'g', 'seed', 'now' )` ).run()
    writer.close()

    expect( () => openDatabase( databasePath, { backupDir } ) )
      .toThrow( /break a foreign key/ )
    expect( () => getDatabase() ).toThrow( 'Database is not open' )
  } )
} )
