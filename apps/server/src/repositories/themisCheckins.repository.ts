// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

export const CheckinRecord = z.object( {
  id: z.int(),
  period_start: z.string(),
  rating: z.int(),
  note: z.string().nullable(),
  created_at: z.string(),
} )
export type CheckinRecord = z.infer< typeof CheckinRecord >

export type NewCheckin = { period_start: string, rating: number, note?: string }

// A second check-in for the same goal and period throws on the table's unique key
export const insertCheckin = (
  userId: string,
  goalId: string,
  checkin: NewCheckin,
): CheckinRecord => {
  const { lastInsertRowid } = getDatabase()
    .prepare( `INSERT INTO themis_checkins
      ( user_id, goal_id, period_start, rating, note, created_at )
      VALUES ( @user_id, @goal_id, @period_start, @rating, @note, @created_at )` )
    .run( {
      note: null,
      ...checkin,
      user_id: userId,
      goal_id: goalId,
      created_at: new Date().toISOString(),
    } )

  return CheckinRecord.parse( getDatabase()
    .prepare( `SELECT id, period_start, rating, note, created_at FROM themis_checkins
      WHERE id = ?` )
    .get( lastInsertRowid ) )
}

// Latest period first; `limit` keeps only the most recent
export const listCheckins = (
  userId: string,
  goalId: string,
  limit = -1,
): CheckinRecord[] => {
  return z.array( CheckinRecord ).parse( getDatabase()
    .prepare( `SELECT id, period_start, rating, note, created_at FROM themis_checkins
      WHERE user_id = ? AND goal_id = ? ORDER BY period_start DESC LIMIT ?` )
    .all( userId, goalId, limit ) )
}

export const listPeriodStarts = ( userId: string, goalId: string ): string[] => {
  return z.array( z.string() ).parse( getDatabase()
    .prepare( 'SELECT period_start FROM themis_checkins WHERE user_id = ? AND goal_id = ?' )
    .all( userId, goalId )
    .map( ( row ) => ( row as { period_start: string } ).period_start ) )
}
