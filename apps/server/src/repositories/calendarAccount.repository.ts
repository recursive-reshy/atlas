// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

export const StoredCalendarAccount = z.object( {
  email: z.string(),
  refresh_token_enc: z.string(),
  scope: z.string(),
  status: z.enum( [ 'connected', 'broken' ] ),
  error: z.string().nullable(),
  connected_at: z.string(),
  calendar_id: z.string().nullable(),
  calendar_name: z.string().nullable(),
  import_from: z.string().nullable(),
  last_synced_at: z.string().nullable(),
} )
export type StoredCalendarAccount = z.infer< typeof StoredCalendarAccount >

// What a consent writes; the chosen calendar and the sync stamp are not part of it
export type NewCalendarAccount = Pick<
  StoredCalendarAccount,
  'email' | 'refresh_token_enc' | 'scope' | 'status' | 'error' | 'connected_at'
>

export const findCalendarAccount = ( userId: string ): StoredCalendarAccount | undefined => {
  const row = getDatabase()
    .prepare( `SELECT email, refresh_token_enc, scope, status, error, connected_at,
        calendar_id, calendar_name, import_from, last_synced_at
      FROM calendar_account WHERE user_id = ?` )
    .get( userId )

  return row === undefined ? undefined : StoredCalendarAccount.parse( row )
}

// Reconnecting replaces the token and keeps the calendar the person chose
export const saveCalendarAccount = ( userId: string, account: NewCalendarAccount ): void => {
  getDatabase().prepare( `INSERT INTO calendar_account (
      user_id, email, refresh_token_enc, scope, status, error, connected_at
    ) VALUES (
      @user_id, @email, @refresh_token_enc, @scope, @status, @error, @connected_at
    ) ON CONFLICT ( user_id ) DO UPDATE SET
      email = excluded.email,
      refresh_token_enc = excluded.refresh_token_enc,
      scope = excluded.scope,
      status = excluded.status,
      error = excluded.error,
      connected_at = excluded.connected_at` ).run( { ...account, user_id: userId } )
}

export const setCalendarStatus = (
  userId: string,
  status: StoredCalendarAccount[ 'status' ],
  error: string | null,
): void => {
  getDatabase()
    .prepare( 'UPDATE calendar_account SET status = ?, error = ? WHERE user_id = ?' )
    .run( status, error, userId )
}

// A new calendar starts from a clean sync stamp, so the next sync always reads
export const selectCalendar = (
  userId: string,
  { id, name }: { id: string, name: string },
  importFrom: string,
): void => {
  getDatabase().prepare( `UPDATE calendar_account
    SET calendar_id = ?, calendar_name = ?, import_from = ?, last_synced_at = NULL
    WHERE user_id = ?` ).run( id, name, importFrom, userId )
}

export const markSynced = ( userId: string, at: string ): void => {
  getDatabase()
    .prepare( 'UPDATE calendar_account SET last_synced_at = ? WHERE user_id = ?' )
    .run( at, userId )
}

export const deleteCalendarAccount = ( userId: string ): void => {
  getDatabase().prepare( 'DELETE FROM calendar_account WHERE user_id = ?' ).run( userId )
}
