// Node
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
// Shared
import { HealthKind, VaultSyncStatusFile } from '@atlas/shared'
// Clients
import { agentCredential, checkHealth } from '../clients/agent.client.js'
import { getAnthropic } from '../clients/anthropic.js'
import { fetchReplicationMetrics } from '../clients/litestreamMetrics.client.js'
import type { ReplicationMetrics } from '../clients/litestreamMetrics.client.js'
import { checkGeminiModel } from '../clients/gemini.client.js'
import { geminiOptions } from '../clients/geminiOptions.js'
// Config
import { config } from '../config.js'
// Logging
import { logger } from '../logger.js'
// Repositories
import { recordFailure, recordSuccess } from '../repositories/health.repository.js'
import { deleteHealthExcept } from '../repositories/system.repository.js'
import { listUsers } from '../repositories/users.repository.js'
// Services

export type HealthSubject = { kind: HealthKind, id: string }
export type CheckResult = { ok: true, detail?: string } | { ok: false, message: string }

// The owner is the user the subject belongs to, or null for the app's own services
export const recordCheck = (
  userId: string | null,
  { kind, id }: HealthSubject,
  result: CheckResult,
  at: string = new Date().toISOString(),
): void => {
  if( result.ok ) {
    recordSuccess( userId, kind, id, at, result.detail )

    return
  }

  recordFailure( userId, kind, id, at, result.message )
  logger.warn( { kind, subject_id: id }, 'Health check failed' )
}

const errorMessage = ( error: unknown ): string => {
  return error instanceof Error ? error.message : 'Unknown error'
}

const checkAgent = async (): Promise< void > => {
  const subject: HealthSubject = { kind: 'agent', id: 'default' }

  try {
    const status = await checkHealth( { fresh: true } )

    const credential = agentCredential()

    recordCheck(
      null,
      subject,
      status === 'ok'
        ? { ok: true, ...credential === null ? {} : { detail: JSON.stringify( { credential } ) } }
        : { ok: false, message: 'The agent service is not reachable' },
    )
  } catch( error ) {
    recordCheck( null, subject, { ok: false, message: errorMessage( error ) } )
  }
}

const CLAUDE_CHECK_TIMEOUT_MS = 10_000

// Only the error's class and status are kept: a credential exchange can fail with a message that
// quotes what was sent (ADR 0110).
const claudeFailure = ( error: unknown ): string => {
  if( !( error instanceof Error ) ) {
    return 'Unknown error'
  }

  const { status } = error as { status?: unknown }

  return typeof status === 'number' ? `${ error.name } (status ${ status })` : error.name
}

// Lists one model through the shared client, so a failing federation exchange shows here
const checkClaude = async (): Promise< void > => {
  const subject: HealthSubject = { kind: 'claude', id: 'default' }

  try {
    await getAnthropic().models.list(
      { limit: 1 },
      { timeout: CLAUDE_CHECK_TIMEOUT_MS, maxRetries: 0 },
    )
    recordCheck( null, subject, {
      ok: true,
      detail: JSON.stringify( { source: config.claudeAuth.kind } ),
    } )
  } catch( error ) {
    recordCheck( null, subject, { ok: false, message: claudeFailure( error ) } )
  }
}

const checkTranscription = async (): Promise< void > => {
  const subject: HealthSubject = { kind: 'transcription', id: 'default' }

  try {
    await checkGeminiModel( geminiOptions() )
    recordCheck( null, subject, { ok: true } )
  } catch( error ) {
    recordCheck( null, subject, { ok: false, message: errorMessage( error ) } )
  }
}

// Litestream's counters only mean something as a change, so the previous sample is kept in memory;
// the first sample after a start never fails. `lastSyncAt` is when the sync count was seen to rise.
type ReplicationSample = ReplicationMetrics & { lastSyncAt: string | null }

let previousReplication: ReplicationSample | null = null

export const resetReplicationCheck = (): void => {
  previousReplication = null
}

const plural = ( count: number ): string => `${ count } sync error${ count === 1 ? '' : 's' }`

