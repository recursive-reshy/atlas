// Packages
import { z } from 'zod'
// Shared
import { MeleteGeneration } from '@atlas/shared'
// Repositories
import { getDatabase } from './database.js'

const Flag = z.int().transform( ( value ) => value === 1 )

export const NoteRecord = z.object( {
  id: z.string(),
  subject_id: z.string(),
  path: z.string(),
  title: z.string(),
  body_hash: z.string(),
  mtime_ms: z.number(),
  size: z.int(),
  enrolled: Flag,
  enrolled_at: z.string().nullable(),
  generation: MeleteGeneration,
  generation_error: z.string().nullable(),
  missing_at: z.string().nullable(),
  created_at: z.string(),
} )
export type NoteRecord = z.infer< typeof NoteRecord >

export type NewNote = Pick<
  NoteRecord,
  'subject_id' | 'path' | 'title' | 'body_hash' | 'mtime_ms' | 'size' | 'enrolled'
  | 'enrolled_at' | 'generation'
>

const UPDATABLE = [
  'path',
  'subject_id',
  'title',
  'body_hash',
  'mtime_ms',
  'size',
  'enrolled_at',
  'generation',
  'generation_error',
  'missing_at',
] as const

export type NoteChanges = Partial< Pick< NoteRecord, typeof UPDATABLE[ number ] > >

const placeholders = ( values: readonly unknown[] ): string => values.map( () => '?' ).join( ', ' )

const parseRows = ( rows: unknown[] ): NoteRecord[] => z.array( NoteRecord ).parse( rows )

export const findNote = ( userId: string, id: string ): NoteRecord | undefined => {
  const row = getDatabase()
    .prepare( 'SELECT * FROM melete_notes WHERE id = ? AND user_id = ?' )
    .get( id, userId )

  return row === undefined ? undefined : NoteRecord.parse( row )
}

export const insertNote = ( userId: string, note: NewNote ): NoteRecord => {
  const id = crypto.randomUUID()

  getDatabase()
    .prepare( `INSERT INTO melete_notes (
        id, user_id, subject_id, path, title, body_hash, mtime_ms, size, enrolled,
        enrolled_at, generation, created_at
      ) VALUES (
        @id, @user_id, @subject_id, @path, @title, @body_hash, @mtime_ms, @size, @enrolled,
        @enrolled_at, @generation, @created_at
      )` )
    .run( {
      ...note,
      id,
      user_id: userId,
      enrolled: note.enrolled ? 1 : 0,
      created_at: new Date().toISOString(),
    } )

  const inserted = findNote( userId, id )

  if( inserted === undefined ) {
    throw new Error( `Melete note ${ id } was not stored` )
  }

  return inserted
}

export const listNotesBySubject = ( userId: string, subjectId: string ): NoteRecord[] => {
  return parseRows( getDatabase()
    .prepare( 'SELECT * FROM melete_notes WHERE user_id = ? AND subject_id = ? ORDER BY path' )
    .all( userId, subjectId ) )
}

// A path range instead of LIKE, so % and _ in folder names are plain characters ('0' follows '/')
export const listNotesUnder = ( userId: string, folderPrefix: string ): NoteRecord[] => {
  return parseRows( getDatabase()
    .prepare( `SELECT * FROM melete_notes
      WHERE user_id = ? AND path >= ? AND path < ? ORDER BY path` )
    .all( userId, `${ folderPrefix }/`, `${ folderPrefix }0` ) )
}

export const updateNote = (
  userId: string,
  id: string,
  changes: NoteChanges,
): NoteRecord | undefined => {
  const columns = UPDATABLE.filter( ( column ) => changes[ column ] !== undefined )

  if( columns.length > 0 ) {
    getDatabase()
      .prepare( `UPDATE melete_notes
        SET ${ columns.map( ( column ) => `${ column } = @${ column }` ).join( ', ' ) }
        WHERE id = @id AND user_id = @user_id` )
      .run( {
        ...Object.fromEntries( columns.map( ( c ) => [ c, changes[ c ] ] ) ),
        id,
        user_id: userId,
      } )
  }

  return findNote( userId, id )
}

export const findMissingByHash = ( userId: string, hash: string ): NoteRecord[] => {
  return parseRows( getDatabase()
    .prepare( `SELECT * FROM melete_notes
      WHERE user_id = ? AND missing_at IS NOT NULL AND body_hash = ?` )
    .all( userId, hash ) )
}

// Unenrolling keeps enrolled_at, so enrolling again goes back to its old place in the queue
export const setEnrolled = (
  userId: string,
  ids: string[],
  enrolled: boolean,
  at: string,
): void => {
  if( ids.length === 0 ) {
    return
  }

  getDatabase()
    .prepare( enrolled
      ? `UPDATE melete_notes SET enrolled = 1, enrolled_at = ?
        WHERE user_id = ? AND id IN ( ${ placeholders( ids ) } )`
      : `UPDATE melete_notes SET enrolled = 0
        WHERE user_id = ? AND id IN ( ${ placeholders( ids ) } )` )
    .run( ...( enrolled ? [ at, userId, ...ids ] : [ userId, ...ids ] ) )
}
