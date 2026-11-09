// Shared
import type { MeleteSyllabusOutput, MeleteTargetLevel } from '@atlas/shared'
import { MELETE_MAX_CONCEPTS } from '@atlas/shared'
// Repositories
import type { DraftSection } from '../repositories/meleteConcepts.repository.js'

export const MAX_SYLLABUS_NOTES = 60
export const NOTE_OPENING_CHARACTERS = 300

export const LEVEL_LABELS: Record< MeleteTargetLevel, string > = {
  awareness: 'Awareness',
  working: 'Working knowledge',
  proficient: 'Proficient',
  expert: 'Expert',
}

export type ProcessedSyllabus = {
  sections: DraftSection[]
  // Concepts dropped for passing the cap, for the log
  capped: number
}

// Claude's draft made storable (ADR 0089): trimmed, unique, at most 80 concepts, no empty section
export const processSyllabus = ( { sections }: MeleteSyllabusOutput ): ProcessedSyllabus => {
  const seen = new Set< string >()
  let kept = 0
  let capped = 0

  const cleaned = sections.map( ( section ) => {
    const concepts = section.concepts.flatMap( ( concept ) => {
      const name = concept.name.trim()
      const key = name.toLowerCase()

      if( name === '' || seen.has( key ) ) {
        return []
      }

      seen.add( key )

      if( kept >= MELETE_MAX_CONCEPTS ) {
        capped += 1

        return []
      }

      kept += 1

      return [ { name, description: concept.description.trim() } ]
    } )

    return { name: section.name.trim() === '' ? 'General' : section.name.trim(), concepts }
  } )

  return { sections: cleaned.filter( ( { concepts } ) => concepts.length > 0 ), capped }
}

export const noteOpening = ( body: string ): string => {
  return body.trim().replace( /\s+/g, ' ' ).slice( 0, NOTE_OPENING_CHARACTERS )
}

type SyllabusInput = {
  name: string
  level: MeleteTargetLevel
  intent: string | null
  notes: { title: string, opening: string }[]
}

export const buildSyllabusUser = ( { name, level, intent, notes }: SyllabusInput ): string => {
  const shown = notes.slice( 0, MAX_SYLLABUS_NOTES )

  return [
    `Subject: ${ name }`,
    `Target level: ${ LEVEL_LABELS[ level ] }`,
    ...intent === null ? [] : [ `Intent: ${ intent }` ],
    '',
    ...shown.length === 0
      ? [ 'No notes yet.' ]
      : [
        'Notes already in the folder:',
        ...shown.map( ( { title, opening } ) => {
          return opening === '' ? `- ${ title }` : `- ${ title }: ${ opening }`
        } ),
      ],
  ].join( '\n' )
}