const checkReplication = async ( url: string ): Promise< void > => {
  const subject: HealthSubject = { kind: 'replication', id: 'default' }

  try {
    const now = new Date().toISOString()
    const metrics = await fetchReplicationMetrics( url )
    const before = previousReplication
    // A counter below the last sample means Litestream restarted, not that errors went away
    const synced = before !== null && metrics.syncCount > before.syncCount
    const newErrors = before === null || metrics.syncErrors < before.syncErrors
      ? 0
      : metrics.syncErrors - before.syncErrors
    const lastSyncAt = synced ? now : before?.lastSyncAt ?? null

    previousReplication = { ...metrics, lastSyncAt }

    // Never failing only because the last sync is old (ADR 0076): a quiet database syncs rarely
    const failure = `Litestream reported ${ plural( newErrors ) } since the last check`

    recordCheck(
      null,
      subject,
      newErrors > 0
        ? { ok: false, message: failure }
        : {
          ok: true,
          ...lastSyncAt === null ? {} : { detail: JSON.stringify( { last_sync_at: lastSyncAt } ) },
        },
    )
  } catch( error ) {
    recordCheck( null, subject, { ok: false, message: errorMessage( error ) } )
  }
}

const parseJson = ( text: string ): unknown => {
  try {
    return JSON.parse( text ) as unknown
  } catch{
    return null
  }
}

const HEARTBEAT_STALE_MS = 5 * 60 * 1000

// Reads what the user's sync container wrote (ADR 0075). The file name is the user's vault folder,
// which the VaultDir rule limits to lower-case letters, digits and hyphens.
const vaultSyncResult = async ( directory: string, vaultDir: string ): Promise< CheckResult > => {
  const text = await readFile( join( directory, `${ vaultDir }.json` ), 'utf8' )
    .catch( () => null )

  if( text === null ) {
    return { ok: false, message: 'No sync status found for this vault' }
  }

  const parsed = VaultSyncStatusFile.safeParse( parseJson( text ) )

  if( !parsed.success ) {
    return { ok: false, message: 'The sync status file could not be read' }
  }

  const { state, heartbeat_at: heartbeatAt, last_error: lastError } = parsed.data

  if( state === 'failed' ) {
    return { ok: false, message: lastError ?? 'Sync has failed' }
  }

  if( Date.now() - Date.parse( heartbeatAt ) > HEARTBEAT_STALE_MS ) {
    return { ok: false, message: 'The sync container has stopped' }
  }

  return { ok: true }
}

const checkVaultSync = async ( directory: string ): Promise< void > => {
  const users = listUsers().filter( ( { status, vault_dir: vaultDir } ) => {
    return status === 'active' && vaultDir !== null
  } )

  await Promise.all( users.map( async ( { id, vault_dir: vaultDir } ) => {
    if( vaultDir !== null ) {
      const result = await vaultSyncResult( directory, vaultDir )

      recordCheck( id, { kind: 'vault_sync', id: vaultDir }, result )
    }
  } ) )
}

// The agent is checked whenever it is configured; its row reads as off while it is not.
export const runServiceChecks = async (): Promise< void > => {
  const checks = [ checkTranscription(), checkClaude() ]

  if( config.agent !== null ) {
    checks.push( checkAgent() )
  }

  if( config.litestreamMetricsUrl !== null ) {
    checks.push( checkReplication( config.litestreamMetricsUrl ) )
  }

  if( config.vaultSyncStatusDir !== null ) {
    checks.push( checkVaultSync( config.vaultSyncStatusDir ) )
  }

  await Promise.all( checks )
}

// Checks that run only where configured; their rows are dropped at start where they are not.
export const pruneHealth = (): void => {
  const kept = HealthKind.options.filter( ( kind ) => {
    if( kind === 'replication' ) {
      return config.litestreamMetricsUrl !== null
    }

    return kind === 'vault_sync' ? config.vaultSyncStatusDir !== null : true
  } )

  deleteHealthExcept( kept )
}
