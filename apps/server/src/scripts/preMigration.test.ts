// Node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
// Scripts
import { findPreMigration, runCli, swapPreMigration } from './preMigration.js'
import type { SwapResult } from './preMigration.js'

const movedAside = ( { rolledBack }: SwapResult ): string => {
  if( rolledBack === null ) {
    throw new Error( 'Expected a rolled-back file' )
  }

  return rolledBack
}

let dataDir = ''
let copies = ''

const put = ( directory: string, name: string, text: string ): string => {
  mkdirSync( directory, { recursive: true } )
  writeFileSync( join( directory, name ), text )

  return join( directory, name )
}

beforeEach( () => {
  dataDir = mkdtempSync( join( tmpdir(), 'atlas-premigration-' ) )
  copies = join( dataDir, 'pre-migration' )
} )

afterEach( () => {
  rmSync( dataDir, { recursive: true, force: true } )
} )

describe( 'findPreMigration', () => {
  it( 'returns the newest copy for that schema step', () => {
    put( copies, 'pre-migration-v13-to-v14-20261101-090000.db', 'old' )
    const newest = put( copies, 'pre-migration-v13-to-v14-20261107-181500.db', 'new' )

    put( copies, 'pre-migration-v13-to-v14-20261105-120000.db', 'middle' )

    expect( findPreMigration( dataDir, 13, 14 ) ).toBe( newest )
  } )

  it( 'ignores other steps, other kinds of copy and the rolled-back files', () => {
    put( copies, 'pre-migration-v12-to-v14-20261107-181500.db', 'x' )
    put( copies, 'pre-migration-v13-to-v15-20261107-181500.db', 'x' )
    put( copies, 'pre-0.9-20261107-181500.db', 'x' )
    put( copies, 'rolled-back-v14-20261107-181500.db', 'x' )
    put( copies, 'pre-migration-v13-to-v14-20261107-181500.db-wal', 'x' )

    expect( findPreMigration( dataDir, 13, 14 ) ).toBeNull()
  } )

  it( 'does not mistake v1 for v13 or v14 for v140', () => {
    put( copies, 'pre-migration-v113-to-v14-20261107-181500.db', 'x' )
    put( copies, 'pre-migration-v13-to-v140-20261107-181500.db', 'x' )

    expect( findPreMigration( dataDir, 13, 14 ) ).toBeNull()
  } )

  it( 'returns null when the folder does not exist', () => {
    expect( findPreMigration( dataDir, 13, 14 ) ).toBeNull()
  } )
} )

