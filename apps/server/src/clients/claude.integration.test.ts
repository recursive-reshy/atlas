// Packages
import { describe, it, expect } from 'vitest'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'

// config.ts exits the process without a key, so the client is imported only when one is set.
const hasApiKey = ( process.env.ANTHROPIC_API_KEY ?? '' ) !== ''

describe.skipIf( !hasApiKey )( 'claude.client (real Claude API)', () => {
  it( 'summarizes a short transcript into a valid, cleanable result', async () => {
    const { summarizeSource } = await import( './claude.client.js' )
    const { cleanSummary } = await import( '../formatters/summary.cleanup.js' )

    const { summary: result, usage } = await summarizeSource( {
      document: { kind: 'video', ...transcriptFixture },
      model: 'claude-sonnet-5-5',
      guidance: 'Write the overview in a few paragraphs.',
    } )
    const cleaned = cleanSummary( result, { kind: 'video', ...transcriptFixture } )

    expect( usage.input_tokens ).toBeGreaterThan( 0 )
    expect( result.overview.trim() ).not.toBe( '' )
    expect( Array.isArray( result.key_points ) ).toBe( true )
    expect( Array.isArray( result.quotes ) ).toBe( true )
    expect( cleaned.tags.length ).toBeLessThanOrEqual( 5 )
    expect( cleaned.tags ).not.toContain( 'atlas' )

    if( cleaned.kind !== 'video' ) {
      throw new Error( 'Expected a video summary' )
    }

    for( const { seconds } of [ ...cleaned.key_points, ...cleaned.quotes ] ) {
      expect( seconds ).toBeGreaterThanOrEqual( 0 )
      expect( seconds ).toBeLessThanOrEqual( transcriptFixture.meta.duration_seconds )
    }
  } )
} )

describe.skipIf( !hasApiKey )( 'generateQuestions (real Claude API)', () => {
  it( 'writes questions from a short note', async () => {
    const { generateQuestions } = await import( './claude.client.js' )
    const {
      DEFAULT_MELETE_QUESTIONS_GUIDANCE,
      LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
      buildMeleteSystemPrompt,
    } = await import( '../melete/prompts.js' )

    const { output, usage } = await generateQuestions( {
      model: 'claude-haiku-5-5',
      system: buildMeleteSystemPrompt(
        LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
        DEFAULT_MELETE_QUESTIONS_GUIDANCE,
      ),
      user: [
        'Subject: TypeScript',
        'Title: Narrowing',
        '',
        'Narrowing is how TypeScript refines a union type inside a branch.',
        'A typeof check narrows a string | number to string in the true branch.',
      ].join( '\n' ),
    } )

    expect( usage.input_tokens ).toBeGreaterThan( 0 )
    expect( output.questions.length ).toBeGreaterThanOrEqual( 1 )
    expect( output.questions.length ).toBeLessThanOrEqual( 10 )

    for( const { prompt, answer } of output.questions ) {
      expect( prompt.trim() ).not.toBe( '' )
      expect( answer.trim() ).not.toBe( '' )
    }
  } )
} )

describe.skipIf( !hasApiKey )( 'gradeAnswer (real Claude API)', () => {
  it( 'grades a partly right answer without suggesting easy', async () => {
    const { gradeAnswer } = await import( './claude.client.js' )
    const {
      DEFAULT_MELETE_GRADING_GUIDANCE,
      LOCKED_INSTRUCTIONS_MELETE_GRADING,
      buildMeleteGradingUser,
      buildMeleteSystemPrompt,
    } = await import( '../melete/prompts.js' )

    const { output, usage } = await gradeAnswer( {
      model: 'claude-haiku-5-5',
      system: buildMeleteSystemPrompt(
        LOCKED_INSTRUCTIONS_MELETE_GRADING,
        DEFAULT_MELETE_GRADING_GUIDANCE,
      ),
      user: buildMeleteGradingUser( {
        question: 'What does narrowing do?',
        answer: 'It refines a union type inside a branch, for example after a typeof check.',
        passage: 'Narrowing is how TypeScript refines a union type inside a branch.',
        learnerAnswer: 'It makes a type smaller.',
      } ),
    } )

    expect( usage.input_tokens ).toBeGreaterThan( 0 )
    expect( [ 'again', 'hard', 'good' ] ).toContain( output.suggested_rating )
    expect( output.feedback.trim() ).not.toBe( '' )
  } )
} )

