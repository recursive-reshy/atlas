// Packages
import { z } from 'zod'
// Lifecycle
import { statusesWhere } from '../jobs/lifecycle.js'
// Repositories
import { getDatabase, inTransaction } from './database.js'
import { SELECT_FEED, toOwnedFeed } from './feedRows.js'
import type { OwnedFeed } from './feedRows.js'
import { SELECT_SOURCE, toOwnedSource } from './gmailSourceRows.js'
import type { OwnedGmailSource } from './gmailSourceRows.js'
import {
  SELECT_JOB,
  SELECT_JOB_LIST,
  marks,
  toListedOwnedJob,
  toOwnedJob,
} from './jobRows.js'
import type { OwnedJob } from './jobRows.js'
import { HealthRecord } from './health.repository.js'
import { NoteRecord } from './meleteNotes.repository.js'

// The only queries without a user (ADR 0062): the loops that serve every user. Each row says
// whose it is. Work for the loops that run on someone's behalf is only for eligible users
// (ADR 0064): active, with the module on (the admin always), and for vault work a chosen vault.
const eligible = ( ownerColumn: string, module: 'transcriber' | 'melete' ): string => {
  return `JOIN eligible_users ON eligible_users.user_id = ${ ownerColumn }
    AND eligible_users.module = '${ module }'`
}

// Round-robin: the eligible user whose last start was longest ago goes next, users who never
// started first, then the one who joined first. It picks and stamps; the job itself keeps its
// status, because the source adapter makes the first move.
export const claimNextJob = ( now: string ): OwnedJob | undefined => {
  const statuses = statusesWhere( 'runnable' )

  return inTransaction( () => {
    const row = getDatabase()
      .prepare( `${ SELECT_JOB }
        ${ eligible( 'jobs.user_id', 'transcriber' ) }
        JOIN users ON users.id = jobs.user_id
        WHERE jobs.status IN ( ${ marks( statuses ) } )
        ORDER BY users.last_job_started_at IS NOT NULL, users.last_job_started_at,
          users.created_at, jobs.rowid
        LIMIT 1` )
      .get( ...statuses )

    if( row === undefined ) {
      return undefined
    }

    const job = toOwnedJob( row )

    getDatabase().prepare( 'UPDATE users SET last_job_started_at = ? WHERE id = ?' )
      .run( now, job.user_id )

    return job
  } )
}

export const markInterruptedJobs = ( message: string, now: string ): number => {
  const statuses = statusesWhere( 'onRestart', 'failed' )
  const { changes } = getDatabase()
    .prepare( `UPDATE jobs SET status = 'failed', error = ?, updated_at = ?
      WHERE status IN ( ${ marks( statuses ) } )` )
    .run( message, now, ...statuses )

  return changes
}

export const markInterruptedLinkingJobs = (
  message: string,
  now: string,
  expiresAt: string,
): number => {
  const statuses = statusesWhere( 'onRestart', 'ready_for_review' )
  const { changes } = getDatabase()
    .prepare( `UPDATE jobs SET status = 'ready_for_review', link_state = 'failed',
        link_error = ?, expires_at = ?, updated_at = ?
      WHERE status IN ( ${ marks( statuses ) } )` )
    .run( message, expiresAt, now, ...statuses )

  return changes
}

// Expiry runs for everyone: a removed user's or a module-off user's drafts still expire
export const listExpiredJobs = ( now: string ): OwnedJob[] => {
  const statuses = statusesWhere( 'expires' )

  return getDatabase()
    .prepare( `${ SELECT_JOB_LIST }
      WHERE jobs.status IN ( ${ marks( statuses ) } )
        AND jobs.expires_at IS NOT NULL AND jobs.expires_at <= ?` )
    .all( ...statuses, now )
    .map( toListedOwnedJob )
}

const cutoffFor = ( now: string, intervalMinutes: number ): string => {
  return new Date( new Date( now ).getTime() - intervalMinutes * 60_000 ).toISOString()
}

export const listDueFeeds = ( now: string, intervalMinutes: number ): OwnedFeed[] => {
  return getDatabase()
    .prepare( `${ SELECT_FEED }
      ${ eligible( 'feeds.user_id', 'transcriber' ) }
      WHERE feeds.enabled = 1 AND feeds.deleted_at IS NULL
        AND ( h.last_checked_at IS NULL OR h.last_checked_at <= ? )
      ORDER BY h.last_checked_at IS NOT NULL, h.last_checked_at, feeds.rowid` )
    .all( cutoffFor( now, intervalMinutes ) )
    .map( toOwnedFeed )
}

