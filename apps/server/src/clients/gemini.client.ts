// Packages
import { z } from 'zod'

const REQUEST_TIMEOUT_MS = 15 * 60 * 1000
const CHECK_TIMEOUT_MS = 10 * 1000
const RETRY_DELAY_MS = 10 * 1000
// The model's own limit; a transcript that reaches it is kept and marked truncated (ADR 0081)
const MAX_OUTPUT_TOKENS = 65_536

export const TRANSCRIPTION_PROMPT = [
  'Transcribe the speech in this video verbatim, in the language it is spoken in.',
  'Reply with the transcript only, as plain text in paragraphs that break at natural pauses',
  'or changes of topic.',
  'Do not add timestamps, speaker labels, headings, descriptions of the picture, commentary or',
  'a summary, and do not translate.',
].join( ' ' )

export type GeminiOptions = {
  model: string
  apiKey: string
  // Replaces the Google host; the e2e fakes use it
  baseUrl?: string
}

export type GeminiTranscript = {
  text: string
  truncated: boolean
  inputTokens: number
  outputTokens: number
}

const GenerateBody = z.object( {
  candidates: z.array( z.object( {
    content: z.object( {
      parts: z.array( z.object( { text: z.string().optional(), thought: z.boolean().optional() } ) )
        .optional(),
    } ).optional(),
    finishReason: z.string().optional(),
  } ) ).optional(),
  promptFeedback: z.object( { blockReason: z.string().optional() } ).optional(),
  usageMetadata: z.object( {
    promptTokenCount: z.number().optional(),
    candidatesTokenCount: z.number().optional(),
    thoughtsTokenCount: z.number().optional(),
  } ).optional(),
} )
const ErrorBody = z.object( { error: z.object( { message: z.string() } ) } )

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com'

const base = ( { baseUrl }: GeminiOptions ): string => {
  return `${ ( baseUrl ?? DEFAULT_BASE_URL ).replace( /\/+$/, '' ) }/v1beta`
}

// The key travels in a header, but Google quotes parts of a rejected key in its messages
const hide = ( text: string, apiKey: string ): string => text.replaceAll( apiKey, '[hidden]' )

const reasonOf = ( error: unknown, apiKey: string ): string => {
  return hide( error instanceof Error ? error.message : String( error ), apiKey )
}

const messageOf = async ( response: Response, apiKey: string ): Promise< string > => {
  const body = ErrorBody.safeParse( await response.json().catch( () => undefined ) )

  return body.success ? `: ${ hide( body.data.error.message, apiKey ) }` : ''
}

const send = async (
  url: string,
  init: RequestInit,
  { apiKey }: GeminiOptions,
  timeoutMs: number,
  timeoutMessage: string,
): Promise< Response > => {
  try {
    return await fetch( url, {
      ...init,
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout( timeoutMs ),
    } )
  } catch( error ) {
    if( error instanceof Error && error.name === 'TimeoutError' ) {
      throw new Error( timeoutMessage, { cause: error } )
    }

    throw new Error( `Could not reach Gemini: ${ reasonOf( error, apiKey ) }`, { cause: error } )
  }
}

const isRetryable = ( status: number ): boolean => status === 429 || status >= 500

const requestBody = ( videoUrl: string ): string => JSON.stringify( {
  contents: [ {
    role: 'user',
    parts: [
      { fileData: { fileUri: videoUrl } },
      { text: TRANSCRIPTION_PROMPT },
    ],
  } ],
  generationConfig: {
    temperature: 0,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    mediaResolution: 'MEDIA_RESOLUTION_LOW',
    // MINIMAL was refused by gemini-3.8-flash on Vertex (ADR 0082); LOW is the level checked
    thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false },
  },
} )

const toTranscript = ( json: unknown ): GeminiTranscript => {
  const body = GenerateBody.safeParse( json )

  if( !body.success ) {
    throw new Error( 'Unexpected response from Gemini' )
  }

  const [ candidate ] = body.data.candidates ?? []

  if( candidate === undefined ) {
    const reason = body.data.promptFeedback?.blockReason

    throw new Error( reason === undefined
      ? 'Gemini returned no transcript'
      : `Gemini blocked the request (${ reason })` )
  }

  const { finishReason } = candidate

  if( finishReason !== undefined && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS' ) {
    throw new Error( `Gemini did not finish the transcript (${ finishReason })` )
  }

  const text = ( candidate.content?.parts ?? [] )
    .filter( ( part ) => part.thought !== true )
    .map( ( part ) => part.text ?? '' )
    .join( '' )
    .trim()

  if( text === '' ) {
    throw new Error( 'Gemini returned an empty transcript' )
  }

  const usage = body.data.usageMetadata

  return {
    text,
    truncated: finishReason === 'MAX_TOKENS',
    inputTokens: usage?.promptTokenCount ?? 0,
    // Thinking tokens are billed as output
    outputTokens: ( usage?.candidatesTokenCount ?? 0 ) + ( usage?.thoughtsTokenCount ?? 0 ),
  }
}

// One request for the whole video, never clipped: clips of a YouTube URL bill the full audio each
// time. The Developer API, not Vertex AI, which refuses a YouTube part from a service account
// (ADR 0083).
export const transcribeYouTube = async (
  videoUrl: string,
  options: GeminiOptions,
): Promise< GeminiTranscript > => {
  const url = `${ base( options ) }/models/${ options.model }:generateContent`
  const post = (): Promise< Response > => send(
    url,
    { method: 'POST', body: requestBody( videoUrl ) },
    options,
    REQUEST_TIMEOUT_MS,
    'Gemini transcription timed out after 15 minutes',
  )

  let response = await post()

  if( isRetryable( response.status ) ) {
    await response.body?.cancel()
    await new Promise( ( resolve ) => setTimeout( resolve, RETRY_DELAY_MS ) )
    response = await post()
  }

  if( !response.ok ) {
    throw new Error( `Gemini request failed (${ response.status })${
      await messageOf( response, options.apiKey ) }` )
  }

  return toTranscript( await response.json().catch( () => undefined ) )
}

// Reading a model resource is free
export const checkGeminiModel = async ( options: GeminiOptions ): Promise< void > => {
  const response = await send(
    `${ base( options ) }/models/${ options.model }`,
    { method: 'GET' },
    options,
    CHECK_TIMEOUT_MS,
    'Gemini did not answer within 10 seconds',
  )

  if( !response.ok ) {
    throw new Error( `Gemini model check failed (${ response.status })${
      await messageOf( response, options.apiKey ) }` )
  }

  await response.body?.cancel()
}
