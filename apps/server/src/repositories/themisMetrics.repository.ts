// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

export const MetricUpdateRecord = z.object( {
  id: z.int(),
  value: z.number(),
  note: z.string().nullable(),
  at: z.string(),
} )
export type MetricUpdateRecord = z.infer< typeof MetricUpdateRecord >

export type NewMetricUpdate = { value: number, note?: string, at: string }

export const insertMetricUpdate = (
  userId: string,
  goalId: string,
  update: NewMetricUpdate,
): MetricUpdateRecord => {
  const { lastInsertRowid } = getDatabase()
    .prepare( `INSERT INTO themis_metric_updates ( user_id, goal_id, value, note, at )
      VALUES ( @user_id, @goal_id, @value, @note, @at )` )
    .run( { note: null, ...update, user_id: userId, goal_id: goalId } )

  return MetricUpdateRecord.parse( getDatabase()
    .prepare( 'SELECT id, value, note, at FROM themis_metric_updates WHERE id = ?' )
    .get( lastInsertRowid ) )
}

// Latest first; `limit` keeps only the most recent
export const listMetricUpdates = (
  userId: string,
  goalId: string,
  limit = -1,
): MetricUpdateRecord[] => {
  return z.array( MetricUpdateRecord ).parse( getDatabase()
    .prepare( `SELECT id, value, note, at FROM themis_metric_updates
      WHERE user_id = ? AND goal_id = ? ORDER BY at DESC, id DESC LIMIT ?` )
    .all( userId, goalId, limit ) )
}
