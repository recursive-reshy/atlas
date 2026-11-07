// Shared
import type { MeleteMapOutput } from '@atlas/shared'
// Melete
import { buildConceptList, conceptRefs, resolveRefs } from './conceptRefs.js'
import type { RefConcept } from './conceptRefs.js'

export type MapQuestion = { id: string, prompt: string, answer: string, concept_id: string | null }

type MapInput = {
  concepts: RefConcept[]
  body: string
  questions: Pick< MapQuestion, 'prompt' | 'answer' >[]
  // A labels-only run (a hand edit): the note's concepts are given, Claude only labels
  fixedIds?: string[]
}

export const buildMapUser = ( { concepts, body, questions, fixedIds }: MapInput ): string => {
  const refs = conceptRefs( concepts )
  const fixed = fixedIds?.flatMap( ( id ) => {
    return refs.find( ( concept ) => concept.id === id )?.ref ?? []
  } )

  return [
    `## Concepts\n${ buildConceptList( concepts ) }`,
    ...fixed === undefined
      ? []
      : [ `## Fixed concepts\nThe note's concepts are already set: ${ fixed.join( ', ' ) }.` ],
    `## Note\n${ body }`,
    questions.length === 0
      ? '## Questions\nNo questions yet.'
      : `## Questions\n${ questions.map( ( { prompt, answer }, index ) => {
        return `${ index + 1 }. ${ prompt }\n   Answer: ${ answer }`
      } ).join( '\n' ) }`,
  ].join( '\n\n' )
}

export type ProcessedMap = {
  conceptIds: string[]
  // The concept Claude suggests when the note fits none; null otherwise
  offSyllabus: string | null
  labels: { questionId: string, conceptId: string | null }[]
}

// Map's answer made storable (ADR 0089). A question keeps its label unless Claude gives it
// another one of the note's concepts; one whose label is no longer one of them gets the first
// concept. With `fixedIds` the concepts are the given ones and only the labels are read.
export const processMap = (
  output: MeleteMapOutput,
  concepts: RefConcept[],
  questions: MapQuestion[],
  fixedIds?: string[],
): ProcessedMap => {
  const conceptIds = fixedIds ?? resolveRefs( output.concepts, concepts )
  const [ firstId ] = conceptIds
  const given = new Map< number, string >()

  for( const { question, concept } of output.labels ) {
    const [ id ] = resolveRefs( [ concept ], concepts )

    if( id !== undefined && conceptIds.includes( id ) && !given.has( question ) ) {
      given.set( question, id )
    }
  }

  const suggestion = output.off_syllabus?.suggested_concept.trim() ?? ''

  return {
    conceptIds,
    offSyllabus: fixedIds === undefined && conceptIds.length === 0 && suggestion !== ''
      ? suggestion
      : null,
    labels: questions.map( ( { id, concept_id: own }, index ) => {
      const kept = own !== null && conceptIds.includes( own ) ? own : undefined

      return { questionId: id, conceptId: given.get( index + 1 ) ?? kept ?? firstId ?? null }
    } ),
  }
}
