// Packages
import { z } from 'zod'
// Shared
import { AppHealthKind } from '@atlas/shared'
import type {
  GetStatusResponse,
  HealthError,
  HealthKind,
  HealthState,
  StatusRow,
} from '@atlas/shared'
// Config
import { config } from '../config.js'
// Errors
import { NotFoundError } from '../errors.js'
// Repositories
import { findFeedById, listFeeds } from '../repositories/feeds.repository.js'
import { findAccount } from '../repositories/gmailAccount.repository.js'
import { findSourceById, listSources } from '../repositories/gmailSources.repository.js'
import { listErrors, listHealth } from '../repositories/health.repository.js'
import type { HealthRecord } from '../repositories/health.repository.js'
// Services
import { runServiceChecks } from './health.service.js'

const SINGLETON_ID = 'default'
const KILOBYTE = 1024

const BackupDetail = z.object( { file: z.string(), bytes: z.number() } )

const byName = ( first: StatusRow, second: StatusRow ): number => {
  return first.name.localeCompare( second.name, undefined, { sensitivity: 'base' } )
}

const formatBytes = ( bytes: number ): string => {
  if( bytes < KILOBYTE ) {
    return `${ bytes } B`
  }

  if( bytes < KILOBYTE ** 2 ) {
    return `${ ( bytes / KILOBYTE ).toFixed( 1 ) } KB`
  }

  if( bytes < KILOBYTE ** 3 ) {
    return `${ ( bytes / KILOBYTE ** 2 ).toFixed( 1 ) } MB`
  }

  return `${ ( bytes / KILOBYTE ** 3 ).toFixed( 1 ) } GB`
}

// The backup service stores { file, bytes } as JSON; the panel shows it as one line.
const describeBackup = ( detail: string | null ): string | null => {
  if( detail === null ) {
    return null
  }

  try {
    const { file, bytes } = BackupDetail.parse( JSON.parse( detail ) )

    return `${ file }, ${ formatBytes( bytes ) }`
  } catch{
    return detail
  }
}

type Subject = { kind: HealthKind, id: string, name: string }

const toRow = (
  { kind, id, name }: Subject,
  health: HealthRecord | undefined,
  off: boolean,
  detail: string | null = health?.detail ?? null,
): StatusRow => {
  const error = off ? null : health?.last_error ?? null
  const state: HealthState = off ? 'off' : error === null ? 'ok' : 'failing'

  return {
    kind,
    id,
    name,
    state,
    last_checked_at: health?.last_checked_at ?? null,
    last_success_at: health?.last_success_at ?? null,
    last_error: error,
    failing_since: off || error === null ? null : health?.failing_since ?? null,
    detail,
  }
}

// The connection's subject ID is the user's ID (TRD §3.2)
const gmailConnectionRow = (
  userId: string,
  health: HealthRecord | undefined,
): StatusRow => {
  const subject: Subject = { kind: 'gmail_connection', id: userId, name: 'Gmail connection' }
  const account = findAccount( userId )

  if( config.gmail === null || account === undefined ) {
    return toRow( subject, health, true )
  }

  // The account's own status counts even when no check was recorded.
  if( account.status === 'reconnect_needed' ) {
    const failing = toRow( subject, health, false )
    const error = health?.last_error ?? account.error ?? 'Gmail needs reconnecting'

    return {
      ...failing,
      state: 'failing',
      last_error: error,
      failing_since: health?.failing_since ?? health?.last_checked_at ?? null,
    }
  }

  return toRow( subject, health, false )
}

// The app's own services (agent, whisper-server, backups) show only to the admin (ADR 0065)
export const getStatus = ( userId: string, isAdmin: boolean ): GetStatusResponse => {
  const health = new Map< string, HealthRecord >(
    listHealth( userId, isAdmin )
      .map( ( record ) => [ `${ record.kind }:${ record.subject_id }`, record ] ),
  )
  const find = ( kind: HealthKind, id: string ): HealthRecord | undefined => {
    return health.get( `${ kind }:${ id }` )
  }

  const appRows: StatusRow[] = [
    toRow(
      { kind: 'agent', id: SINGLETON_ID, name: 'Agent service' },
      find( 'agent', SINGLETON_ID ),
      config.agent === null,
    ),
    toRow(
      { kind: 'whisper', id: SINGLETON_ID, name: 'whisper-server' },
      find( 'whisper', SINGLETON_ID ),
      false,
    ),
    toRow(
      { kind: 'backup', id: SINGLETON_ID, name: 'Backups' },
      find( 'backup', SINGLETON_ID ),
      false,
      describeBackup( find( 'backup', SINGLETON_ID )?.detail ?? null ),
    ),
  ]
  const rows: StatusRow[] = [
    ...isAdmin ? appRows : [],
    gmailConnectionRow( userId, find( 'gmail_connection', userId ) ),
    ...listSources( userId )
      .map( ( { id, name, enabled } ) => {
        return toRow( { kind: 'gmail_source', id, name }, find( 'gmail_source', id ), !enabled )
      } )
      .sort( byName ),
    ...listFeeds( userId )
      .map( ( { id, name, enabled } ) => {
        return toRow( { kind: 'feed', id, name }, find( 'feed', id ), !enabled )
      } )
      .sort( byName ),
  ]

  return {
    rows,
    failing_count: rows.filter( ( { state } ) => state === 'failing' ).length,
  }
}

// Only the admin's refresh runs the app's checks; a member's just reads their own rows
export const refreshStatus = async (
  userId: string,
  isAdmin: boolean,
): Promise< GetStatusResponse > => {
  if( isAdmin ) {
    await runServiceChecks()
  }

  return getStatus( userId, isAdmin )
}

const subjectExists = ( userId: string, kind: HealthKind, id: string ): boolean => {
  if( kind === 'feed' ) {
    return findFeedById( userId, id )?.deleted_at === null
  }

  if( kind === 'gmail_source' ) {
    return findSourceById( userId, id )?.deleted_at === null
  }

  if( kind === 'gmail_connection' ) {
    return id === userId
  }

  return id === SINGLETON_ID
}

export const getHealthErrors = (
  userId: string,
  isAdmin: boolean,
  kind: HealthKind,
  id: string,
): HealthError[] => {
  const isApp = AppHealthKind.safeParse( kind ).success

  if( ( isApp && !isAdmin ) || !subjectExists( userId, kind, id ) ) {
    throw new NotFoundError( 'Status subject not found' )
  }

  return listErrors( isApp ? null : userId, kind, id )
}
