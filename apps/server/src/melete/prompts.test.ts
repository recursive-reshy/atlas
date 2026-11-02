/* eslint-disable @stylistic/max-len -- prompt lines are one paragraph each, verbatim from TRD §6.1 */
// Packages
import { describe, it, expect } from 'vitest'
// Shared
import { Guidance } from '@atlas/shared'
// Melete
import {
  DEFAULT_MELETE_GRADING_GUIDANCE,
  DEFAULT_MELETE_QUESTIONS_GUIDANCE,
  LOCKED_INSTRUCTIONS_MELETE_GRADING,
  LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
  MELETE_GRADING_SEED_KEY,
  MELETE_QUESTIONS_SEED_KEY,
  buildMeleteGradingUser,
  buildMeleteSystemPrompt,
} from './prompts.js'

describe( 'the seed keys', () => {
  it( 'match the prompt purposes', () => {
    expect( MELETE_QUESTIONS_SEED_KEY ).toBe( 'melete_questions' )
    expect( MELETE_GRADING_SEED_KEY ).toBe( 'melete_grading' )
  } )
} )

describe( 'LOCKED_INSTRUCTIONS_MELETE_QUESTIONS', () => {
  it( 'starts with a first line that tells it apart from the other prompts', () => {
    expect( LOCKED_INSTRUCTIONS_MELETE_QUESTIONS.split( '\n' )[ 0 ] )
      .toBe( 'You write active-recall questions from one study note.' )
  } )

  it.each( [
    'definitions, how and why, steps, comparisons, common mistakes',
    'answerable from the note alone',
    'do not ask about the note itself',
    'copied verbatim from the note',
    'at most 10',
  ] )( 'says %s', ( phrase ) => {
    expect( LOCKED_INSTRUCTIONS_MELETE_QUESTIONS.toLowerCase() ).toContain( phrase.toLowerCase() )
  } )
} )

describe( 'LOCKED_INSTRUCTIONS_MELETE_GRADING', () => {
  it( 'starts with a first line that tells it apart from the other prompts', () => {
    expect( LOCKED_INSTRUCTIONS_MELETE_GRADING.split( '\n' )[ 0 ] )
      .toBe( 'You grade a learner\'s answer against a reference answer and passage.' )
  } )

  it.each( [
    'judge meaning, not wording',
    'again',
    'hard',
    'good',
    'never suggest easy',
  ] )( 'says %s', ( phrase ) => {
    expect( LOCKED_INSTRUCTIONS_MELETE_GRADING.toLowerCase() ).toContain( phrase.toLowerCase() )
  } )

  it( 'differs from the questions prompt in its first line', () => {
    expect( LOCKED_INSTRUCTIONS_MELETE_GRADING.split( '\n' )[ 0 ] )
      .not.toBe( LOCKED_INSTRUCTIONS_MELETE_QUESTIONS.split( '\n' )[ 0 ] )
  } )
} )

describe( 'the default guidance', () => {
  it( 'is the text of TRD §6.1 for questions', () => {
    expect( DEFAULT_MELETE_QUESTIONS_GUIDANCE ).toBe( 'Prefer questions that make me explain or apply an idea over questions that only ask me to name it. Mix question types: what is it, why does it matter, how does it work, when would I use it, what goes wrong. Keep each question to one sentence. If the note lists steps, ask for the steps in order. If the note contrasts two things, ask for the difference.' )
  } )

  it( 'is the text of TRD §6.1 for grading', () => {
    expect( DEFAULT_MELETE_GRADING_GUIDANCE ).toBe( 'Be strict about the core idea and relaxed about wording and order. If I got the gist but missed a detail that matters in practice, say which detail. Keep feedback short and specific; don\'t repeat my answer back to me.' )
  } )

  it( 'passes the guidance rules for an editable prompt', () => {
    expect( Guidance.safeParse( DEFAULT_MELETE_QUESTIONS_GUIDANCE ).success ).toBe( true )
    expect( Guidance.safeParse( DEFAULT_MELETE_GRADING_GUIDANCE ).success ).toBe( true )
  } )
} )

describe( 'buildMeleteSystemPrompt', () => {
  it( 'puts the locked instructions first and the guidance under ## Guidance', () => {
    expect( buildMeleteSystemPrompt( 'Locked text.', 'My guidance.' ) )
      .toBe( 'Locked text.\n\n## Guidance\nMy guidance.' )
  } )

  it( 'builds the real prompts with the locked instructions at the start', () => {
    const prompt = buildMeleteSystemPrompt(
      LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
      DEFAULT_MELETE_QUESTIONS_GUIDANCE,
    )

    expect( prompt.startsWith( LOCKED_INSTRUCTIONS_MELETE_QUESTIONS ) ).toBe( true )
    expect( prompt.endsWith( DEFAULT_MELETE_QUESTIONS_GUIDANCE ) ).toBe( true )
  } )
} )

describe( 'buildMeleteGradingUser', () => {
  const input = {
    question: 'What is narrowing?',
    answer: 'Refining a union type inside a branch.',
    passage: 'Narrowing refines a union type.',
    learnerAnswer: 'Making a type smaller.',
  }

  it( 'puts each part under its own heading', () => {
    expect( buildMeleteGradingUser( input ) ).toBe( [
      '## Question',
      'What is narrowing?',
      '',
      '## Reference answer',
      'Refining a union type inside a branch.',
      '',
      '## Passage',
      'Narrowing refines a union type.',
      '',
      '## Learner\'s answer',
      'Making a type smaller.',
    ].join( '\n' ) )
  } )

  it( 'leaves out the passage when there is none', () => {
    const user = buildMeleteGradingUser( { ...input, passage: '' } )

    expect( user ).not.toContain( 'Passage' )
    expect( user ).toContain( '## Reference answer\nRefining a union type inside a branch.\n\n## Learner' )
  } )
} )