describe( 'swapPreMigration', () => {
  const stamp = /^\d{8}-\d{6}$/

  it( 'moves the live database and its -wal and -shm aside, and puts the copy in place', () => {
    put( dataDir, 'atlas.db', 'live' )
    put( dataDir, 'atlas.db-wal', 'wal' )
    put( dataDir, 'atlas.db-shm', 'shm' )

    const copy = put( copies, 'pre-migration-v13-to-v14-20261107-181500.db', 'before' )
    const rolledBack = movedAside( swapPreMigration( dataDir, copy ) )

    expect( readFileSync( join( dataDir, 'atlas.db' ), 'utf8' ) ).toBe( 'before' )
    expect( existsSync( join( dataDir, 'atlas.db-wal' ) ) ).toBe( false )
    expect( existsSync( join( dataDir, 'atlas.db-shm' ) ) ).toBe( false )

    const name = rolledBack.split( '/' ).at( -1 ) ?? ''

    expect( rolledBack.startsWith( copies ) ).toBe( true )
    expect( name ).toMatch( /^rolled-back-v14-\d{8}-\d{6}\.db$/ )
    expect( stamp.test( name.slice( 'rolled-back-v14-'.length, -3 ) ) ).toBe( true )
    expect( readFileSync( rolledBack, 'utf8' ) ).toBe( 'live' )
    expect( readFileSync( `${ rolledBack }-wal`, 'utf8' ) ).toBe( 'wal' )
    expect( readFileSync( `${ rolledBack }-shm`, 'utf8' ) ).toBe( 'shm' )
  } )

  it( 'keeps the chosen copy, and deletes nothing', () => {
    put( dataDir, 'atlas.db', 'live' )

    const copy = put( copies, 'pre-migration-v13-to-v14-20261107-181500.db', 'before' )
    const other = put( copies, 'pre-migration-v12-to-v13-20261001-100000.db', 'older' )
    const rolledBack = movedAside( swapPreMigration( dataDir, copy ) )

    expect( readFileSync( copy, 'utf8' ) ).toBe( 'before' )
    expect( readFileSync( other, 'utf8' ) ).toBe( 'older' )
    expect( readdirSync( copies ).sort() ).toEqual( [
      'pre-migration-v12-to-v13-20261001-100000.db',
      'pre-migration-v13-to-v14-20261107-181500.db',
      rolledBack.split( '/' ).at( -1 ),
    ].sort() )
  } )

  it( 'works when there are no -wal or -shm files', () => {
    put( dataDir, 'atlas.db', 'live' )

    const copy = put( copies, 'pre-migration-v13-to-v14-20261107-181500.db', 'before' )
    const rolledBack = movedAside( swapPreMigration( dataDir, copy ) )

    expect( readFileSync( rolledBack, 'utf8' ) ).toBe( 'live' )
    expect( existsSync( `${ rolledBack }-wal` ) ).toBe( false )
  } )

  it( 'works when there is no live database at all', () => {
    const copy = put( copies, 'pre-migration-v13-to-v14-20261107-181500.db', 'before' )
    const { rolledBack } = swapPreMigration( dataDir, copy )

    expect( readFileSync( join( dataDir, 'atlas.db' ), 'utf8' ) ).toBe( 'before' )
    expect( rolledBack ).toBeNull()
  } )

  it( 'refuses a copy that does not exist, and changes nothing', () => {
    put( dataDir, 'atlas.db', 'live' )

    const missing = join( copies, 'pre-migration-v13-to-v14-20261107-000000.db' )

    expect( () => swapPreMigration( dataDir, missing ) ).toThrow( /not found/ )
    expect( readFileSync( join( dataDir, 'atlas.db' ), 'utf8' ) ).toBe( 'live' )
  } )

  it( 'refuses a file that is not a pre-migration copy in the data folder', () => {
    put( dataDir, 'atlas.db', 'live' )

    const wrongName = put( copies, 'rolled-back-v14-20261107-181500.db', 'x' )
    const outside = put( tmpdir(), `pre-migration-v13-to-v14-${ process.pid }.db`, 'x' )

    expect( () => swapPreMigration( dataDir, wrongName ) ).toThrow( /pre-migration copy/ )
    expect( () => swapPreMigration( dataDir, outside ) ).toThrow( /pre-migration copy/ )
    expect( readFileSync( join( dataDir, 'atlas.db' ), 'utf8' ) ).toBe( 'live' )
    rmSync( outside )
  } )

  it( 'refuses to overwrite a rolled-back file that already exists', () => {
    put( dataDir, 'atlas.db', 'live' )

    const copy = put( copies, 'pre-migration-v13-to-v14-20261107-181500.db', 'before' )
    const now = new Date( '2026-11-08T00:00:00Z' )

    swapPreMigration( dataDir, copy, now )
    put( dataDir, 'atlas.db', 'live again' )

    expect( () => swapPreMigration( dataDir, copy, now ) ).toThrow( /already exists/ )
    expect( readFileSync( join( dataDir, 'atlas.db' ), 'utf8' ) ).toBe( 'live again' )
  } )
} )

describe( 'runCli', () => {
  it( 'find prints the path and exits 0, or prints nothing and exits 1', () => {
    expect( runCli( [ 'find', '13', '14' ], dataDir ) )
      .toEqual( { code: 1, stdout: '', stderr: '' } )

    const copy = put( copies, 'pre-migration-v13-to-v14-20261107-181500.db', 'x' )

    expect( runCli( [ 'find', '13', '14' ], dataDir ) )
      .toEqual( { code: 0, stdout: `${ copy }\n`, stderr: '' } )
  } )

  it( 'swap prints the rolled-back path, and a refusal exits 1 with the reason', () => {
    put( dataDir, 'atlas.db', 'live' )

    const copy = put( copies, 'pre-migration-v13-to-v14-20261107-181500.db', 'x' )
    const done = runCli( [ 'swap', copy ], dataDir )

    expect( done.code ).toBe( 0 )
    expect( done.stdout.trim() ).toMatch( /rolled-back-v14-\d{8}-\d{6}\.db$/ )

    const refused = runCli( [ 'swap', join( copies, 'nope.db' ) ], dataDir )

    expect( refused.code ).toBe( 1 )
    expect( refused.stderr ).toMatch( /pre-migration copy/ )
  } )

  it( 'needs DATA_DIR and a known command', () => {
    expect( runCli( [ 'find', '13', '14' ], undefined ).code ).toBe( 2 )
    expect( runCli( [ 'find', 'x', '14' ], dataDir ).code ).toBe( 2 )
    expect( runCli( [ 'dance' ], dataDir ).code ).toBe( 2 )
  } )
} )
