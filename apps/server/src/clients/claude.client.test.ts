// Packages
import Anthropic from '@anthropic-ai/sdk'
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Clients
import {
  SummaryError,
  SummaryResult,
  generateApprovedQuestions,
  generateQuestions,
  gradeAnswer,
  mapNote,
  suggestResources,
  summarizeSource,
} from './claude.client.js'
// Errors
import { MeleteError } from '../errors.js'
// Summarizer
import { buildSystemPrompt } from '../summarizer/prompts.js'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'

const { parse } = vi.hoisted( () => ( { parse: vi.fn() } ) )

vi.mock( '@anthropic-ai/sdk', () => {
  class APIError extends Error {
    constructor( status: number, error: unknown, message: string ) {
      super( message )
    }
  }

  class MockAnthropic {
    static APIError = APIError
    messages = { parse }

  }

  return { default: MockAnthropic }
} )
vi.mock( '../logger.js', () => ( { logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } } ) )
vi.mock( '../config.js', () => ( {
  config: {
    anthropicApiKey: 'sk-test',
    summaryTimeoutMs: 12_345,
    melete: { generationTimeoutMs: 54_321, gradingTimeoutMs: 7_654 },
  },
} ) )

// The options the call passed to the SDK per request (the client itself is shared)
const requestOptions = (): unknown => parse.mock.calls[ 0 ]?.[ 1 ]

const summary: SummaryResult = {
  overview: 'A short talk about formatters.',
  key_points: [ 'Formatters are pure' ],
  quotes: [ 'No I/O is involved.' ],
  tags: [ 'formatters' ],
}

const articleSummary: SummaryResult = {
  overview: 'A short post about habits.',
  key_points: [ 'Small habits compound' ],
  quotes: [ 'Do it daily.' ],
  tags: [ 'habits' ],
}

const articleInput = {
  document: {
    kind: 'article' as const,
    meta: {
      title: 'The Quiet Compounding of Small Habits',
      source: 'https://example.com/habits',
      author: 'Alan Turing',
      site: 'Notes on Work',
      published: '2026-08-30',
      fetched_at: '2026-10-18T10:00:00.000Z',
      origin: 'fetched' as const,
    },
    markdown: '## What to do\n\nDo it daily.',
  },
  model: 'claude-sonnet-5-5',
  guidance: 'Focus on pricing.',
}

const input = {
  document: { kind: 'video' as const, ...transcriptFixture },
  model: 'claude-opus-5-5',
  guidance: 'Focus on pricing.',
}

const reply = ( overrides: Record< string, unknown > = {} ): Record< string, unknown > => ( {
  stop_reason: 'end_turn',
  parsed_output: summary,
  usage: { input_tokens: 1234, output_tokens: 56 },
  ...overrides,
} )

beforeEach( () => {
  parse.mockReset()
  parse.mockResolvedValue( reply() )
} )

