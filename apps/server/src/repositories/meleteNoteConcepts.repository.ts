// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

export const NoteConceptRecord = z.object( {
  note_id: z.string(),
  concept_id: z.string(),
  source: z.enum( [ 'claude', 'hand' ] ),
} )
export type NoteConceptRecord = z.infer< typeof NoteConceptRecord >

export const listNoteConcepts = ( userId: string, noteId: string ): NoteConceptRecord[] => {
  return z.array( NoteConceptRecord ).parse( getDatabase()
    .prepare( `SELECT nc.note_id, nc.concept_id, nc.source
      FROM melete_note_concepts nc JOIN melete_concepts c ON c.id = nc.concept_id
      JOIN melete_sections s ON s.id = c.section_id
      WHERE nc.user_id = ? AND nc.note_id = ?
      ORDER BY s.position, c.position` )
    .all( userId, noteId ) )
}

// Replaces the note's whole mapping, all or nothing
export const setNoteConcepts = (
  userId: string,
  noteId: string,
  conceptIds: string[],
  source: NoteConceptRecord[ 'source' ],
): void => {
  const db = getDatabase()

  db.transaction( () => {
    db.prepare( 'DELETE FROM melete_note_concepts WHERE user_id = ? AND note_id = ?' )
      .run( userId, noteId )

    const insert = db.prepare( `INSERT OR IGNORE INTO melete_note_concepts
      ( user_id, note_id, concept_id, source ) VALUES ( ?, ?, ?, ? )` )

    for( const conceptId of conceptIds ) {
      insert.run( userId, noteId, conceptId, source )
    }
  } )()
}

const marks = ( values: readonly unknown[] ): string => values.map( () => '?' ).join( ', ' )

// Notes mapped to any of these concepts, for finding who loses one when they are removed
export const listNoteIdsForConcepts = ( userId: string, conceptIds: string[] ): string[] => {
  if( conceptIds.length === 0 ) {
    return []
  }

  return z.array( z.string() ).parse( getDatabase()
    .prepare( `SELECT DISTINCT note_id FROM melete_note_concepts
      WHERE user_id = ? AND concept_id IN ( ${ marks( conceptIds ) } )` )
    .pluck()
    .all( userId, ...conceptIds ) )
}

export const noteIdsWithoutConcepts = ( userId: string, noteIds: string[] ): string[] => {
  if( noteIds.length === 0 ) {
    return []
  }

  return z.array( z.string() ).parse( getDatabase()
    .prepare( `SELECT id FROM melete_notes
      WHERE user_id = ? AND id IN ( ${ marks( noteIds ) } )
        AND NOT EXISTS (
          SELECT 1 FROM melete_note_concepts nc WHERE nc.note_id = melete_notes.id
        )` )
    .pluck()
    .all( userId, ...noteIds ) )
}
