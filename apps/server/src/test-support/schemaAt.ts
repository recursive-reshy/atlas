// Node
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// Packages
import Database from 'better-sqlite3'
// Repositories
import { SCHEMA_BASE, migrations, runMigrations } from '#src/repositories/database.js'
import { LOCK_PATH, readLock } from '#src/repositories/migrationLock.js'

// ADR 0085: a released schema is rebuilt by running the locked migrations up to it, which only
// works because they never change.
export const schemaAt = ( version: number ): Database.Database => {
  const db = new Database( ':memory:' )

  db.pragma( 'foreign_keys = ON' )
  runMigrations( db, migrations.slice( 0, version - SCHEMA_BASE ) )

  return db
}

export const seedPath = ( version: number ): string => fileURLToPath(
  new URL( `../repositories/fixtures/schema-${ version }.sql`, import.meta.url ),
)

export const seedExists = ( version: number ): boolean => {
  try {
    readFileSync( seedPath( version ) )

    return true
  } catch{
    return false
  }
}

export const loadSeed = ( db: Database.Database, version: number ): void => {
  db.exec( readFileSync( seedPath( version ), 'utf8' ) )
}

// Locked versions that need a seed (TRD §2.3): every one from the 1.0 baseline, schema 13.
export const seededVersions = (): number[] => Object.keys( readLock( LOCK_PATH ) )
  .map( Number )
  .filter( ( version ) => version >= 13 )
  .sort( ( a, b ) => a - b )