// Only sources whose owner has a connected Gmail account; the others wait until they reconnect
export const listDueGmailSources = (
  now: string,
  intervalMinutes: number,
): OwnedGmailSource[] => {
  return getDatabase()
    .prepare( `${ SELECT_SOURCE }
      JOIN gmail_account ON gmail_account.user_id = gmail_sources.user_id
        AND gmail_account.status = 'connected'
      ${ eligible( 'gmail_sources.user_id', 'transcriber' ) }
      WHERE gmail_sources.enabled = 1 AND gmail_sources.deleted_at IS NULL
        AND ( h.last_checked_at IS NULL OR h.last_checked_at <= ? )
      ORDER BY h.last_checked_at IS NOT NULL, h.last_checked_at, gmail_sources.rowid` )
    .all( cutoffFor( now, intervalMinutes ) )
    .map( toOwnedSource )
}

// A queued note with its owner, for the generator that serves every user
const OwnedNote = NoteRecord.extend( { user_id: z.string() } )
export type OwnedNote = z.infer< typeof OwnedNote >

// Same turns as jobs, by `last_generation_started_at`; only for users with a vault, since a
// scan and the questions come from their notes
export const claimNextGeneration = ( now: string ): OwnedNote | undefined => {
  return inTransaction( () => {
    const next = getDatabase()
      .prepare( `SELECT melete_notes.id FROM melete_notes
        ${ eligible( 'melete_notes.user_id', 'melete' ) }
          AND eligible_users.vault_dir IS NOT NULL
        JOIN users ON users.id = melete_notes.user_id
        WHERE melete_notes.generation = 'queued'
        ORDER BY users.last_generation_started_at IS NOT NULL, users.last_generation_started_at,
          users.created_at, melete_notes.enrolled_at, melete_notes.rowid
        LIMIT 1` )
      .get()

    if( next === undefined ) {
      return undefined
    }

    const row = getDatabase()
      .prepare( 'UPDATE melete_notes SET generation = \'generating\' WHERE id = ? RETURNING *' )
      .get( z.object( { id: z.string() } ).parse( next ).id )
    const note = OwnedNote.parse( row )

    getDatabase().prepare( 'UPDATE users SET last_generation_started_at = ? WHERE id = ?' )
      .run( now, note.user_id )

    return note
  } )
}

// A subject whose syllabus is being drafted, with its owner. `drafting` is both the queue and the
// work in progress, so a restart needs no recovery, and the loop passes the ids it has already
// tried this pass, so a subject that stays `drafting` is not taken again in a tight loop.
const OwnedSubject = z.object( { id: z.string(), user_id: z.string() } )
export type OwnedSubject = z.infer< typeof OwnedSubject >

// Same users and turns as `claimNextGeneration`. A note still waiting for or making its questions
// is not mapped yet: Generate maps it when it finishes
export const claimNextMapping = ( now: string ): OwnedNote | undefined => {
  return inTransaction( () => {
    const next = getDatabase()
      .prepare( `SELECT melete_notes.id FROM melete_notes
        ${ eligible( 'melete_notes.user_id', 'melete' ) }
          AND eligible_users.vault_dir IS NOT NULL
        JOIN users ON users.id = melete_notes.user_id
        WHERE melete_notes.mapping = 'queued' AND melete_notes.generation = 'idle'
        ORDER BY users.last_generation_started_at IS NOT NULL, users.last_generation_started_at,
          users.created_at, melete_notes.enrolled_at, melete_notes.rowid
        LIMIT 1` )
      .get()

    if( next === undefined ) {
      return undefined
    }

    const row = getDatabase()
      .prepare( 'UPDATE melete_notes SET mapping = \'mapping\' WHERE id = ? RETURNING *' )
      .get( z.object( { id: z.string() } ).parse( next ).id )
    const note = OwnedNote.parse( row )

    getDatabase().prepare( 'UPDATE users SET last_generation_started_at = ? WHERE id = ?' )
      .run( now, note.user_id )

    return note
  } )
}