describe( 'summarizeSource', () => {
  it( 'returns the parsed summary with the tokens it used', async () => {
    const result = await summarizeSource( input )

    expect( result ).toEqual( {
      summary: { kind: 'video', ...summary },
      usage: { input_tokens: 1234, output_tokens: 56 },
    } )
  } )

  it( 'passes the configured timeout and one retry with the request', async () => {
    await summarizeSource( input )

    expect( requestOptions() ).toEqual( { timeout: 12_345, maxRetries: 1 } )
  } )

  it( 'asks the summary model for structured output with room to think', async () => {
    await summarizeSource( input )

    const [ request ] = parse.mock.calls[ 0 ] as [ Record< string, unknown > ]

    expect( request ).toMatchObject( {
      model: 'claude-opus-5-5',
      max_tokens: 16_000,
      output_config: { effort: 'medium', format: expect.anything() as unknown },
    } )
  } )

  it( 'sends the locked instructions followed by the guidance as the system prompt', async () => {
    await summarizeSource( input )

    const [ request ] = parse.mock.calls[ 0 ] as [ Record< string, unknown > ]

    expect( request.system ).toBe( buildSystemPrompt( 'Focus on pricing.', 'video' ) )
  } )

  it( 'sends the title and the transcript text', async () => {
    await summarizeSource( input )

    const [ request ] = parse.mock.calls[ 0 ] as [
      { messages: { role: string, content: string }[] },
    ]

    expect( request.messages ).toEqual( [ {
      role: 'user',
      content: '<source_content>\n'
        + `# ${ input.document.meta.title }\n\n${ transcriptFixture.text }\n</source_content>`,
    } ] )
  } )

  it( 'throws when the output could not be parsed', async () => {
    parse.mockResolvedValue( reply( { parsed_output: null } ) )

    await expect( summarizeSource( input ) ).rejects.toThrow(
      'Summary response did not match the expected format',
    )
  } )

  it.each( [
    [ 'max_tokens', 'Summary was cut off' ],
    [ 'refusal', 'Summary was declined' ],
  ] )( 'throws when the stop reason is %s', async ( stopReason, message ) => {
    parse.mockResolvedValue( reply( { stop_reason: stopReason } ) )

    await expect( summarizeSource( input ) ).rejects.toThrow(
      message,
    )
  } )

  it.each( [
    [ { parsed_output: null }, 'Summary response did not match the expected format' ],
    [ { stop_reason: 'max_tokens' }, 'Summary was cut off' ],
    [ { stop_reason: 'refusal' }, 'Summary was declined' ],
  ] )( 'carries the billed tokens on an unusable response (%j)', async ( overrides, message ) => {
    parse.mockResolvedValue( reply( overrides ) )

    const error: unknown = await summarizeSource( input ).catch( ( caught: unknown ) => caught )

    expect( error ).toBeInstanceOf( SummaryError )
    expect( ( error as SummaryError ).message ).toContain( message )
    expect( ( error as SummaryError ).usage ).toEqual( { input_tokens: 1234, output_tokens: 56 } )
  } )

  it( 'throws a SummaryError without usage for an API error', async () => {
    parse.mockRejectedValue( new Anthropic.APIError( 500, undefined, 'Overloaded', undefined ) )

    const error: unknown = await summarizeSource( input ).catch( ( caught: unknown ) => caught )

    expect( error ).toBeInstanceOf( SummaryError )
    expect( ( error as SummaryError ).usage ).toBeUndefined()
  } )

  it( 'wraps API errors with a readable message', async () => {
    parse.mockRejectedValue( new Anthropic.APIError( 429, undefined, 'Rate limited', undefined ) )

    await expect( summarizeSource( input ) ).rejects.toThrow(
      'Summary request failed: Rate limited',
    )
  } )

  it( 'lets other errors through unchanged', async () => {
    parse.mockRejectedValue( new TypeError( 'boom' ) )

    await expect( summarizeSource( input ) ).rejects.toThrow(
      'boom',
    )
  } )
} )

describe( 'SummaryResult', () => {
  it( 'accepts a valid summary and rejects a missing overview', () => {
    expect( SummaryResult.safeParse( summary ).success ).toBe( true )
    expect( SummaryResult.safeParse( { ...summary, overview: undefined } ).success ).toBe( false )
  } )
} )

describe( 'summarizeSource for an article', () => {
  beforeEach( () => {
    parse.mockResolvedValue( reply( { parsed_output: articleSummary } ) )
  } )

  it( 'returns the summary tagged as an article, with the tokens it used', async () => {
    expect( await summarizeSource( articleInput ) ).toEqual( {
      summary: { kind: 'article', ...articleSummary },
      usage: { input_tokens: 1234, output_tokens: 56 },
    } )
  } )

  it( 'sends the article locked instructions followed by the guidance', async () => {
    await summarizeSource( articleInput )

    const [ request ] = parse.mock.calls[ 0 ] as [ Record< string, unknown > ]

    expect( request.system ).toBe( buildSystemPrompt( 'Focus on pricing.', 'article' ) )
  } )

  it( 'sends the title and the Markdown as the one user message', async () => {
    await summarizeSource( articleInput )

    const [ request ] = parse.mock.calls[ 0 ] as [
      { messages: { role: string, content: string }[] },
    ]

    expect( request.messages ).toEqual( [ {
      role: 'user',
      content: '<source_content>\n# The Quiet Compounding of Small Habits\n\n'
        + '## What to do\n\nDo it daily.\n</source_content>',
    } ] )
  } )

  it( 'keeps the model, the token limit and the effort of the video call', async () => {
    await summarizeSource( articleInput )

    const [ request ] = parse.mock.calls[ 0 ] as [ Record< string, unknown > ]

    expect( request ).toMatchObject( {
      model: 'claude-sonnet-5-5',
      max_tokens: 16_000,
      output_config: { effort: 'medium', format: expect.anything() as unknown },
    } )
  } )

  it( 'throws when the output does not match the article format', async () => {
    parse.mockResolvedValue( reply( { parsed_output: null } ) )

    await expect( summarizeSource( articleInput ) )
      .rejects.toThrow( 'Summary response did not match the expected format' )
  } )

  it( 'rejects an output with timestamped points', async () => {
    parse.mockResolvedValue( reply( {
      parsed_output: { ...summary, key_points: [ { text: 'Formatters are pure', seconds: 9 } ] },
    } ) )

    await expect( summarizeSource( articleInput ) ).rejects.toThrow( SummaryError )
  } )
} )

