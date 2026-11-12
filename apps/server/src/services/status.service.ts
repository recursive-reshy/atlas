// Packages
import { z } from 'zod'
// Shared
import { AppHealthKind, ClaudeCredential } from '@atlas/shared'
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
import { findCalendarAccount } from '../repositories/calendarAccount.repository.js'
import { findAccount } from '../repositories/gmailAccount.repository.js'
import { findSourceById, listSources } from '../repositories/gmailSources.repository.js'
import { listErrors, listHealth } from '../repositories/health.repository.js'
import { listVaultSyncHealth } from '../repositories/system.repository.js'
import { findUserById, findUserByVaultDir, listUsers } from '../repositories/users.repository.js'
import type { HealthRecord } from '../repositories/health.repository.js'
// Services
import { runServiceChecks } from './health.service.js'

const SINGLETON_ID = 'default'

const byName = ( first: StatusRow, second: StatusRow ): number => {
  return first.name.localeCompare( second.name, undefined, { sensitivity: 'base' } )
}

const ReplicationDetail = z.object( { last_sync_at: z.iso.datetime() } )

// The check stores { last_sync_at } as JSON; the panel shows it as one line.
const describeReplication = ( detail: string | null ): string | null => {
  if( detail === null ) {
    return null
  }

  try {
    const { last_sync_at: lastSyncAt } = ReplicationDetail.parse( JSON.parse( detail ) )

    return `Last synced ${ lastSyncAt.slice( 0, 16 ).replace( 'T', ' ' ) } UTC`
  } catch{
    return detail
  }
}

const CREDENTIAL_LABELS: Record< ClaudeCredential, string > = {
  federation: 'federation',
  api_key: 'API key',
}

const AgentDetail = z.object( { credential: ClaudeCredential } )

// The agent check stores { credential } as JSON once the agent has said which it uses
const describeAgent = ( detail: string | null ): string | null => {
  if( detail === null ) {
    return null
  }

  try {
    const { credential } = AgentDetail.parse( JSON.parse( detail ) )

    return `Claude credential: ${ CREDENTIAL_LABELS[ credential ] }`
  } catch{
    return null
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

// A row only once Calendar is connected: the connection is a source of the user's own
const calendarConnectionRows = (
  userId: string,
  health: HealthRecord | undefined,
): StatusRow[] => {
  const account = findCalendarAccount( userId )

  if( account === undefined ) {
    return []
  }

  const subject: Subject = {
    kind: 'calendar_connection',
    id: userId,
    name: 'Calendar connection',
  }
  const row = toRow( subject, health, false )

  if( account.status !== 'broken' ) {
    return [ row ]
  }

  return [ {
    ...row,
    state: 'failing',
    last_error: health?.last_error ?? account.error ?? 'Calendar needs reconnecting',
    failing_since: health?.failing_since ?? health?.last_checked_at ?? null,
  } ]
}

const VAULT_SYNC_NAME = 'Vault sync'

// A member sees their own vault's sync; the admin sees every active user's, named (ADR 0075).
// The subject ID is the vault folder, which is unique to one user.
const vaultSyncRows = (
  userId: string,
  isAdmin: boolean,
  find: ( kind: HealthKind, id: string ) => HealthRecord | undefined,
): StatusRow[] => {
  if( config.vaultSyncStatusDir === null ) {
    return []
  }

  if( !isAdmin ) {
    const vaultDir = findUserById( userId )?.vault_dir ?? null

    if( vaultDir === null ) {
      return []
    }

    const subject: Subject = { kind: 'vault_sync', id: vaultDir, name: VAULT_SYNC_NAME }

    return [ toRow( subject, find( 'vault_sync', vaultDir ), false ) ]
  }

  const records = new Map(
    listVaultSyncHealth().map( ( { record } ) => [ record.subject_id, record ] ),
  )

  return listUsers()
    .flatMap( ( { status, name, vault_dir: vaultDir } ) => {
      return status === 'active' && vaultDir !== null
        ? [ toRow(
          { kind: 'vault_sync', id: vaultDir, name: `${ VAULT_SYNC_NAME }: ${ name }` },
          records.get( vaultDir ),
          false,
        ) ]
        : []
    } )
    .sort( byName )
}

// The app's own services (agent, transcription) show only to the admin (ADR 0065)
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
      describeAgent( find( 'agent', SINGLETON_ID )?.detail ?? null ),
    ),
    toRow(
      { kind: 'transcription', id: SINGLETON_ID, name: 'Transcription (Gemini)' },
      find( 'transcription', SINGLETON_ID ),
      false,
    ),
    toRow(
      {
        kind: 'claude',
        id: SINGLETON_ID,
        name: `Claude API (${ CREDENTIAL_LABELS[ config.claudeAuth.kind ] })`,
      },
      find( 'claude', SINGLETON_ID ),
      false,
      null,
    ),
  ]
  const replicationRows: StatusRow[] = config.litestreamMetricsUrl === null
    ? []
    : [
      toRow(
        { kind: 'replication', id: SINGLETON_ID, name: 'Replication (Litestream)' },
        find( 'replication', SINGLETON_ID ),
        false,
        describeReplication( find( 'replication', SINGLETON_ID )?.detail ?? null ),
      ),
    ]
  const rows: StatusRow[] = [
    ...isAdmin ? [ ...appRows, ...replicationRows ] : [],
    ...vaultSyncRows( userId, isAdmin, find ),
    gmailConnectionRow( userId, find( 'gmail_connection', userId ) ),
    ...calendarConnectionRows( userId, find( 'calendar_connection', userId ) ),
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

  if( kind === 'gmail_connection' || kind === 'calendar_connection' ) {
    return id === userId
  }

  return id === SINGLETON_ID
}

// A vault sync subject is its vault folder: a member may read their own, the admin any active
// user's. Returns the user it belongs to.
const vaultSyncOwner = ( userId: string, isAdmin: boolean, vaultDir: string ): string | null => {
  if( config.vaultSyncStatusDir === null ) {
    return null
  }

  const owner = isAdmin ? findUserByVaultDir( vaultDir ) : findUserById( userId )

  return owner?.vault_dir === vaultDir && owner.status === 'active' ? owner.id : null
}

export const getHealthErrors = (
  userId: string,
  isAdmin: boolean,
  kind: HealthKind,
  id: string,
): HealthError[] => {
  if( kind === 'vault_sync' ) {
    const owner = vaultSyncOwner( userId, isAdmin, id )

    if( owner === null ) {
      throw new NotFoundError( 'Status subject not found' )
    }

    return listErrors( owner, kind, id )
  }

  const isApp = AppHealthKind.safeParse( kind ).success

  if( ( isApp && !isAdmin ) || !subjectExists( userId, kind, id ) ) {
    throw new NotFoundError( 'Status subject not found' )
  }

  return listErrors( isApp ? null : userId, kind, id )
}
