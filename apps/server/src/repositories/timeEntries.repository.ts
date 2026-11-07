// Packages
import { z } from 'zod'
// Time
import type { OpenSession } from '../time/session.js'
// Repositories
import { getDatabase } from './database.js'

export type NewMeasuredEntry = {
  started_at: string
  ended_at: string
  day: string
  seconds: number
}

const OpenRow = z.object( {
  id: z.string(),
  started_at: z.string(),
  ended_at: z.string(),
  day: z.string(),
} )

// The measured session of the subject that ended last
export const latestMeasuredEntry = (
  userId: string,
  subjectId: string,
): OpenSession | undefined => {
  const row = getDatabase()
    .prepare( `SELECT id, started_at, ended_at, day FROM time_entries
      WHERE user_id = ? AND subject_id = ? AND source = 'measured'
      ORDER BY ended_at DESC LIMIT 1` )
    .get( userId, subjectId )

  return row === undefined ? undefined : OpenRow.parse( row )
}

export const insertMeasuredEntry = (
  userId: string,
  subjectId: string,
  entry: NewMeasuredEntry,
): string => {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  getDatabase()
    .prepare( `INSERT INTO time_entries (
        id, user_id, source, subject_id, day, started_at, ended_at, seconds, created_at,
        updated_at
      ) VALUES (
        @id, @user_id, 'measured', @subject_id, @day, @started_at, @ended_at, @seconds, @now,
        @now
      )` )
    .run( { ...entry, id, user_id: userId, subject_id: subjectId, now } )

  return id
}

export const extendMeasuredEntry = (
  userId: string,
  id: string,
  { ended_at: endedAt, seconds }: Pick< NewMeasuredEntry, 'ended_at' | 'seconds' >,
): void => {
  getDatabase()
    .prepare( `UPDATE time_entries SET ended_at = ?, seconds = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND source = 'measured'` )
    .run( endedAt, seconds, new Date().toISOString(), id, userId )
}

// A subject's measured and logged seconds on the study days from `from` to `to`, inclusive
export const sumSubjectSeconds = (
  userId: string,
  subjectId: string,
  from: string,
  to: string,
): number => {
  const row = getDatabase()
    .prepare( `SELECT COALESCE( SUM( seconds ), 0 ) AS seconds FROM time_entries
      WHERE user_id = ? AND subject_id = ? AND day BETWEEN ? AND ?` )
    .get( userId, subjectId, from, to ) as { seconds: number }

  return row.seconds
}
