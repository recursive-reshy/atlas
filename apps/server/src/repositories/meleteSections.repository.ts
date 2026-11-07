// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

export const SectionRecord = z.object( {
  id: z.string(),
  subject_id: z.string(),
  position: z.int(),
  name: z.string(),
  created_at: z.string(),
} )
export type SectionRecord = z.infer< typeof SectionRecord >

export type NewSection = Pick< SectionRecord, 'subject_id' | 'name' | 'position' >

export type SectionChanges = Partial< Pick< SectionRecord, 'name' | 'position' > >

const SELECT = 'SELECT id, subject_id, position, name, created_at FROM melete_sections'

export const findSection = ( userId: string, id: string ): SectionRecord | undefined => {
  const row = getDatabase()
    .prepare( `${ SELECT } WHERE id = ? AND user_id = ?` )
    .get( id, userId )

  return row === undefined ? undefined : SectionRecord.parse( row )
}

export const listSections = ( userId: string, subjectId: string ): SectionRecord[] => {
  return z.array( SectionRecord ).parse( getDatabase()
    .prepare( `${ SELECT } WHERE user_id = ? AND subject_id = ? ORDER BY position, created_at` )
    .all( userId, subjectId ) )
}

export const insertSection = ( userId: string, section: NewSection ): SectionRecord => {
  const id = crypto.randomUUID()

  getDatabase()
    .prepare( `INSERT INTO melete_sections ( id, user_id, subject_id, position, name, created_at )
      VALUES ( @id, @user_id, @subject_id, @position, @name, @created_at )` )
    .run( { ...section, id, user_id: userId, created_at: new Date().toISOString() } )

  return SectionRecord.parse( findSection( userId, id ) )
}

export const updateSection = (
  userId: string,
  id: string,
  changes: SectionChanges,
): SectionRecord | undefined => {
  const db = getDatabase()

  if( changes.name !== undefined ) {
    db.prepare( 'UPDATE melete_sections SET name = ? WHERE id = ? AND user_id = ?' )
      .run( changes.name, id, userId )
  }

  if( changes.position !== undefined ) {
    db.prepare( 'UPDATE melete_sections SET position = ? WHERE id = ? AND user_id = ?' )
      .run( changes.position, id, userId )
  }

  return findSection( userId, id )
}

// The section's concepts go with it (and their mappings, and their questions' labels)
export const deleteSection = ( userId: string, id: string ): void => {
  getDatabase()
    .prepare( 'DELETE FROM melete_sections WHERE id = ? AND user_id = ?' )
    .run( id, userId )
}