// Same users and turns as `claimNextGeneration`, so a draft counts as that user's turn
export const claimNextDraft = ( now: string, tried: string[] ): OwnedSubject | undefined => {
  return inTransaction( () => {
    const next = getDatabase()
      .prepare( `SELECT melete_subjects.id, melete_subjects.user_id FROM melete_subjects
        ${ eligible( 'melete_subjects.user_id', 'melete' ) }
          AND eligible_users.vault_dir IS NOT NULL
        JOIN users ON users.id = melete_subjects.user_id
        WHERE melete_subjects.syllabus_status = 'drafting'
          AND melete_subjects.id NOT IN ( SELECT value FROM json_each( ? ) )
        ORDER BY users.last_generation_started_at IS NOT NULL, users.last_generation_started_at,
          users.created_at, melete_subjects.rowid
        LIMIT 1` )
      .get( JSON.stringify( tried ) )

    if( next === undefined ) {
      return undefined
    }

    const subject = OwnedSubject.parse( next )

    getDatabase().prepare( 'UPDATE users SET last_generation_started_at = ? WHERE id = ?' )
      .run( now, subject.user_id )

    return subject
  } )
}

export const requeueGenerating = (): number => {
  return getDatabase()
    .prepare( 'UPDATE melete_notes SET generation = \'queued\' WHERE generation = \'generating\'' )
    .run().changes
}

export const requeueMapping = (): number => {
  return getDatabase()
    .prepare( 'UPDATE melete_notes SET mapping = \'queued\' WHERE mapping = \'mapping\'' )
    .run().changes
}

export type UsageRange = { from: string, to: string } | null

const UsageRow = z.object( {
  user_id: z.string(),
  category: z.enum( [ 'summary', 'linking', 'melete', 'extraction', 'transcription' ] ),
  input_tokens: z.number(),
  output_tokens: z.number(),
  cost_usd: z.number().nullable(),
  runs: z.number(),
} )
export type UsageRow = z.infer< typeof UsageRow >

// Admin usage (ADR 0067): counts and sums across every user, never content. A null range is all
// time; `to` is exclusive. `cost_usd` stays null while no run in the bucket has a cost.
export const usageTotals = ( range: UsageRange ): UsageRow[] => {
  return getDatabase()
    .prepare( `SELECT user_id, category,
        COALESCE( SUM( input_tokens ), 0 ) AS input_tokens,
        COALESCE( SUM( output_tokens ), 0 ) AS output_tokens,
        SUM( cost_usd ) AS cost_usd,
        COUNT(*) AS runs
      FROM usage_events
      WHERE ( @from IS NULL OR created_at >= @from ) AND ( @to IS NULL OR created_at < @to )
      GROUP BY user_id, category` )
    .all( { from: range?.from ?? null, to: range?.to ?? null } )
    .map( ( row ) => UsageRow.parse( row ) )
}

// Seconds of audio sent for transcription, from the length each video job kept (ADR 0069)
export const transcriptionSeconds = ( range: UsageRange ): Map< string, number > => {
  const rows = getDatabase()
    .prepare( `SELECT user_id, SUM( duration_seconds ) AS seconds
      FROM jobs
      WHERE duration_seconds IS NOT NULL
        AND ( @from IS NULL OR created_at >= @from ) AND ( @to IS NULL OR created_at < @to )
      GROUP BY user_id` )
    .all( { from: range?.from ?? null, to: range?.to ?? null } )

  return new Map( rows.map( ( row ) => {
    const { user_id, seconds } = z.object( { user_id: z.string(), seconds: z.number() } )
      .parse( row )

    return [ user_id, seconds ]
  } ) )
}

// Rows of checks that are no longer run or no longer configured (whisper-server, backups, a VM's
// replication on the Mac), for every user, so a stale row is never shown or counted (ADR 0050).
export const deleteHealthExcept = ( kinds: readonly string[] ): void => {
  inTransaction( () => {
    const keep = marks( [ ...kinds ] )

    for( const table of [ 'health_status', 'health_errors' ] ) {
      getDatabase().prepare( `DELETE FROM ${ table } WHERE kind NOT IN ( ${ keep } )` )
        .run( ...kinds )
    }
  } )
}

// Every user's vault sync row, for the admin's Status panel; each row says whose it is.
export const listVaultSyncHealth = (): Array< { user_id: string, record: HealthRecord } > => {
  return getDatabase()
    .prepare( 'SELECT * FROM health_status WHERE kind = ? AND user_id IS NOT NULL' )
    .all( 'vault_sync' )
    .map( ( row ) => ( {
      user_id: z.object( { user_id: z.string() } ).parse( row ).user_id,
      record: HealthRecord.parse( row ),
    } ) )
}
