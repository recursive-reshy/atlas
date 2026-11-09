// Shared
import type { MeleteApprovedQuestionsOutput, MeleteQuestionsOutput } from '@atlas/shared'
// Melete
import { resolveRefs } from './conceptRefs.js'
import type { RefConcept } from './conceptRefs.js'
// Repositories
import type { GeneratedQuestion } from '../repositories/meleteQuestions.repository.js'

const MAX_QUESTIONS = 10

const squash = ( text: string ): string => text.replace( /\s+/g, ' ' ).trim()

// The passage is shown as a quote, so one that isn't in the note is worse than none
export const processQuestions = (
  { questions }: MeleteQuestionsOutput,
  body: string,
): GeneratedQuestion[] => {
  const squashedBody = squash( body )

  return questions
    .map( ( { prompt, answer, passage } ) => ( {
      prompt: prompt.trim(),
      answer: answer.trim(),
      passage: passage.trim(),
    } ) )
    .filter( ( { prompt, answer } ) => prompt !== '' && answer !== '' )
    .slice( 0, MAX_QUESTIONS )
    .map( ( question ) => ( {
      ...question,
      passage: squashedBody.includes( squash( question.passage ) ) ? question.passage : '',
    } ) )
}

export type ProcessedApproved = {
  conceptIds: string[]
  // The concept Claude suggests when the note fits none; null otherwise
  offSyllabus: string | null
  questions: GeneratedQuestion[]
}

// Generate's answer for an approved syllabus (ADR 0089): refs become ids, a question outside the
// note's concepts gets the first one, and an off-syllabus suggestion counts only for a note with
// no concept
export const processApprovedQuestions = (
  { concepts: refs, off_syllabus: offSyllabus, questions }: MeleteApprovedQuestionsOutput,
  body: string,
  concepts: RefConcept[],
): ProcessedApproved => {
  const conceptIds = resolveRefs( refs, concepts )
  const [ firstId ] = conceptIds
  const suggestion = offSyllabus?.suggested_concept.trim() ?? ''
  const labelled = questions.flatMap( ( { concept, ...question } ) => {
    const [ kept ] = processQuestions( { questions: [ question ] }, body )

    if( kept === undefined ) {
      return []
    }

    const [ ownId ] = resolveRefs( [ concept ], concepts )

    return [ {
      ...kept,
      concept_id: ownId !== undefined && conceptIds.includes( ownId ) ? ownId : firstId ?? null,
    } ]
  } )

  return {
    conceptIds,
    offSyllabus: conceptIds.length === 0 && suggestion !== '' ? suggestion : null,
    questions: labelled.slice( 0, MAX_QUESTIONS ),
  }
}
