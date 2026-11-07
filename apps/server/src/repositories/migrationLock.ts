// Node
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// Packages
import { z } from 'zod'
// Repositories
import { SCHEMA_BASE, type Migration } from './database.js'

// ADR 0085: a released migration's hash is locked here so it can never change.
export const LOCK_PATH = fileURLToPath( new URL( './migrations.lock.json', import.meta.url ) )

const Lock = z.record( z.string(), z.string() )

export type MigrationLock = z.infer< typeof Lock >

export const migrationHash = ( migration: Migration ): string => createHash( 'sha256' )
  .update( typeof migration === 'string' ? migration : migration.toString() )
  .digest( 'hex' )

export const readLock = ( path: string ): MigrationLock => Lock.parse(
  JSON.parse( readFileSync( path, 'utf8' ) ),
)

export const unlockedVersions = ( lock: MigrationLock, list: Migration[] ): number[] => list
  .map( ( _, index ) => SCHEMA_BASE + index + 1 )
  .filter( ( version ) => lock[ version ] === undefined )

// Adds an entry for every migration not yet locked and never rewrites one that is. In check
// mode it writes nothing. Returns the versions that were (or, in check mode, would be) added.
export const lockMigrations = (
  path: string,
  list: Migration[],
  { check = false }: { check?: boolean } = {},
): number[] => {
  const lock = readLock( path )
  const added = unlockedVersions( lock, list )

  if( !check && added.length > 0 ) {
    for( const version of added ) {
      lock[ version ] = migrationHash( list[ version - SCHEMA_BASE - 1 ] )
    }

    writeFileSync( path, `${ JSON.stringify( lock, null, 2 ) }\n` )
  }

  return added
}
