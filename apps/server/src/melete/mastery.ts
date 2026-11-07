// Shared
import type { MeleteConceptBucket } from '@atlas/shared'

// Coverage and mastery (ADR 0090): pure functions over plain rows, computed on read

// A covered concept is solid from this mastery up
export const MASTERY_THRESHOLD = 0.7

export type QuestionState = { reps: number, stability: number }

export type ConceptInput = {
  id: string
  sectionId: string
  // Enrolled notes still in the vault that are mapped to the concept
  noteCount: number
  // Its active questions
  questions: QuestionState[]
}

export type ConceptStat = {
  id: string
  section_id: string
  bucket: MeleteConceptBucket
  mastery: number
  note_count: number
  question_count: number
}

// Nothing until reviewed; then stability against the days it takes to call a question known
export const questionScore = (
  { reps, stability }: QuestionState,
  masteryDays: number,
): number => {
  return reps === 0 ? 0 : Math.min( 1, stability / masteryDays )
}

export const computeConceptStats = (
  concepts: ConceptInput[],
  masteryDays: number,
): ConceptStat[] => {
  return concepts.map( ( { id, sectionId, noteCount, questions } ) => {
    const covered = noteCount > 0
    const mastery = covered && questions.length > 0
      ? questions.reduce( ( sum, question ) => sum + questionScore( question, masteryDays ), 0 )
        / questions.length
      : 0
    const bucket = !covered ? 'uncovered' : mastery >= MASTERY_THRESHOLD ? 'solid' : 'weak'

    return {
      id,
      section_id: sectionId,
      bucket,
      mastery,
      note_count: noteCount,
      question_count: questions.length,
    }
  } )
}

// Uncovered concepts count as 0 in the mean, so mastery never exceeds coverage
export const rollUp = (
  stats: ConceptStat[],
): { coverage: number, mastery: number } | null => {
  if( stats.length === 0 ) {
    return null
  }

  return {
    coverage: stats.filter( ( { bucket } ) => bucket !== 'uncovered' ).length / stats.length,
    mastery: stats.reduce( ( sum, { mastery } ) => sum + mastery, 0 ) / stats.length,
  }
}
