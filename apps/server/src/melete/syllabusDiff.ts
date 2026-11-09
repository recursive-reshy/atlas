// Shared
import type {
  MeleteSyllabus,
  MeleteSyllabusDiff,
  MeleteSyllabusEdit,
} from '@atlas/shared'
// Errors
import { ValidationError } from '../errors.js'

export type PlannedConcept = {
  // Null for a new concept
  id: string | null
  name: string
  description: string
  position: number
}

export type PlannedSection = {
  // Null for a new section
  id: string | null
  name: string
  position: number
  concepts: PlannedConcept[]
}

export type SyllabusPlan = {
  diff: MeleteSyllabusDiff
  // In syllabus order, each with the position it will have
  sections: PlannedSection[]
  removeConceptIds: string[]
  removeSectionIds: string[]
}

type CurrentConcept = { sectionId: string, name: string, description: string }

const longestIncreasing = ( values: number[] ): number => {
  const lengths = values.map( () => 1 )

  values.forEach( ( value, index ) => {
    for( let before = 0; before < index; before++ ) {
      if( values[ before ] < value ) {
        lengths[ index ] = Math.max( lengths[ index ], lengths[ before ] + 1 )
      }
    }
  } )

  return Math.max( 0, ...lengths )
}

// Checks the edit against the stored syllabus and works out what to write (TRD §3.3). A drag
// counts as one move (the concepts that kept their relative order are not moved), and the shift
// that a removal or an addition causes counts for nothing.
export const planSyllabus = ( current: MeleteSyllabus, edit: MeleteSyllabusEdit ): SyllabusPlan => {
  const sectionIds = new Set( current.sections.map( ( { id } ) => id ) )
  const concepts = new Map< string, CurrentConcept >()

  for( const section of current.sections ) {
    for( const concept of section.concepts ) {
      concepts.set( concept.id, {
        sectionId: section.id,
        name: concept.name,
        description: concept.description,
      } )
    }
  }

  const seenSections = new Set< string >()
  const seenConcepts = new Set< string >()

  for( const section of edit.sections ) {
    if( section.id !== undefined ) {
      if( !sectionIds.has( section.id ) ) {
        throw new ValidationError( 'The syllabus has no such section' )
      }

      if( seenSections.has( section.id ) ) {
        throw new ValidationError( 'A section appears twice' )
      }

      seenSections.add( section.id )
    }

    for( const concept of section.concepts ) {
      if( concept.id === undefined ) {
        continue
      }

      if( !concepts.has( concept.id ) ) {
        throw new ValidationError( 'The syllabus has no such concept' )
      }

      if( seenConcepts.has( concept.id ) ) {
        throw new ValidationError( 'A concept appears twice' )
      }

      seenConcepts.add( concept.id )
    }
  }

  const diff = { renamed: 0, added: 0, removed: 0, moved: 0 }

  // Concepts that stay in their section, in their old order, by the section's id
  const stayers = new Map< string, string[] >()

  for( const section of current.sections ) {
    const kept = section.concepts
      .filter( ( { id } ) => edit.sections.some( ( other ) => {
        return other.id === section.id && other.concepts.some( ( c ) => c.id === id )
      } ) )

    stayers.set( section.id, kept.map( ( { id } ) => id ) )
  }

  const planned = edit.sections.map( ( section, sectionIndex ): PlannedSection => ( {
    id: section.id ?? null,
    name: section.name,
    position: sectionIndex,
    concepts: section.concepts.map( ( concept, position ) => {
      const old = concept.id === undefined ? undefined : concepts.get( concept.id )

      if( old === undefined ) {
        diff.added += 1
      } else {
        if( old.name !== concept.name || old.description !== concept.description ) {
          diff.renamed += 1
        }

        if( old.sectionId !== section.id ) {
          diff.moved += 1
        }
      }

      return {
        id: concept.id ?? null,
        name: concept.name,
        description: concept.description,
        position,
      }
    } ),
  } ) )

  for( const section of edit.sections ) {
    if( section.id === undefined ) {
      continue
    }

    const oldOrder = stayers.get( section.id ) ?? []
    const newOrder = section.concepts
      .map( ( { id } ) => id )
      .filter( ( id ): id is string => id !== undefined && oldOrder.includes( id ) )
    const ranks = newOrder.map( ( id ) => oldOrder.indexOf( id ) )

    diff.moved += ranks.length - longestIncreasing( ranks )
  }

  const removeConceptIds = [ ...concepts.keys() ].filter( ( id ) => !seenConcepts.has( id ) )

  diff.removed = removeConceptIds.length

  return {
    diff,
    sections: planned,
    removeConceptIds,
    removeSectionIds: current.sections
      .map( ( { id } ) => id )
      .filter( ( id ) => !seenSections.has( id ) ),
  }
}