describe( 'generateQuestions', () => {
  const questions = {
    questions: [ {
      prompt: 'What is a pure function?',
      answer: 'One without side effects.',
      passage: 'No I/O.',
    } ],
  }
  const request = { model: 'claude-haiku-5-5', system: 'Write questions.', user: 'Subject: TS' }

  beforeEach( () => {
    parse.mockResolvedValue( reply( { parsed_output: questions } ) )
  } )

  it( 'returns the parsed questions with the tokens it used', async () => {
    expect( await generateQuestions( request ) ).toEqual( {
      output: questions,
      usage: { input_tokens: 1234, output_tokens: 56 },
    } )
  } )

  it( 'passes the generation timeout and one retry', async () => {
    await generateQuestions( request )

    expect( requestOptions() ).toEqual( { timeout: 54_321, maxRetries: 1 } )
  } )

  it( 'asks for structured output at medium effort with the given prompts', async () => {
    await generateQuestions( request )

    const [ sent ] = parse.mock.calls[ 0 ] as [ Record< string, unknown > ]

    expect( sent ).toMatchObject( {
      model: 'claude-haiku-5-5',
      max_tokens: 4096,
      system: 'Write questions.',
      messages: [ { role: 'user', content: 'Subject: TS' } ],
      output_config: { effort: 'medium', format: expect.anything() as unknown },
    } )
  } )

  it.each( [
    [ { parsed_output: null }, 'Question response did not match the expected format' ],
    [ { parsed_output: { questions: [] } }, 'Question response did not match' ],
    [ { stop_reason: 'max_tokens' }, 'Question generation was cut off' ],
    [ { stop_reason: 'refusal' }, 'Question generation was declined' ],
  ] )( 'throws a MeleteError carrying the billed tokens (%j)', async ( overrides, message ) => {
    parse.mockResolvedValue( reply( overrides ) )

    const error: unknown = await generateQuestions( request ).catch( ( caught: unknown ) => caught )

    expect( error ).toBeInstanceOf( MeleteError )
    expect( ( error as MeleteError ).message ).toContain( message )
    expect( ( error as MeleteError ).usage ).toEqual( { input_tokens: 1234, output_tokens: 56 } )
  } )

  it( 'wraps API errors in a MeleteError without usage', async () => {
    parse.mockRejectedValue( new Anthropic.APIError( 429, undefined, 'Rate limited', undefined ) )

    const error: unknown = await generateQuestions( request ).catch( ( caught: unknown ) => caught )

    expect( error ).toBeInstanceOf( MeleteError )
    expect( ( error as MeleteError ).message ).toBe( 'Question generation failed: Rate limited' )
    expect( ( error as MeleteError ).usage ).toBeUndefined()
  } )

  it( 'lets other errors through unchanged', async () => {
    parse.mockRejectedValue( new TypeError( 'boom' ) )

    await expect( generateQuestions( request ) ).rejects.toThrow( TypeError )
  } )
} )

