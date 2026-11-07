// Packages
import { z } from 'zod'
// Shared
import { MeleteSyllabusStatus, MeleteTargetLevel } from '@atlas/shared'
// Repositories
import { getDatabase } from './database.js'

const Flag = z.int().transform( ( value ) => value === 1 )

export const SubjectRecord = z.object( {
  id: z.string(),
  folder: z.string(),
  auto_enroll: Flag,
  new_per_day: z.int(),
  target_level: MeleteTargetLevel.nullable(),
  intent: z.string().nullable(),
  syllabus_status: MeleteSyllabusStatus,
  syllabus_error: z.string().nullable(),
  goal_id: z.string().nullable(),
  created_at: z.string(),
} )
export type SubjectRecord = z.infer< typeof SubjectRecord >

export type SubjectChanges = {
  auto_enroll?: boolean
  new_per_day?: number
  target_level?: MeleteTargetLevel
  intent?: string | null
  syllabus_status?: MeleteSyllabusStatus
  syllabus_error?: string | null
  goal_id?: string | null
}

export const findSubject = ( userId: string, id: string ): SubjectRecord | undefined => {
  const row = getDatabase()
    .prepare( 'SELECT * FROM melete_subjects WHERE id = ? AND user_id = ?' )
    .get( id, userId )

  return row === undefined ? undefined : SubjectRecord.parse( row )
}

export const listSubjects = ( userId: string ): SubjectRecord[] => {
  return z.array( SubjectRecord ).parse( getDatabase()
    .prepare( `SELECT * FROM melete_subjects WHERE user_id = ?
      ORDER BY lower( folder ), folder` )
    .all( userId ) )
}

export const upsertSubject = ( userId: string, folder: string ): SubjectRecord => {
  const db = getDatabase()

  return db.transaction( () => {
    db.prepare( `INSERT INTO melete_subjects ( id, user_id, folder, created_at )
      VALUES ( ?, ?, ?, ? ) ON CONFLICT ( user_id, folder ) DO NOTHING` )
      .run( crypto.randomUUID(), userId, folder, new Date().toISOString() )

    return SubjectRecord.parse(
      db.prepare( 'SELECT * FROM melete_subjects WHERE user_id = ? AND folder = ?' )
        .get( userId, folder ),
    )
  } )()
}

export const updateSubject = (
  userId: string,
  id: string,
  changes: SubjectChanges,
): SubjectRecord | undefined => {
  const db = getDatabase()

  if( changes.auto_enroll !== undefined ) {
    db.prepare( 'UPDATE melete_subjects SET auto_enroll = ? WHERE id = ? AND user_id = ?' )
      .run( changes.auto_enroll ? 1 : 0, id, userId )
  }

  if( changes.new_per_day !== undefined ) {
    db.prepare( 'UPDATE melete_subjects SET new_per_day = ? WHERE id = ? AND user_id = ?' )
      .run( changes.new_per_day, id, userId )
  }

  const syllabus = {
    target_level: changes.target_level,
    intent: changes.intent,
    syllabus_status: changes.syllabus_status,
    syllabus_error: changes.syllabus_error,
    goal_id: changes.goal_id,
  }

  for( const [ column, value ] of Object.entries( syllabus ) ) {
    if( value !== undefined ) {
      db.prepare( `UPDATE melete_subjects SET ${ column } = ? WHERE id = ? AND user_id = ?` )
        .run( value, id, userId )
    }
  }

  return findSubject( userId, id )
}

export const listSubjectsForGoal = ( userId: string, goalId: string ): SubjectRecord[] => {
  return z.array( SubjectRecord ).parse( getDatabase()
    .prepare( `SELECT * FROM melete_subjects WHERE user_id = ? AND goal_id = ?
      ORDER BY lower( folder ), folder` )
    .all( userId, goalId ) )
}

// The goal's subjects become exactly these; a subject moves over from any other goal. Ids that
// are not the user's change nothing.
export const setSubjectsForGoal = (
  userId: string,
  goalId: string,
  subjectIds: string[],
): void => {
  const db = getDatabase()

  db.transaction( () => {
    db.prepare( 'UPDATE melete_subjects SET goal_id = NULL WHERE user_id = ? AND goal_id = ?' )
      .run( userId, goalId )

    const link = db.prepare(
      'UPDATE melete_subjects SET goal_id = ? WHERE id = ? AND user_id = ?',
    )

    for( const id of subjectIds ) {
      link.run( goalId, id, userId )
    }
  } )()
}
