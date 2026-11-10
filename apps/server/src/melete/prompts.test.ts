/* eslint-disable @stylistic/max-len -- prompt lines are one paragraph each, verbatim from TRD §6.1 */
// Packages
import { describe, it, expect } from 'vitest'
// Shared
import { Guidance } from '@atlas/shared'
// Melete
import {
  DEFAULT_MELETE_GRADING_GUIDANCE,
  DEFAULT_MELETE_MAP_GUIDANCE,
  DEFAULT_MELETE_QUESTIONS_GUIDANCE,
  DEFAULT_MELETE_SUGGEST_GUIDANCE,
  DEFAULT_MELETE_SYLLABUS_GUIDANCE,
  LOCKED_INSTRUCTIONS_MELETE_GRADING,
  LOCKED_INSTRUCTIONS_MELETE_MAP,
  LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
  LOCKED_INSTRUCTIONS_MELETE_QUESTIONS_APPROVED,
  LOCKED_INSTRUCTIONS_MELETE_SUGGEST,
  MELETE_GRADING_SEED_KEY,
  MELETE_MAP_SEED_KEY,
  MELETE_QUESTIONS_SEED_KEY,
  MELETE_SUGGEST_SEED_KEY,
  MELETE_SYLLABUS_SEED_KEY,
  buildMeleteGradingUser,
  buildMeleteSystemPrompt,
} from './prompts.js'

describe( 'the seed keys', () => {
  it( 'match the prompt purposes', () => {
    expect( MELETE_QUESTIONS_SEED_KEY ).toBe( 'melete_questions' )
    expect( MELETE_GRADING_SEED_KEY ).toBe( 'melete_grading' )
    expect( MELETE_SYLLABUS_SEED_KEY ).toBe( 'melete_syllabus' )
    expect( MELETE_MAP_SEED_KEY ).toBe( 'melete_map' )
    expect( MELETE_SUGGEST_SEED_KEY ).toBe( 'melete_suggest' )
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

describe( 'LOCKED_INSTRUCTIONS_MELETE_QUESTIONS_APPROVED', () => {
  it( 'starts with a first line that tells it apart from the plain form', () => {
    expect( LOCKED_INSTRUCTIONS_MELETE_QUESTIONS_APPROVED.split( '\n' )[ 0 ] )
      .toBe( 'You write active-recall questions from one study note and place the note in a syllabus.' )
  } )

  it( 'keeps the question rules of the plain form', () => {
    expect( LOCKED_INSTRUCTIONS_MELETE_QUESTIONS_APPROVED.toLowerCase() )
      .toContain( 'copied verbatim from the note' )
    expect( LOCKED_INSTRUCTIONS_MELETE_QUESTIONS_APPROVED.toLowerCase() ).toContain( 'at most 10' )
  } )

  it.each( [
    'concepts: the refs',
    'at most 5',
    'off_syllabus',
    'concept: the ref',
    'only the refs you were given',
  ] )( 'says %s', ( phrase ) => {
    expect( LOCKED_INSTRUCTIONS_MELETE_QUESTIONS_APPROVED.toLowerCase() )
      .toContain( phrase.toLowerCase() )
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
      '<learner_answer>',
      'Making a type smaller.',
      '</learner_answer>',
    ].join( '\n' ) )
  } )

  it( 'leaves out the passage when there is none', () => {
    const user = buildMeleteGradingUser( { ...input, passage: '' } )

    expect( user ).not.toContain( 'Passage' )
    expect( user ).toContain( '## Reference answer\nRefining a union type inside a branch.\n\n## Learner' )
  } )
} )

describe( 'the concept-layer locked instructions (ADR 0089, 0093)', () => {
  const all = {
    map: LOCKED_INSTRUCTIONS_MELETE_MAP,
    suggest: LOCKED_INSTRUCTIONS_MELETE_SUGGEST,
    questions: LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
    grading: LOCKED_INSTRUCTIONS_MELETE_GRADING,
  }

  it( 'each start with a first line no other prompt has', () => {
    const firstLines = Object.values( all ).map( ( text ) => text.split( '\n' )[ 0 ] )

    expect( new Set( firstLines ).size ).toBe( firstLines.length )
    expect( LOCKED_INSTRUCTIONS_MELETE_MAP.split( '\n' )[ 0 ] )
      .toBe( 'You map a study note and its questions onto the concepts of a syllabus.' )
    expect( LOCKED_INSTRUCTIONS_MELETE_SUGGEST.split( '\n' )[ 0 ] )
      .toBe( 'You suggest learning resources for one concept of a syllabus.' )
  } )

  it.each( [
    'c1',
    'off-syllabus',
    'never create or drop',
    'only the concept refs',
  ] )( 'the map prompt says %s', ( phrase ) => {
    expect( LOCKED_INSTRUCTIONS_MELETE_MAP.toLowerCase() ).toContain( phrase.toLowerCase() )
  } )

  it.each( [
    '3 to 5',
    'never write a url',
    'search query',
    'from your own knowledge',
  ] )( 'the suggest prompt says %s', ( phrase ) => {
    expect( LOCKED_INSTRUCTIONS_MELETE_SUGGEST.toLowerCase() ).toContain( phrase.toLowerCase() )
  } )

  it( 'have default guidance that passes the guidance rules and names no file or URL', () => {
    for( const guidance of [
      DEFAULT_MELETE_SYLLABUS_GUIDANCE,
      DEFAULT_MELETE_MAP_GUIDANCE,
      DEFAULT_MELETE_SUGGEST_GUIDANCE,
    ] ) {
      expect( Guidance.safeParse( guidance ).success ).toBe( true )
      expect( guidance ).not.toMatch( /https?:/ )
    }
  } )
} )