describe( 'gradeAnswer', () => {
  const grade = {
    verdict: 'partial',
    right: [ 'Named the main idea' ],
    missed: [ 'The side effects part' ],
    feedback: 'You have the gist; say what makes it pure.',
    suggested_rating: 'hard',
  }
  const request = { model: 'claude-haiku-5-5', system: 'Grade it.', user: '## Question\nWhy?' }

  beforeEach( () => {
    parse.mockResolvedValue( reply( { parsed_output: grade } ) )
  } )

  it( 'returns the parsed grade with the tokens it used', async () => {
    expect( await gradeAnswer( request ) ).toEqual( {
      output: grade,
      usage: { input_tokens: 1234, output_tokens: 56 },
    } )
  } )

  it( 'passes the grading timeout and no retries', async () => {
    await gradeAnswer( request )

    expect( requestOptions() ).toEqual( { timeout: 7_654, maxRetries: 0 } )
  } )

  it( 'asks for structured output at low effort with the given prompts', async () => {
    await gradeAnswer( request )

    const [ sent ] = parse.mock.calls.at( -1 ) as [ Record< string, unknown > ]

    expect( sent ).toMatchObject( {
      model: 'claude-haiku-5-5',
      max_tokens: 1024,
      system: 'Grade it.',
      messages: [ { role: 'user', content: '## Question\nWhy?' } ],
      output_config: { effort: 'low', format: expect.anything() as unknown },
    } )
  } )

  it.each( [
    [ { parsed_output: null }, 'Grading response did not match the expected format' ],
    [ { parsed_output: { ...grade, suggested_rating: 'easy' } }, 'Grading response did not match' ],
    [ { stop_reason: 'max_tokens' }, 'Grading was cut off' ],
    [ { stop_reason: 'refusal' }, 'Grading was declined' ],
  ] )( 'throws a MeleteError carrying the billed tokens (%j)', async ( overrides, message ) => {
    parse.mockResolvedValue( reply( { parsed_output: grade, ...overrides } ) )

    const error: unknown = await gradeAnswer( request ).catch( ( caught: unknown ) => caught )

    expect( error ).toBeInstanceOf( MeleteError )
    expect( ( error as MeleteError ).message ).toContain( message )
    expect( ( error as MeleteError ).usage ).toEqual( { input_tokens: 1234, output_tokens: 56 } )
  } )

  it( 'wraps API errors in a MeleteError without usage', async () => {
    parse.mockRejectedValue( new Anthropic.APIError( 429, undefined, 'Rate limited', undefined ) )

    const error: unknown = await gradeAnswer( request ).catch( ( caught: unknown ) => caught )

    expect( error ).toBeInstanceOf( MeleteError )
    expect( ( error as MeleteError ).message ).toBe( 'Grading failed: Rate limited' )
    expect( ( error as MeleteError ).usage ).toBeUndefined()
  } )

  it( 'lets other errors through unchanged', async () => {
    parse.mockRejectedValue( new TypeError( 'boom' ) )

    await expect( gradeAnswer( request ) ).rejects.toThrow( TypeError )
  } )
} )

describe( 'generateApprovedQuestions', () => {
  const approved = {
    concepts: [ 'c1' ],
    off_syllabus: null,
    questions: [ {
      prompt: 'What is a pure function?',
      answer: 'One without side effects.',
      passage: 'No I/O.',
      concept: 'c1',
    } ],
  }
  const request = { model: 'claude-haiku-5-5', system: 'Write questions.', user: 'Subject: TS' }

  beforeEach( () => {
    parse.mockReset()
    parse.mockResolvedValue( reply( { parsed_output: approved } ) )
  } )

  it( 'returns the parsed output with the tokens it used', async () => {
    expect( await generateApprovedQuestions( request ) ).toEqual( {
      output: approved,
      usage: { input_tokens: 1234, output_tokens: 56 },
    } )
  } )

  it( 'uses the generation timeout and structured output', async () => {
    await generateApprovedQuestions( request )

    const [ sent ] = parse.mock.calls[ 0 ] as [ Record< string, unknown > ]

    expect( requestOptions() ).toEqual( { timeout: 54_321, maxRetries: 1 } )
    expect( sent ).toMatchObject( {
      model: 'claude-haiku-5-5',
      system: 'Write questions.',
      output_config: { effort: 'medium', format: expect.anything() as unknown },
    } )
  } )

  it( 'refuses output without a concept on a question', async () => {
    parse.mockResolvedValue( reply( {
      parsed_output: { ...approved, questions: [ { prompt: 'P', answer: 'A', passage: '' } ] },
    } ) )

    await expect( generateApprovedQuestions( request ) ).rejects.toThrow( MeleteError )
  } )
} )

