// Packages
import { z } from 'zod'
// Shared
import { MeleteFsrsState, MeleteQuestionState } from '@atlas/shared'
// Repositories
import { getDatabase } from './database.js'

export const CardRow = z.object( {
  due: z.string().nullable(),
  stability: z.number(),
  difficulty: z.number(),
  scheduled_days: z.int(),
  learning_steps: z.int(),
  reps: z.int(),
  lapses: z.int(),
  fsrs_state: MeleteFsrsState,
  last_review: z.string().nullable(),
} )
export type CardRow = z.infer< typeof CardRow >

export const QuestionRecord = CardRow.extend( {
  id: z.string(),
  note_id: z.string(),
  position: z.int(),
  prompt: z.string(),
  answer: z.string(),
  passage: z.string(),
  body_hash: z.string(),
  state: MeleteQuestionState,
  run_id: z.int(),
  concept_id: z.string().nullable(),
  created_at: z.string(),
} )
export type QuestionRecord = z.infer< typeof QuestionRecord >

export const QueuedQuestion = QuestionRecord.extend( { subject_id: z.string() } )
export type QueuedQuestion = z.infer< typeof QueuedQuestion >

export type GeneratedQuestion = {
  prompt: string
  answer: string
  passage: string
  // Set only for an approved syllabus (ADR 0089)
  concept_id?: string | null
}

const SubjectCounts = z.object( {
  subject_id: z.string(),
  due: z.int(),
  new_available: z.int(),
} )
export type SubjectCounts = z.infer< typeof SubjectCounts >

const placeholders = ( values: readonly unknown[] ): string => values.map( () => '?' ).join( ', ' )

// What a question needs to appear in a review: active, in an enrolled note still in the vault
const REVIEWABLE = `FROM melete_questions q JOIN melete_notes n ON n.id = q.note_id
  WHERE q.user_id = ? AND q.state = 'active' AND n.enrolled = 1 AND n.missing_at IS NULL`

const QUEUED_COLUMNS = 'q.*, n.subject_id AS subject_id'

const parseQueued = ( rows: unknown[] ): QueuedQuestion[] => z.array( QueuedQuestion ).parse( rows )

export const findQuestion = ( userId: string, id: string ): QuestionRecord | undefined => {
  const row = getDatabase()
    .prepare( 'SELECT * FROM melete_questions WHERE id = ? AND user_id = ?' )
    .get( id, userId )

  return row === undefined ? undefined : QuestionRecord.parse( row )
}

export const insertQuestions = (
  userId: string,
  noteId: string,
  runId: number,
  bodyHash: string,
  questions: GeneratedQuestion[],
): QuestionRecord[] => {
  const db = getDatabase()

  return db.transaction( () => {
    const insert = db.prepare( `INSERT INTO melete_questions (
        id, user_id, note_id, position, prompt, answer, passage, body_hash, state, run_id,
        concept_id, created_at
      ) VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ? )` )
    const createdAt = new Date().toISOString()
    const ids = questions.map( ( question, index ) => {
      const id = crypto.randomUUID()

      insert.run(
        id,
        userId,
        noteId,
        index + 1,
        question.prompt,
        question.answer,
        question.passage,
        bodyHash,
        runId,
        question.concept_id ?? null,
        createdAt,
      )

      return id
    } )

    return ids.map( ( id ) => QuestionRecord.parse( findQuestion( userId, id ) ) )
  } )()
}

// Active and dropped, never retired: what the note page shows
export const listForNote = ( userId: string, noteId: string ): QuestionRecord[] => {
  return z.array( QuestionRecord ).parse( getDatabase()
    .prepare( `SELECT * FROM melete_questions
      WHERE user_id = ? AND note_id = ? AND state IN ( 'active', 'dropped' )
      ORDER BY position` )
    .all( userId, noteId ) )
}

export const setState = (
  userId: string,
  ids: string[],
  state: MeleteQuestionState,
): void => {
  if( ids.length === 0 ) {
    return
  }

  getDatabase()
    .prepare( `UPDATE melete_questions SET state = ?
      WHERE user_id = ? AND id IN ( ${ placeholders( ids ) } )` )
    .run( state, userId, ...ids )
}

export const retireActiveForNote = ( userId: string, noteId: string ): number => {
  return getDatabase()
    .prepare( `UPDATE melete_questions SET state = 'retired'
      WHERE user_id = ? AND note_id = ? AND state = 'active'` )
    .run( userId, noteId ).changes
}

