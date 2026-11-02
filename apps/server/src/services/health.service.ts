// Shared
import type { HealthKind } from '@atlas/shared'
// Clients
import { checkHealth } from '../clients/agent.client.js'
import { checkWhisperHealth } from '../clients/whisperServer.client.js'
// Config
import { config } from '../config.js'
// Logging
import { logger } from '../logger.js'
// Repositories
import { recordFailure, recordSuccess } from '../repositories/health.repository.js'
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

const checkWhisper = async (): Promise< void > => {
  const subject: HealthSubject = { kind: 'whisper', id: 'default' }

  try {
    await checkWhisperHealth( config.whisperUrl )
    recordCheck( null, subject, { ok: true } )
  } catch( error ) {
    recordCheck( null, subject, { ok: false, message: errorMessage( error ) } )
  }
}

// The agent is checked whenever it is configured; its row reads as off while it is not.
export const runServiceChecks = async (): Promise< void > => {
  const checks = [ checkWhisper() ]

  if( config.agent !== null ) {
    checks.push( checkAgent() )
  }

  await Promise.all( checks )
}