describe( 'mapNote', () => {
  const mapped = {
    concepts: [ 'c1' ],
    off_syllabus: null,
    labels: [ { question: 1, concept: 'c1' } ],
  }
  const request = { model: 'claude-haiku-5-5', system: 'Map it.', user: '## Concepts' }

  beforeEach( () => {
    parse.mockResolvedValue( reply( { parsed_output: mapped } ) )
  } )

  it( 'returns the parsed mapping with the tokens it used', async () => {
    expect( await mapNote( request ) ).toEqual( {
      output: mapped,
      usage: { input_tokens: 1234, output_tokens: 56 },
    } )
  } )

  it( 'uses the generation timeout, 2048 tokens and structured output', async () => {
    await mapNote( request )

    const [ sent ] = parse.mock.calls[ 0 ] as [ Record< string, unknown > ]

    expect( requestOptions() ).toEqual( { timeout: 54_321, maxRetries: 1 } )
    expect( sent ).toMatchObject( {
      model: 'claude-haiku-5-5',
      max_tokens: 2048,
      system: 'Map it.',
      messages: [ { role: 'user', content: '## Concepts' } ],
      output_config: { effort: 'medium', format: expect.anything() as unknown },
    } )
  } )

  it.each( [
    [ 'max_tokens', 'Mapping was cut off before it finished' ],
    [ 'refusal', 'Mapping was declined by the model' ],
  ] )( 'throws a MeleteError carrying the tokens on %s', async ( stopReason, message ) => {
    parse.mockResolvedValue( reply( { stop_reason: stopReason, parsed_output: null } ) )

    await expect( mapNote( request ) ).rejects.toMatchObject( {
      message,
      usage: { input_tokens: 1234, output_tokens: 56 },
    } )
  } )

  it( 'throws when the answer does not match the format', async () => {
    parse.mockResolvedValue( reply( { parsed_output: { concepts: 'c1' } } ) )

    await expect( mapNote( request ) )
      .rejects.toThrow( 'Mapping response did not match the expected format' )
  } )
} )

describe( 'suggestResources', () => {
  const suggested = {
    suggestions: [ {
      title: 'The Rust Book',
      by: 'Klabnik',
      kind: 'book',
      why: 'The standard introduction.',
      query: 'rust book',
    } ],
  }
  const request = { model: 'claude-sonnet-5-5', system: 'Suggest.', user: 'Concept: Ownership' }

  beforeEach( () => {
    parse.mockResolvedValue( reply( { parsed_output: suggested } ) )
  } )

  it( 'returns the parsed suggestions with the tokens it used', async () => {
    expect( await suggestResources( request ) ).toEqual( {
      output: suggested,
      usage: { input_tokens: 1234, output_tokens: 56 },
    } )
  } )

  it( 'gives the call 60 seconds, not the generation timeout, and no search tool', async () => {
    await suggestResources( request )

    const [ sent ] = parse.mock.calls[ 0 ] as [ Record< string, unknown > ]

    expect( requestOptions() ).toEqual( { timeout: 60_000, maxRetries: 1 } )
    expect( sent ).toMatchObject( {
      model: 'claude-sonnet-5-5',
      system: 'Suggest.',
      messages: [ { role: 'user', content: 'Concept: Ownership' } ],
      output_config: { effort: 'medium', format: expect.anything() as unknown },
    } )
    expect( sent ).not.toHaveProperty( 'tools' )
  } )

  it( 'throws a MeleteError carrying the tokens when the answer is cut off', async () => {
    parse.mockResolvedValue( reply( { stop_reason: 'max_tokens', parsed_output: null } ) )

    await expect( suggestResources( request ) ).rejects.toMatchObject( {
      message: 'Suggesting resources was cut off before it finished',
      usage: { input_tokens: 1234, output_tokens: 56 },
    } )
  } )

  it( 'throws when the answer does not match the format', async () => {
    parse.mockResolvedValue( reply( { parsed_output: { suggestions: [] } } ) )

    await expect( suggestResources( request ) )
      .rejects.toThrow( 'Suggestion response did not match the expected format' )
  } )
} )