export const saveCard = ( userId: string, id: string, card: CardRow ): void => {
  getDatabase()
    .prepare( `UPDATE melete_questions SET
        due = @due, stability = @stability, difficulty = @difficulty,
        scheduled_days = @scheduled_days, learning_steps = @learning_steps, reps = @reps,
        lapses = @lapses, fsrs_state = @fsrs_state, last_review = @last_review
      WHERE id = @id AND user_id = @user_id` )
    .run( { ...CardRow.parse( card ), id, user_id: userId } )
}

// A new question that was served but not rated has a due time too, so it comes back here
export const listDue = (
  userId: string,
  { subjectIds, now }: { subjectIds: string[], now: string },
): QueuedQuestion[] => {
  if( subjectIds.length === 0 ) {
    return []
  }

  return parseQueued( getDatabase()
    .prepare( `SELECT ${ QUEUED_COLUMNS } ${ REVIEWABLE }
      AND n.subject_id IN ( ${ placeholders( subjectIds ) } )
      AND q.due IS NOT NULL AND q.due <= ?
      ORDER BY CASE WHEN q.fsrs_state IN ( 'learning', 'relearning' ) THEN 0 ELSE 1 END,
        q.due, n.path, q.position` )
    .all( userId, ...subjectIds, now ) )
}

export const listNew = (
  userId: string,
  { subjectId, limit }: { subjectId: string, limit: number },
): QueuedQuestion[] => {
  return parseQueued( getDatabase()
    .prepare( `SELECT ${ QUEUED_COLUMNS } ${ REVIEWABLE }
      AND n.subject_id = ? AND q.fsrs_state = 'new' AND q.due IS NULL
      ORDER BY n.enrolled_at, n.path, q.position
      LIMIT ?` )
    .all( userId, subjectId, limit ) )
}

export const listLearningSoon = (
  userId: string,
  { subjectIds, until }: { subjectIds: string[], until: string },
): QueuedQuestion[] => {
  if( subjectIds.length === 0 ) {
    return []
  }

  return parseQueued( getDatabase()
    .prepare( `SELECT ${ QUEUED_COLUMNS } ${ REVIEWABLE }
      AND n.subject_id IN ( ${ placeholders( subjectIds ) } )
      AND q.fsrs_state IN ( 'learning', 'relearning' ) AND q.due IS NOT NULL AND q.due <= ?
      ORDER BY q.due, n.path, q.position` )
    .all( userId, ...subjectIds, until ) )
}

// A concept review (TRD §5.2): what is overdue, then what is not due yet, then questions never
// asked. A question already reviewed today is left for another day unless it is due again, so a
// review of the concept ends after one pass.
export const listForConcept = (
  userId: string,
  { conceptId, now, dayStart }: { conceptId: string, now: string, dayStart: string },
): QueuedQuestion[] => {
  return parseQueued( getDatabase()
    .prepare( `SELECT ${ QUEUED_COLUMNS } ${ REVIEWABLE }
      AND q.concept_id = ?
      AND ( q.due IS NULL OR q.due <= ? OR q.last_review IS NULL OR q.last_review < ? )
      ORDER BY CASE WHEN q.due IS NULL THEN 2 WHEN q.due <= ? THEN 0 ELSE 1 END,
        q.due, n.enrolled_at, n.path, q.position` )
    .all( userId, conceptId, now, dayStart, now ) )
}

export const countBySubject = ( userId: string, now: string ): SubjectCounts[] => {
  return z.array( SubjectCounts ).parse( getDatabase()
    .prepare( `SELECT s.id AS subject_id,
        COALESCE( SUM( CASE WHEN q.due IS NOT NULL AND q.due <= @now THEN 1 ELSE 0 END ), 0 )
          AS due,
        COALESCE( SUM( CASE WHEN q.fsrs_state = 'new' AND q.due IS NULL THEN 1 ELSE 0 END ), 0 )
          AS new_available
      FROM melete_subjects s
        LEFT JOIN melete_notes n
          ON n.subject_id = s.id AND n.enrolled = 1 AND n.missing_at IS NULL
        LEFT JOIN melete_questions q ON q.note_id = n.id AND q.state = 'active'
      WHERE s.user_id = @userId
      GROUP BY s.id
      ORDER BY lower( s.folder ), s.folder` )
    .all( { now, userId } ) )
}

// A relabel never touches the card, so the FSRS state survives a remap
export const setQuestionConcept = (
  userId: string,
  id: string,
  conceptId: string | null,
): QuestionRecord | undefined => {
  getDatabase()
    .prepare( 'UPDATE melete_questions SET concept_id = ? WHERE id = ? AND user_id = ?' )
    .run( conceptId, id, userId )

  return findQuestion( userId, id )
}
