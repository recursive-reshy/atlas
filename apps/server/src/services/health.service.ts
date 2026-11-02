// Shared
import { HealthKind } from '@atlas/shared'
// Clients
import { checkHealth } from '../clients/agent.client.js'
import { fetchReplicationMetrics } from '../clients/litestreamMetrics.client.js'
import type { ReplicationMetrics } from '../clients/litestreamMetrics.client.js'
import { checkTranscriptionModel } from '../clients/openaiTranscription.client.js'
// Config
import { config } from '../config.js'
// Logging
import { logger } from '../logger.js'
// Repositories
import { recordFailure, recordSuccess } from '../repositories/health.repository.js'
import { deleteHealthExcept } from '../repositories/system.repository.js'
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

    recordCheck(
      null,
      subject,
      status === 'ok' ? { ok: true } : { ok: false, message: 'The agent service is not reachable' },
    )
  } catch( error ) {
    recordCheck( null, subject, { ok: false, message: errorMessage( error ) } )
  }
}

const checkTranscription = async (): Promise< void > => {
  const subject: HealthSubject = { kind: 'transcription', id: 'default' }

  try {
    await checkTranscriptionModel( {
      baseUrl: config.openaiBaseUrl,
      apiKey: config.openaiApiKey,
      model: config.transcriptionModel,
    } )
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

// The agent is checked whenever it is configured; its row reads as off while it is not.
export const runServiceChecks = async (): Promise< void > => {
  const checks = [ checkTranscription() ]

  if( config.agent !== null ) {
    checks.push( checkAgent() )
  }

  if( config.litestreamMetricsUrl !== null ) {
    checks.push( checkReplication( config.litestreamMetricsUrl ) )
  }

  await Promise.all( checks )
}

// Checks that run only where configured; their rows are dropped at start where they are not.
export const pruneHealth = (): void => {
  const kept = HealthKind.options.filter( ( kind ) => {
    return kind === 'replication' ? config.litestreamMetricsUrl !== null : kind !== 'vault_sync'
  } )

  deleteHealthExcept( kept )
}
