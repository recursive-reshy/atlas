// Packages
import { z } from 'zod'
// Repositories
import { getDatabase } from './database.js'

export const ConceptRecord = z.object( {
  id: z.string(),
  subject_id: z.string(),
  section_id: z.string(),
  position: z.int(),
  name: z.string(),
  description: z.string(),
  created_at: z.string(),
} )
export type ConceptRecord = z.infer< typeof ConceptRecord >

export type NewConcept = Pick<
  ConceptRecord,
  'subject_id' | 'section_id' | 'name' | 'description' | 'position'
>

export type ConceptChanges = Partial<
  Pick< ConceptRecord, 'name' | 'description' | 'position' | 'section_id' >
>

export type DraftSection = {
  name: string
  concepts: { name: string, description: string }[]
}

const UPDATABLE = [ 'name', 'description', 'position', 'section_id' ] as const

const COLUMNS = `c.id, c.subject_id, c.section_id, c.position, c.name, c.description,
  c.created_at`

export const findConcept = ( userId: string, id: string ): ConceptRecord | undefined => {
  const row = getDatabase()
    .prepare( `SELECT ${ COLUMNS } FROM melete_concepts c WHERE c.id = ? AND c.user_id = ?` )
    .get( id, userId )

  return row === undefined ? undefined : ConceptRecord.parse( row )
}

// Syllabus order: by section, then by place in the section
export const listConcepts = ( userId: string, subjectId: string ): ConceptRecord[] => {
  return z.array( ConceptRecord ).parse( getDatabase()
    .prepare( `SELECT ${ COLUMNS }
      FROM melete_concepts c JOIN melete_sections s ON s.id = c.section_id
      WHERE c.user_id = ? AND c.subject_id = ?
      ORDER BY s.position, s.created_at, c.position, c.created_at` )
    .all( userId, subjectId ) )
}

export const insertConcept = ( userId: string, concept: NewConcept ): ConceptRecord => {
  const id = crypto.randomUUID()

  getDatabase()
    .prepare( `INSERT INTO melete_concepts (
        id, user_id, subject_id, section_id, position, name, description, created_at
      ) VALUES (
        @id, @user_id, @subject_id, @section_id, @position, @name, @description, @created_at
      )` )
    .run( { ...concept, id, user_id: userId, created_at: new Date().toISOString() } )

  return ConceptRecord.parse( findConcept( userId, id ) )
}

export const updateConcept = (
  userId: string,
  id: string,
  changes: ConceptChanges,
): ConceptRecord | undefined => {
  const columns = UPDATABLE.filter( ( column ) => changes[ column ] !== undefined )

  if( columns.length > 0 ) {
    getDatabase()
      .prepare( `UPDATE melete_concepts
        SET ${ columns.map( ( column ) => `${ column } = @${ column }` ).join( ', ' ) }
        WHERE id = @id AND user_id = @user_id` )
      .run( {
        ...Object.fromEntries( columns.map( ( column ) => [ column, changes[ column ] ] ) ),
        id,
        user_id: userId,
      } )
  }

  return findConcept( userId, id )
}

// Its mappings go with it, and its questions are left unlabelled
export const deleteConcept = ( userId: string, id: string ): void => {
  getDatabase()
    .prepare( 'DELETE FROM melete_concepts WHERE id = ? AND user_id = ?' )
    .run( id, userId )
}

// A redraft: the old sections, concepts, mappings and labels go and the new ones take their
// place, all or nothing
export const replaceSyllabus = (
  userId: string,
  subjectId: string,
  sections: DraftSection[],
): void => {
  const db = getDatabase()

  db.transaction( () => {
    db.prepare( 'DELETE FROM melete_sections WHERE user_id = ? AND subject_id = ?' )
      .run( userId, subjectId )

    const insertSection = db.prepare( `INSERT INTO melete_sections
      ( id, user_id, subject_id, position, name, created_at )
      VALUES ( ?, ?, ?, ?, ?, ? )` )
    const insertConcept = db.prepare( `INSERT INTO melete_concepts
      ( id, user_id, subject_id, section_id, position, name, description, created_at )
      VALUES ( ?, ?, ?, ?, ?, ?, ?, ? )` )
    const now = new Date().toISOString()

    sections.forEach( ( section, sectionIndex ) => {
      const sectionId = crypto.randomUUID()

      insertSection.run( sectionId, userId, subjectId, sectionIndex, section.name, now )
      section.concepts.forEach( ( concept, conceptIndex ) => {
        insertConcept.run(
          crypto.randomUUID(),
          userId,
          subjectId,
          sectionId,
          conceptIndex,
          concept.name,
          concept.description,
          now,
        )
      } )
    } )
  } )()
}
