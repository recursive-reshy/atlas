// Node
import {
  copyFileSync,
  existsSync,
  readdirSync,
  renameSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Repositories
import { backupStamp } from '../repositories/backupStamp.js'

// Rolls the database back past a migration (ADR 0086): `find` names the copy the server wrote
// before that migration, `swap` moves the live database aside and puts the copy in its place.
// deploy.sh runs this in the app image with the data volume mounted; nothing is ever deleted.

const COPY_NAME = /^pre-migration-v(\d+)-to-v(\d+)-(\d{8}-\d{6})\.db$/
const SUFFIXES = [ '', '-wal', '-shm' ]

const copiesIn = ( dataDir: string ): string => join( dataDir, 'pre-migration' )

// The newest copy for `from` → `to`; the stamp in the name sorts as text.
export const findPreMigration = ( dataDir: string, from: number, to: number ): string | null => {
  const directory = copiesIn( dataDir )

  if( !existsSync( directory ) ) {
    return null
  }

  const newest = readdirSync( directory )
    .filter( ( name ) => {
      const match = COPY_NAME.exec( name )

      return match !== null && Number( match[ 1 ] ) === from && Number( match[ 2 ] ) === to
    } )
    .sort()
    .at( -1 )

  return newest === undefined ? null : join( directory, newest )
}

export type SwapResult = { rolledBack: string | null }

export const swapPreMigration = (
  dataDir: string,
  copy: string,
  now: Date = new Date(),
): SwapResult => {
  const match = COPY_NAME.exec( basename( copy ) )

  if( match === null || dirname( copy ) !== copiesIn( dataDir ) ) {
    throw new Error( `${ copy } is not a pre-migration copy in ${ copiesIn( dataDir ) }` )
  }

  if( !existsSync( copy ) ) {
    throw new Error( `${ copy } not found` )
  }

  const live = join( dataDir, 'atlas.db' )
  const name = `rolled-back-v${ match[ 2 ] }-${ backupStamp( now ) }.db`
  const rolledBack = join( copiesIn( dataDir ), name )

  if( SUFFIXES.some( ( suffix ) => existsSync( `${ rolledBack }${ suffix }` ) ) ) {
    throw new Error( `${ rolledBack } already exists; nothing was changed` )
  }

  const moved = SUFFIXES.filter( ( suffix ) => existsSync( `${ live }${ suffix }` ) )

  for( const suffix of moved ) {
    renameSync( `${ live }${ suffix }`, `${ rolledBack }${ suffix }` )
  }

  try {
    copyFileSync( copy, live )
  } catch( error ) {
    // Put the live files back so a failed swap leaves the database as it was
    for( const suffix of moved ) {
      renameSync( `${ rolledBack }${ suffix }`, `${ live }${ suffix }` )
    }

    throw error
  }

  return { rolledBack: moved.length > 0 ? rolledBack : null }
}

const usage = 'usage: preMigration.js find <from> <to> | swap <file> (DATA_DIR is the data folder)'

export type CliResult = { code: number, stdout: string, stderr: string }

// find: prints the path (exit 0) or nothing (exit 1). swap: prints the rolled-back path.
export const runCli = ( argv: string[], dataDir: string | undefined ): CliResult => {
  const [ command, ...args ] = argv
  const [ first, second ] = args

  if( dataDir === undefined || dataDir === '' ) {
    return { code: 2, stdout: '', stderr: 'DATA_DIR is not set\n' }
  }

  if( command === 'find' && args.length === 2 && args.every( ( arg ) => /^\d+$/.test( arg ) ) ) {
    const found = findPreMigration( dataDir, Number( first ), Number( second ) )

    return found === null
      ? { code: 1, stdout: '', stderr: '' }
      : { code: 0, stdout: `${ found }\n`, stderr: '' }
  }

  if( command === 'swap' && args.length === 1 && first !== undefined ) {
    try {
      const { rolledBack } = swapPreMigration( dataDir, first )

      return { code: 0, stdout: `${ rolledBack ?? '' }\n`, stderr: '' }
    } catch( error ) {
      const message = error instanceof Error ? error.message : String( error )

      return { code: 1, stdout: '', stderr: `${ message }\n` }
    }
  }

  return { code: 2, stdout: '', stderr: `${ usage }\n` }
}

if( process.argv[ 1 ] !== undefined && fileURLToPath( import.meta.url ) === process.argv[ 1 ] ) {
  const { code, stdout, stderr } = runCli( process.argv.slice( 2 ), process.env.DATA_DIR )

  process.stdout.write( stdout )
  process.stderr.write( stderr )
  process.exitCode = code
}
