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

export const TimeEntryRecord = z.object( {
  id: z.string(),
  source: z.enum( [ 'measured', 'logged' ] ),
  subject_id: z.string().nullable(),
  goal_id: z.string().nullable(),
  day: z.string(),
  seconds: z.int(),
  note: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
} )
export type TimeEntryRecord = z.infer< typeof TimeEntryRecord >

const ENTRY_COLUMNS = 'id, source, subject_id, goal_id, day, seconds, note, created_at, updated_at'

export type NewLoggedEntry = {
  subject_id: string | null
  goal_id: string | null
  day: string
  seconds: number
  note: string | null
}

export const findTimeEntry = ( userId: string, id: string ): TimeEntryRecord | undefined => {
  const row = getDatabase()
    .prepare( `SELECT ${ ENTRY_COLUMNS } FROM time_entries WHERE id = ? AND user_id = ?` )
    .get( id, userId )

  return row === undefined ? undefined : TimeEntryRecord.parse( row )
}

export const insertLoggedEntry = ( userId: string, entry: NewLoggedEntry ): TimeEntryRecord => {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  getDatabase()
    .prepare( `INSERT INTO time_entries (
        id, user_id, source, subject_id, goal_id, day, seconds, note, created_at, updated_at
      ) VALUES (
        @id, @user_id, 'logged', @subject_id, @goal_id, @day, @seconds, @note, @now, @now
      )` )
    .run( { ...entry, id, user_id: userId, now } )

  return TimeEntryRecord.parse( findTimeEntry( userId, id ) )
}

// Only a logged entry can be edited; a measured one is left as the answers made it
export const updateLoggedEntry = (
  userId: string,
  id: string,
  changes: { day?: string, seconds?: number, note?: string | null },
): TimeEntryRecord | undefined => {
  const db = getDatabase()
  const columns = ( [ 'day', 'seconds', 'note' ] as const )
    .filter( ( column ) => changes[ column ] !== undefined )

  if( columns.length > 0 ) {
    db.prepare( `UPDATE time_entries
      SET ${ columns.map( ( column ) => `${ column } = @${ column }` ).join( ', ' ) },
        updated_at = @now
      WHERE id = @id AND user_id = @user_id AND source = 'logged'` )
      .run( { ...changes, id, user_id: userId, now: new Date().toISOString() } )
  }

  const entry = findTimeEntry( userId, id )

  return entry?.source === 'logged' ? entry : undefined
}

export const deleteLoggedEntry = ( userId: string, id: string ): boolean => {
  const { changes } = getDatabase()
    .prepare( 'DELETE FROM time_entries WHERE id = ? AND user_id = ? AND source = \'logged\'' )
    .run( id, userId )

  return changes > 0
}

// Newest day first
export const listTimeEntries = (
  userId: string,
  from: string,
  to: string,
): TimeEntryRecord[] => {
  return z.array( TimeEntryRecord ).parse( getDatabase()
    .prepare( `SELECT ${ ENTRY_COLUMNS } FROM time_entries
      WHERE user_id = ? AND day BETWEEN ? AND ? ORDER BY day DESC, created_at DESC, id` )
    .all( userId, from, to ) )
}

export type TimeSplit = { measured: number, logged: number }

const GoalSeconds = z.object( {
  goal_id: z.string(),
  source: z.enum( [ 'measured', 'logged' ] ),
  seconds: z.number(),
} )

// A goal's time is what was logged against it plus everything on the subjects linked to it now,
// so relinking a subject moves its past time (ADR 0092). One query for every goal.
export const timeByGoal = (
  userId: string,
  from: string,
  to: string,
): Record< string, TimeSplit > => {
  const rows = z.array( GoalSeconds ).parse( getDatabase()
    .prepare( `SELECT COALESCE( t.goal_id, s.goal_id ) AS goal_id, t.source AS source,
        SUM( t.seconds ) AS seconds
      FROM time_entries t LEFT JOIN melete_subjects s ON s.id = t.subject_id
      WHERE t.user_id = ? AND t.day BETWEEN ? AND ?
        AND COALESCE( t.goal_id, s.goal_id ) IS NOT NULL
      GROUP BY 1, 2` )
    .all( userId, from, to ) )
  const totals: Record< string, TimeSplit > = {}

  for( const { goal_id: goalId, source, seconds } of rows ) {
    const split = totals[ goalId ] ?? { measured: 0, logged: 0 }

    split[ source ] = seconds
    totals[ goalId ] = split
  }

  return totals
}

const DaySeconds = z.object( {
  day: z.string(),
  source: z.enum( [ 'measured', 'logged' ] ),
  seconds: z.number(),
} )
export type DaySeconds = z.infer< typeof DaySeconds >

// One goal's time per study day and source, for the weekly bars
export const goalTimeByDay = (
  userId: string,
  goalId: string,
  from: string,
  to: string,
): DaySeconds[] => {
  return z.array( DaySeconds ).parse( getDatabase()
    .prepare( `SELECT t.day AS day, t.source AS source, SUM( t.seconds ) AS seconds
      FROM time_entries t LEFT JOIN melete_subjects s ON s.id = t.subject_id
      WHERE t.user_id = ? AND t.day BETWEEN ? AND ? AND COALESCE( t.goal_id, s.goal_id ) = ?
      GROUP BY t.day, t.source ORDER BY t.day, t.source` )
    .all( userId, from, to, goalId ) )
}
