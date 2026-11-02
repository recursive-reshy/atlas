// Shared
import type { MeleteQuestionsOutput } from '@atlas/shared'
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
