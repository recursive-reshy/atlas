// Packages
import { GoogleAuth } from 'google-auth-library'
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
  project: string
  location: string
  model: string
  getAccessToken: () => Promise< string >
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

const host = ( { location, baseUrl }: GeminiOptions ): string => {
  if( baseUrl !== undefined ) {
    return baseUrl.replace( /\/+$/, '' )
  }

  return location === 'global'
    ? 'https://aiplatform.googleapis.com'
    : `https://${ location }-aiplatform.googleapis.com`
}

const hide = ( text: string, token: string ): string => text.replaceAll( token, '[hidden]' )

const reasonOf = ( error: unknown, token: string ): string => {
  return hide( error instanceof Error ? error.message : String( error ), token )
}

const tokenFor = async ( { getAccessToken }: GeminiOptions ): Promise< string > => {
  try {
    return await getAccessToken()
  } catch( error ) {
    const reason = error instanceof Error ? error.message : String( error )

    throw new Error( `Could not get Google credentials: ${ reason }`, { cause: error } )
  }
}

const messageOf = async ( response: Response, token: string ): Promise< string > => {
  const body = ErrorBody.safeParse( await response.json().catch( () => undefined ) )

  return body.success ? `: ${ hide( body.data.error.message, token ) }` : ''
}

const send = async (
  url: string,
  init: RequestInit,
  token: string,
  timeoutMs: number,
  timeoutMessage: string,
): Promise< Response > => {
  try {
    return await fetch( url, {
      ...init,
      headers: { Authorization: `Bearer ${ token }`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout( timeoutMs ),
    } )
  } catch( error ) {
    if( error instanceof Error && error.name === 'TimeoutError' ) {
      throw new Error( timeoutMessage, { cause: error } )
    }

    throw new Error( `Could not reach Gemini: ${ reasonOf( error, token ) }`, { cause: error } )
  }
}

const isRetryable = ( status: number ): boolean => status === 429 || status >= 500

const requestBody = ( videoUrl: string ): string => JSON.stringify( {
  contents: [ {
    role: 'user',
    parts: [
      { fileData: { fileUri: videoUrl, mimeType: 'video/mp4' } },
      { text: TRANSCRIPTION_PROMPT },
    ],
  } ],
  generationConfig: {
    temperature: 0,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    mediaResolution: 'MEDIA_RESOLUTION_LOW',
    // MINIMAL is refused by gemini-3.8-flash; LOW is the least it accepts
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
export const transcribeYouTube = async (
  videoUrl: string,
  options: GeminiOptions,
): Promise< GeminiTranscript > => {
  const token = await tokenFor( options )
  const { project, location, model } = options
  const url = `${ host( options ) }/v1/projects/${ project }/locations/${ location }`
    + `/publishers/google/models/${ model }:generateContent`
  const post = (): Promise< Response > => send(
    url,
    { method: 'POST', body: requestBody( videoUrl ) },
    token,
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
      await messageOf( response, token ) }` )
  }

  return toTranscript( await response.json().catch( () => undefined ) )
}

// Reading a model resource is free
export const checkGeminiModel = async ( options: GeminiOptions ): Promise< void > => {
  const token = await tokenFor( options )
  const response = await send(
    `${ host( options ) }/v1/publishers/google/models/${ options.model }`,
    { method: 'GET' },
    token,
    CHECK_TIMEOUT_MS,
    'Gemini did not answer within 10 seconds',
  )

  if( !response.ok ) {
    throw new Error( `Gemini model check failed (${ response.status })${
      await messageOf( response, token ) }` )
  }

  await response.body?.cancel()
}

let auth: GoogleAuth | undefined

// Application Default Credentials: the VM's service account, or `gcloud auth application-default
// login` on the Mac. Created on first use so importing this file never looks for credentials.
export const googleAccessToken = async (): Promise< string > => {
  auth ??= new GoogleAuth( { scopes: [ 'https://www.googleapis.com/auth/cloud-platform' ] } )

  const token = await auth.getAccessToken()

  if( !token ) {
    throw new Error( 'Google gave no access token' )
  }

  return token
}
