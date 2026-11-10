// Node
import {
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
// Packages
import Database from 'better-sqlite3'
import { z } from 'zod'
// Repositories
import { backupStamp } from './backupStamp.js'

// Migration N is stored as version SCHEMA_BASE + N; migrations 1–9 became the baseline (ADR 0066).
export const SCHEMA_BASE = 9

export type Migration = string | ( ( db: Database.Database ) => void )

const readSql = ( name: string ): string => {
  return readFileSync( new URL( `./sql/${ name }.sql`, import.meta.url ), 'utf8' )
}

// Each migration's SQL is a file in sql/ (ADR 0099), read once here and never edited after it
// ships (ADR 0085). Baseline: the whole 0.9 schema in one step (ADR 0066), stored as version 10;
// it seeds nothing, seeding is seedUser.
export const migrationFiles = [
  'baseline',
  // 11 (ADR 0074): the health tables accept the new app kinds
  '11-transcription-runs',
  // 12 (ADR 0080): the health tables accept the PO token provider's kind
  '12-pot-provider-kind',
  // 13 (ADR 0081): Gemini replaces the download pipeline; transcription runs gain tokens
  '13-gemini-transcription',
  // 14 (ADR 0085): `pieces` dropped, `audio_seconds` renamed `duration_seconds`
  '14-transcription-runs-duration',
  // 15 (ADR 0089): the concept layer (sections, concepts, note mappings)
  '15-melete-concept-layer',
  // 16 (ADRs 0091, 0092): Themis, time entries, `user_modules` rebuilt to accept `themis`
  '16-themis-and-time',
  // 17 (ADR 0101): modules are defined by ModuleId alone; no list in user_modules or the view
  '17-modules-registry',
]

export const migrations: Migration[] = migrationFiles.map( readSql )

let database: Database.Database | undefined

// Names the migration that failed. database.ts stays free of the logger (and so of config), so
// that `migrations:lock` and release.sh can import the list without the app's environment;
// server.ts logs it.
export class MigrationError extends Error {
  version: number

  constructor( version: number, cause: unknown ) {
    const reason = cause instanceof Error ? cause.message : String( cause )

    super( `Migration ${ version } failed: ${ reason }`, { cause } )
    this.name = 'MigrationError'
    this.version = version
  }
}

export const runMigrations = ( db: Database.Database, migrations: Migration[] ): void => {
  const applied = z.number().parse( db.pragma( 'user_version', { simple: true } ) )

  db.transaction( () => {
    for( const [ index, migration ] of migrations.entries() ) {
      const version = SCHEMA_BASE + index + 1

      if( applied < version ) {
        try {
          if( typeof migration === 'string' ) {
            db.exec( migration )
          } else {
            migration( db )
          }
        } catch( error ) {
          throw new MigrationError( version, error )
        }

        db.pragma( `user_version = ${ version }` )
      }
    }
  } )()
}

export type OpenOptions = {
  migrations?: Migration[]
}

export type OpenResult = {
  setAside: string | null
  preMigrationBackup: string | null
}

// VACUUM INTO writes a consistent single-file copy and refuses to overwrite an existing file.
// Copies sit in pre-migration/ next to the database, so they follow it to wherever it lives.
const copyTo = ( source: Database.Database, databasePath: string, name: string ): string => {
  const directory = join( dirname( databasePath ), 'pre-migration' )

  mkdirSync( directory, { recursive: true } )

  const target = join( directory, name )

  source.prepare( 'VACUUM INTO ?' ).run( target )

  return target
}

export const openDatabase = (
  path: string,
  { migrations: toApply = migrations }: OpenOptions = {},
): OpenResult => {
  closeDatabase()

  const result: OpenResult = { setAside: null, preMigrationBackup: null }
  const target = SCHEMA_BASE + toApply.length
  const file = path !== ':memory:'
  let opened = new Database( path )
  const stored = z.number().parse( opened.pragma( 'user_version', { simple: true } ) )

  try {
    // Checked before anything is written, so a refused file is left exactly as it was.
    if( stored > target ) {
      throw new Error(
        `This database is from a newer version of Atlas (schema ${ stored }, `
        + `this version knows ${ target }). `
        + 'Restore an older backup or upgrade the app.',
      )
    }

    if( file && stored >= 1 && stored <= SCHEMA_BASE ) {
      // Schema 1–9 is a pre-0.9 database: keep a copy, then start empty (ADR 0066).
      result.setAside = copyTo( opened, path, `pre-0.9-${ backupStamp( new Date() ) }.db` )
      opened.close()

      for( const suffix of [ '', '-wal', '-shm' ] ) {
        rmSync( `${ path }${ suffix }`, { force: true } )
      }

      opened = new Database( path )
    } else if( file && stored > SCHEMA_BASE && stored < target ) {
      const name = `pre-migration-v${ stored }-to-v${ target }-${ backupStamp( new Date() ) }.db`

      result.preMigrationBackup = copyTo( opened, path, name )
    }

    // Writes wait out Litestream's brief locks (ADR 0076)
    opened.pragma( 'busy_timeout = 5000' )
    opened.pragma( 'journal_mode = WAL' )
    // Outside the migration transaction, where it would have no effect.
    opened.pragma( 'foreign_keys = ON' )

    runMigrations( opened, toApply )

    const orphans = opened.pragma( 'foreign_key_check' ) as unknown[]

    if( orphans.length > 0 ) {
      throw new Error(
        `The database has ${ orphans.length } row(s) that break a foreign key. Restore a backup.`,
      )
    }
  } catch( error ) {
    opened.close()
    throw error
  }

  database = opened

  return result
}

export const closeDatabase = (): void => {
  database?.close()
  database = undefined
}

export const getDatabase = (): Database.Database => {
  if( database === undefined ) {
    throw new Error( 'Database is not open' )
  }

  return database
}

export const inTransaction = < Result >( work: () => Result ): Result => {
  return getDatabase().transaction( work )()
}
