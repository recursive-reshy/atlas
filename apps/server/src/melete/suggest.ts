// Shared
import type { MeleteSuggestionsOutput, MeleteTargetLevel } from '@atlas/shared'
// Melete
import { LEVEL_LABELS } from './syllabus.js'

const MAX_SUGGESTIONS = 5

// The prompt forbids links, but a model slips; a link is worse than none (ADR 0093)
const LINK = /(?:https?:\/\/|www\.)\S*/gi

const clean = ( text: string ): string => text.replace( LINK, ' ' ).replace( /\s+/g, ' ' ).trim()

export type Suggestion = MeleteSuggestionsOutput[ 'suggestions' ][ number ]

export const processSuggestions = ( { suggestions }: MeleteSuggestionsOutput ): Suggestion[] => {
  return suggestions
    .map( ( { title, by, kind, why, query } ) => ( {
      title: clean( title ),
      by: clean( by ),
      kind,
      why: clean( why ),
      query: clean( query ),
    } ) )
    .filter( ( { title, query } ) => title !== '' && query !== '' )
    .slice( 0, MAX_SUGGESTIONS )
}

type SuggestInput = {
  subject: string
  level: MeleteTargetLevel
  intent: string | null
  section: string
  concept: string
  description: string
}

export const buildSuggestUser = (
  { subject, level, intent, section, concept, description }: SuggestInput,
): string => {
  return [
    `Subject: ${ subject }`,
    `Target level: ${ LEVEL_LABELS[ level ] }`,
    ...intent === null ? [] : [ `Intent: ${ intent }` ],
    '',
    `Section: ${ section }`,
    `Concept: ${ concept }`,
    ...description === '' ? [] : [ `Description: ${ description }` ],
  ].join( '\n' )
}
