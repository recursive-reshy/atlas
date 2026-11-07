// Repositories
import { getDatabase } from '../repositories/database.js'

// Plain inserts for repository tests, so each test states only what it cares about

export const addSubject = (
  userId: string,
  folder = 'Learning/TypeScript',
  newPerDay = 10,
): string => {
  const id = crypto.randomUUID()

  getDatabase()
    .prepare( `INSERT INTO melete_subjects ( id, user_id, folder, new_per_day, created_at )
      VALUES ( ?, ?, ?, ?, '2026-10-01T00:00:00.000Z' )` )
    .run( id, userId, folder, newPerDay )

  return id
}

type NoteOptions = {
  path?: string
  hash?: string
  enrolled?: boolean
  enrolledAt?: string | null
  generation?: string
  mapping?: string
  mappingPinned?: boolean
  missingAt?: string | null
}

export const addNote = (
  userId: string,
  subjectId: string,
  options: NoteOptions = {},
): string => {
  const id = crypto.randomUUID()
  const {
    path = `Learning/TypeScript/${ id }.md`,
    hash = `hash-${ id }`,
    enrolled = true,
    enrolledAt = enrolled ? '2026-10-01T00:00:00.000Z' : null,
    generation = 'idle',
    mapping = 'idle',
    mappingPinned = false,
    missingAt = null,
  } = options

  getDatabase()
    .prepare( `INSERT INTO melete_notes (
        id, user_id, subject_id, path, title, body_hash, mtime_ms, size, enrolled, enrolled_at,
        generation, mapping, mapping_pinned, missing_at, created_at
      ) VALUES (
        ?, ?, ?, ?, 'Title', ?, 1, 1, ?, ?, ?, ?, ?, ?, '2026-10-01T00:00:00.000Z'
      )` )
    .run(
      id,
      userId,
      subjectId,
      path,
      hash,
      enrolled ? 1 : 0,
      enrolledAt,
      generation,
      mapping,
      mappingPinned ? 1 : 0,
      missingAt,
    )

  return id
}

type QuestionOptions = {
  position?: number
  state?: string
  fsrsState?: string
  due?: string | null
  hash?: string
}

export const addQuestion = (
  userId: string,
  noteId: string,
  options: QuestionOptions = {},
): string => {
  const id = crypto.randomUUID()
  const {
    position = 1,
    state = 'active',
    fsrsState = 'new',
    due = null,
    hash = 'h',
  } = options

  getDatabase()
    .prepare( `INSERT INTO melete_questions (
        id, user_id, note_id, position, prompt, answer, passage, body_hash, state, run_id,
        due, fsrs_state, created_at
      ) VALUES (
        ?, ?, ?, ?, 'Prompt', 'Answer', '', ?, ?, 1, ?, ?, '2026-10-01T00:00:00.000Z'
      )` )
    .run( id, userId, noteId, position, hash, state, due, fsrsState )

  return id
}
