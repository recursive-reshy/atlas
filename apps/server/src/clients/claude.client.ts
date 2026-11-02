// Packages
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
// Shared
import {
  MeleteGradeOutput,
  MeleteQuestionsOutput,
  SourceDocument,
} from '@atlas/shared'
// Config
import { config } from '../config.js'
// Errors
import { MeleteError } from '../errors.js'
// Summarizer
import { buildSystemPrompt } from '../summarizer/prompts.js'
import { SUMMARY_MAX_TOKENS } from '../summarizer/models.js'

const Timestamped = z.object( {
  text: z.string(),
  seconds: z.number(),
} )

export const SummaryResult = z.object( {
  overview: z.string(),
  key_points: z.array( Timestamped ),
  quotes: z.array( Timestamped ),
  tags: z.array( z.string() ),
} )
export type SummaryResult = z.infer< typeof SummaryResult >

export const ArticleSummaryResult = z.object( {
  overview: z.string(),
  key_points: z.array( z.string() ),
  quotes: z.array( z.string() ),
  tags: z.array( z.string() ),
} )
export type ArticleSummaryResult = z.infer< typeof ArticleSummaryResult >

export type Summary =
  | ( { kind: 'video' } & SummaryResult )
  | ( { kind: 'article' } & ArticleSummaryResult )

export interface TokenUsage {
  input_tokens: number
  output_tokens: number
}

export interface SummaryOutcome {
  summary: Summary
  usage: TokenUsage
}

interface SummaryInput {
  document: SourceDocument
  model: string
  guidance: string
}

export class SummaryError extends Error {
  readonly usage: TokenUsage | undefined

  constructor( message: string, options: { usage?: TokenUsage, cause?: unknown } = {} ) {
    super( message, { cause: options.cause } )
    this.name = 'SummaryError'
    this.usage = options.usage
  }
}

const toUserMessage = ( document: SourceDocument ): string => {
  return document.kind === 'video'
    ? `# ${ document.meta.title }\n\n${ document.text }`
    : `# ${ document.meta.title }\n\n${ document.markdown }`
}

const toSummary = ( document: SourceDocument, output: unknown ): Summary | undefined => {
  if( document.kind === 'video' ) {
    const parsed = SummaryResult.safeParse( output )

    return parsed.success ? { kind: 'video', ...parsed.data } : undefined
  }

  const parsed = ArticleSummaryResult.safeParse( output )

  return parsed.success ? { kind: 'article', ...parsed.data } : undefined
}

export const summarizeSource = async (
  { document, model, guidance }: SummaryInput,
): Promise< SummaryOutcome > => {
  const client = new Anthropic( {
    apiKey: config.anthropicApiKey,
    timeout: config.summaryTimeoutMs,
    maxRetries: 1,
  } )
  const format = document.kind === 'video'
    ? zodOutputFormat( SummaryResult )
    : zodOutputFormat( ArticleSummaryResult )

  try {
    const response = await client.messages.parse( {
      model,
      max_tokens: SUMMARY_MAX_TOKENS,
      system: buildSystemPrompt( guidance, document.kind ),
      messages: [ { role: 'user', content: toUserMessage( document ) } ],
      output_config: { effort: 'medium', format },
    } )
    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    }

    if( response.stop_reason === 'max_tokens' ) {
      throw new SummaryError( 'Summary was cut off before it finished', { usage } )
    }

    if( response.stop_reason === 'refusal' ) {
      throw new SummaryError( 'Summary was declined by the model', { usage } )
    }

    const summary = toSummary( document, response.parsed_output )

    if( summary === undefined ) {
      throw new SummaryError( 'Summary response did not match the expected format', { usage } )
    }

    return { summary, usage }
  } catch( error ) {
    if( error instanceof Anthropic.APIError ) {
      throw new SummaryError( `Summary request failed: ${ error.message }`, { cause: error } )
    }

    throw error
  }
}

interface MeleteCall {
  model: string
  system: string
  user: string
}

export interface QuestionsOutcome {
  output: MeleteQuestionsOutput
  usage: TokenUsage
}

const QUESTIONS_MAX_TOKENS = 4096

export const generateQuestions = async (
  { model, system, user }: MeleteCall,
): Promise< QuestionsOutcome > => {
  const client = new Anthropic( {
    apiKey: config.anthropicApiKey,
    timeout: config.melete.generationTimeoutMs,
    maxRetries: 1,
  } )

  try {
    const response = await client.messages.parse( {
      model,
      max_tokens: QUESTIONS_MAX_TOKENS,
      system,
      messages: [ { role: 'user', content: user } ],
      output_config: { effort: 'medium', format: zodOutputFormat( MeleteQuestionsOutput ) },
    } )
    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    }

    if( response.stop_reason === 'max_tokens' ) {
      throw new MeleteError( 'Question generation was cut off before it finished', { usage } )
    }

    if( response.stop_reason === 'refusal' ) {
      throw new MeleteError( 'Question generation was declined by the model', { usage } )
    }

    const parsed = MeleteQuestionsOutput.safeParse( response.parsed_output )

    if( !parsed.success ) {
      throw new MeleteError( 'Question response did not match the expected format', { usage } )
    }

    return { output: parsed.data, usage }
  } catch( error ) {
    if( error instanceof Anthropic.APIError ) {
      throw new MeleteError( `Question generation failed: ${ error.message }`, { cause: error } )
    }

    throw error
  }
}

export interface GradeOutcome {
  output: MeleteGradeOutput
  usage: TokenUsage
}

const GRADE_MAX_TOKENS = 1024

// A retry would double the wait on the phone, so there is none
export const gradeAnswer = async (
  { model, system, user }: MeleteCall,
): Promise< GradeOutcome > => {
  const client = new Anthropic( {
    apiKey: config.anthropicApiKey,
    timeout: config.melete.gradingTimeoutMs,
    maxRetries: 0,
  } )

  try {
    const response = await client.messages.parse( {
      model,
      max_tokens: GRADE_MAX_TOKENS,
      system,
      messages: [ { role: 'user', content: user } ],
      output_config: { effort: 'low', format: zodOutputFormat( MeleteGradeOutput ) },
    } )
    const usage = {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    }

    if( response.stop_reason === 'max_tokens' ) {
      throw new MeleteError( 'Grading was cut off before it finished', { usage } )
    }

    if( response.stop_reason === 'refusal' ) {
      throw new MeleteError( 'Grading was declined by the model', { usage } )
    }

    const parsed = MeleteGradeOutput.safeParse( response.parsed_output )

    if( !parsed.success ) {
      throw new MeleteError( 'Grading response did not match the expected format', { usage } )
    }

    return { output: parsed.data, usage }
  } catch( error ) {
    if( error instanceof Anthropic.APIError ) {
      throw new MeleteError( `Grading failed: ${ error.message }`, { cause: error } )
    }

    throw error
  }
}
