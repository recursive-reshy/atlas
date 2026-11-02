// Node
import {
  mkdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises'
import { statSync } from 'node:fs'
import { basename, join } from 'node:path'
// Packages
import Database from 'better-sqlite3'
// Shared
import type { BackupResult } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Errors
import { BackupError, ConflictError } from '../errors.js'
// Logging
import { logger } from '../logger.js'
// Repositories
import { backupStamp } from '../repositories/backupStamp.js'
import { getDatabase } from '../repositories/database.js'
// Services
import { recordCheck } from './health.service.js'

// Returns null when the file passes SQLite's quick_check, else what it found.
type QuickCheck = ( path: string ) => string | null

type BackupOptions = { dir?: string, check?: QuickCheck }

const SUBJECT = { kind: 'backup', id: 'default' } as const

const quickCheck: QuickCheck = ( path ) => {
  const copy = new Database( path, { readonly: true } )

  try {
    const answer = String( copy.pragma( 'quick_check', { simple: true } ) )

    return answer === 'ok' ? null : answer
  } finally {
    copy.close()
  }
}

// The copy inherits WAL mode; a restore expects one file, with no -wal or -shm beside it.
const makeSelfContained = ( path: string ): void => {
  const copy = new Database( path )

  try {
    copy.pragma( 'journal_mode = DELETE' )
  } finally {
    copy.close()
  }
}

export const backupName = ( date: Date ): string => `mnemosyne-${ backupStamp( date ) }.db`

let running = false

// The copies openDatabase made before it started (a database set aside, or a backup before a
// migration) count as the latest backup; the check is recorded once the database is open.
export const recordOpenBackups = (
  { setAside, preMigrationBackup }: { setAside: string | null, preMigrationBackup: string | null },
): void => {
  for( const copy of [ setAside, preMigrationBackup ] ) {
    if( copy === null ) {
      continue
    }

    try {
      const { size } = statSync( copy )

      recordCheck(
        null,
        SUBJECT,
        { ok: true, detail: JSON.stringify( { file: basename( copy ), bytes: size } ) },
      )
    } catch{
      recordCheck( null, SUBJECT, { ok: false, message: `Could not read the backup ${ copy }` } )
    }
  }
}

const writeBackup = async ( dir: string, check: QuickCheck ): Promise< BackupResult > => {
  const now = new Date()
  const file = backupName( now )
  const partial = join( dir, `${ file }.partial` )

  try {
    await mkdir( dir, { recursive: true } )
    await getDatabase().backup( partial )

    makeSelfContained( partial )

    const problem = check( partial )

    if( problem !== null ) {
      throw new Error( `The copy failed its integrity check: ${ problem }` )
    }

    await rename( partial, join( dir, file ) )

    const { size } = await stat( join( dir, file ) )

    return { file, bytes: size, at: now.toISOString() }
  } catch( error ) {
    await rm( partial, { force: true } )
    throw error
  }
}

export const runBackup = async (
  { dir = config.backupDir, check = quickCheck }: BackupOptions = {},
): Promise< BackupResult > => {
  if( running ) {
    throw new ConflictError( 'A backup is already running' )
  }

  running = true

  try {
    const result = await writeBackup( dir, check )

    recordCheck(
      null,
      SUBJECT,
      { ok: true, detail: JSON.stringify( { file: result.file, bytes: result.bytes } ) },
    )
    logger.info( { file: result.file, bytes: result.bytes }, 'Backup written' )

    return result
  } catch( error ) {
    const reason = error instanceof Error ? error.message : 'Unknown error'
    const message = `Backup failed: ${ reason }`

    recordCheck( null, SUBJECT, { ok: false, message } )
    logger.error( { err: error }, 'Backup failed' )

    throw new BackupError( message )
  } finally {
    running = false
  }
}
