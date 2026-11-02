// Packages
import { z } from 'zod'
// Shared
import { HealthError, HealthKind } from '@atlas/shared'
// Repositories
import { getDatabase, inTransaction } from './database.js'

const KEPT_ERRORS = 5

export const HealthRecord = z.object( {
  kind: HealthKind,
  subject_id: z.string(),
  last_checked_at: z.string().nullable(),
  last_success_at: z.string().nullable(),
  last_error: z.string().nullable(),
  failing_since: z.string().nullable(),
  detail: z.string().nullable(),
} )
export type HealthRecord = z.infer< typeof HealthRecord >

// The owner is the user the subject belongs to, or null for the app's own services (agent,
// whisper-server, backups): the table's CHECK keeps the two apart (ADR 0065).

export const recordSuccess = (
  userId: string | null,
  kind: HealthKind,
  id: string,
  at: string,
  detail?: string,
): void => {
  getDatabase().prepare( `INSERT INTO health_status (
      user_id, kind, subject_id, last_checked_at, last_success_at, last_error, failing_since,
      detail
    ) VALUES ( @userId, @kind, @id, @at, @at, NULL, NULL, @detail )
    ON CONFLICT ( kind, subject_id ) DO UPDATE SET
      last_checked_at = excluded.last_checked_at,
      last_success_at = excluded.last_success_at,
      last_error = NULL,
      failing_since = NULL,
      detail = excluded.detail
    WHERE health_status.user_id IS excluded.user_id` )
    .run( { userId, kind, id, at, detail: detail ?? null } )
}

export const recordFailure = (
  userId: string | null,
  kind: HealthKind,
  id: string,
  at: string,
  message: string,
): void => {
  inTransaction( () => {
    const db = getDatabase()

    db.prepare( `INSERT INTO health_status (
        user_id, kind, subject_id, last_checked_at, last_error, failing_since
      ) VALUES ( @userId, @kind, @id, @at, @message, @at )
      ON CONFLICT ( kind, subject_id ) DO UPDATE SET
        last_checked_at = excluded.last_checked_at,
        last_error = excluded.last_error,
        failing_since = COALESCE( health_status.failing_since, excluded.failing_since )
      WHERE health_status.user_id IS excluded.user_id` )
      .run( { userId, kind, id, at, message } )

    db.prepare( `INSERT INTO health_errors ( user_id, kind, subject_id, at, message )
      VALUES ( ?, ?, ?, ?, ? )` ).run( userId, kind, id, at, message )

    db.prepare( `DELETE FROM health_errors WHERE user_id IS ? AND kind = ? AND subject_id = ?
      AND id NOT IN (
        SELECT id FROM health_errors WHERE user_id IS ? AND kind = ? AND subject_id = ?
        ORDER BY at DESC, id DESC LIMIT ?
      )` ).run( userId, kind, id, userId, kind, id, KEPT_ERRORS )
  } )
}

export const getHealth = (
  userId: string | null,
  kind: HealthKind,
  id: string,
): HealthRecord | undefined => {
  const row = getDatabase()
    .prepare( 'SELECT * FROM health_status WHERE user_id IS ? AND kind = ? AND subject_id = ?' )
    .get( userId, kind, id )

  return row === undefined ? undefined : HealthRecord.parse( row )
}

// The user's own rows, and the app's too when the caller may see them
export const listHealth = ( userId: string, includeApp: boolean ): HealthRecord[] => {
  return getDatabase()
    .prepare( 'SELECT * FROM health_status WHERE user_id = ? OR ( ? AND user_id IS NULL )' )
    .all( userId, includeApp ? 1 : 0 )
    .map( ( row ) => HealthRecord.parse( row ) )
}

export const listErrors = (
  userId: string | null,
  kind: HealthKind,
  id: string,
): HealthError[] => {
  return getDatabase()
    .prepare( `SELECT at, message FROM health_errors
      WHERE user_id IS ? AND kind = ? AND subject_id = ? ORDER BY at DESC, id DESC` )
    .all( userId, kind, id )
    .map( ( row ) => HealthError.parse( row ) )
}

export const deleteHealth = ( userId: string | null, kind: HealthKind, id: string ): void => {
  inTransaction( () => {
    const db = getDatabase()

    db.prepare( 'DELETE FROM health_status WHERE user_id IS ? AND kind = ? AND subject_id = ?' )
      .run( userId, kind, id )
    db.prepare( 'DELETE FROM health_errors WHERE user_id IS ? AND kind = ? AND subject_id = ?' )
      .run( userId, kind, id )
  } )
}
