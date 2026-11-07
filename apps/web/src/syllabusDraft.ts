// Shared
import type { MeleteSyllabus, MeleteSyllabusEdit } from '@atlas/shared'
import { MELETE_MAX_CONCEPTS } from '@atlas/shared'

export type DraftConcept = { key: string, id?: string, name: string, description: string }
export type DraftSection = { key: string, id?: string, name: string, concepts: DraftConcept[] }
export type Draft = DraftSection[]

// The editor's working copy of a syllabus: stored rows keep their id (and use it as their key),
// new rows have a key of their own and no id until the server stores them.
export const toDraft = ( { sections }: MeleteSyllabus ): Draft => sections.map( ( section ) => ( {
  key: section.id,
  id: section.id,
  name: section.name,
  concepts: section.concepts.map( ( concept ) => ( { key: concept.id, ...concept } ) ),
} ) )

export const toEdit = ( draft: Draft ): MeleteSyllabusEdit => ( {
  sections: draft.map( ( section ) => ( {
    ...section.id === undefined ? {} : { id: section.id },
    name: section.name.trim(),
    concepts: section.concepts.map( ( concept ) => ( {
      ...concept.id === undefined ? {} : { id: concept.id },
      name: concept.name.trim(),
      description: concept.description.trim(),
    } ) ),
  } ) ),
} )

const withSection = (
  draft: Draft,
  key: string,
  change: ( section: DraftSection ) => DraftSection,
): Draft => draft.map( ( section ) => section.key === key ? change( section ) : section )

export const setSectionName = ( draft: Draft, key: string, name: string ): Draft => {
  return withSection( draft, key, ( section ) => ( { ...section, name } ) )
}

export const setConcept = (
  draft: Draft,
  sectionKey: string,
  conceptKey: string,
  patch: Partial< Pick< DraftConcept, 'name' | 'description' > >,
): Draft => withSection( draft, sectionKey, ( section ) => ( {
  ...section,
  concepts: section.concepts.map( ( concept ) => {
    return concept.key === conceptKey ? { ...concept, ...patch } : concept
  } ),
} ) )

export const addConcept = ( draft: Draft, sectionKey: string, key: string ): Draft => {
  return withSection( draft, sectionKey, ( section ) => ( {
    ...section,
    concepts: [ ...section.concepts, { key, name: '', description: '' } ],
  } ) )
}

export const addSection = ( draft: Draft, key: string, conceptKey: string ): Draft => [
  ...draft,
  { key, name: '', concepts: [ { key: conceptKey, name: '', description: '' } ] },
]

export const removeConcept = ( draft: Draft, sectionKey: string, conceptKey: string ): Draft => {
  return withSection( draft, sectionKey, ( section ) => ( {
    ...section,
    concepts: section.concepts.filter( ( { key } ) => key !== conceptKey ),
  } ) )
}

export const removeSection = ( draft: Draft, key: string ): Draft => {
  return draft.filter( ( section ) => section.key !== key )
}

export const moveSection = ( draft: Draft, key: string, direction: -1 | 1 ): Draft => {
  const index = draft.findIndex( ( section ) => section.key === key )
  const target = index + direction

  if( index === -1 || target < 0 || target >= draft.length ) {
    return draft
  }

  const moved = [ ...draft ]

  moved[ index ] = draft[ target ]
  moved[ target ] = draft[ index ]

  return moved
}

// One place up or down; past the edge of a section it crosses into the next one
export const moveConcept = (
  draft: Draft,
  sectionKey: string,
  conceptKey: string,
  direction: -1 | 1,
): Draft => {
  const sectionIndex = draft.findIndex( ( { key } ) => key === sectionKey )
  const concepts = draft[ sectionIndex ]?.concepts ?? []
  const index = concepts.findIndex( ( { key } ) => key === conceptKey )
  const target = index + direction

  if( index === -1 ) {
    return draft
  }

  if( target >= 0 && target < concepts.length ) {
    const moved = [ ...concepts ]

    moved[ index ] = concepts[ target ]
    moved[ target ] = concepts[ index ]

    return withSection( draft, sectionKey, ( section ) => ( { ...section, concepts: moved } ) )
  }

  const next = draft[ sectionIndex + direction ]

  if( next === undefined ) {
    return draft
  }

  const [ concept ] = concepts.slice( index, index + 1 )
  const without = removeConcept( draft, sectionKey, conceptKey )

  return withSection( without, next.key, ( section ) => ( {
    ...section,
    concepts: direction === 1
      ? [ concept, ...section.concepts ]
      : [ ...section.concepts, concept ],
  } ) )
}

export const conceptCount = ( draft: Draft ): number => {
  return draft.reduce( ( total, { concepts } ) => total + concepts.length, 0 )
}

// What the server would refuse, said first so Save can stay off
export const problemWith = ( draft: Draft ): string | null => {
  if( conceptCount( draft ) > MELETE_MAX_CONCEPTS ) {
    return `A syllabus has at most ${ MELETE_MAX_CONCEPTS } concepts`
  }

  if( draft.some( ( { name } ) => name.trim() === '' ) ) {
    return 'Name every section'
  }

  if( draft.some( ( { concepts } ) => concepts.some( ( { name } ) => name.trim() === '' ) ) ) {
    return 'Name every concept'
  }

  return draft.some( ( { concepts } ) => concepts.length === 0 )
    ? 'Every section needs a concept'
    : null
}

export const isDirty = ( draft: Draft, stored: MeleteSyllabus ): boolean => {
  return JSON.stringify( toEdit( draft ) ) !== JSON.stringify( toEdit( toDraft( stored ) ) )
}
