// Packages
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

const REQUEST_TIMEOUT_MS = 30 * 60 * 1000
const CHECK_TIMEOUT_MS = 10 * 1000
const RETRY_DELAY_MS = 5000
const PROMPT_CHARS = 200

export type TranscriptionOptions = { baseUrl: string, apiKey: string, model: string }

const TranscriptionBody = z.object( { text: z.string() } )
const ErrorBody = z.object( { error: z.object( { message: z.string() } ) } )

const endpoint = ( baseUrl: string, route: string ): string => {
  return `${ baseUrl.replace( /\/+$/, '' ) }${ route }`
}

// OpenAI echoes part of a rejected key in its message
const hideKey = ( text: string, apiKey: string ): string => text.replaceAll( apiKey, '[hidden]' )

const reasonOf = ( error: unknown, apiKey: string ): string => {
  return hideKey( error instanceof Error ? error.message : String( error ), apiKey )
}

const messageOf = async ( response: Response, apiKey: string ): Promise< string > => {
  const body = ErrorBody.safeParse( await response.json().catch( () => undefined ) )

  return body.success ? `: ${ hideKey( body.data.error.message, apiKey ) }` : ''
}

const isRetryable = ( status: number ): boolean => status === 429 || status >= 500

const send = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
  { apiKey }: TranscriptionOptions,
  timeoutMessage: string,
): Promise< Response > => {
  try {
    return await fetch( url, {
      ...init,
      headers: { Authorization: `Bearer ${ apiKey }` },
      signal: AbortSignal.timeout( timeoutMs ),
    } )
  } catch( error ) {
    if( error instanceof Error && error.name === 'TimeoutError' ) {
      throw new Error( timeoutMessage, { cause: error } )
    }

    throw new Error( `Could not reach OpenAI: ${ reasonOf( error, apiKey ) }`, { cause: error } )
  }
}

const transcribeOne = async (
  audio: Buffer,
  fileName: string,
  prompt: string | undefined,
  options: TranscriptionOptions,
): Promise< string > => {
  const url = endpoint( options.baseUrl, '/v1/audio/transcriptions' )
  const post = (): Promise< Response > => {
    const form = new FormData()

    form.append( 'file', new File( [ new Uint8Array( audio ) ], fileName, { type: 'audio/webm' } ) )
    form.append( 'model', options.model )

    if( prompt !== undefined ) {
      form.append( 'prompt', prompt )
    }

    return send(
      url,
      { method: 'POST', body: form },
      REQUEST_TIMEOUT_MS,
      options,
      'OpenAI transcription timed out after 30 minutes',
    )
  }

  let response = await post()

  if( isRetryable( response.status ) ) {
    await response.body?.cancel()
    await new Promise( ( resolve ) => setTimeout( resolve, RETRY_DELAY_MS ) )
    response = await post()
  }

  if( !response.ok ) {
    throw new Error( `OpenAI transcription failed (${ response.status })${
      await messageOf( response, options.apiKey ) }` )
  }

  const body = TranscriptionBody.safeParse( await response.json().catch( () => undefined ) )

  if( !body.success ) {
    throw new Error( 'Unexpected response from OpenAI' )
  }

  return body.data.text.trim()
}

// Pieces go in order; each after the first carries the end of the text so far as context (ADR 0074)
export const transcribePieces = async (
  pieces: string[],
  options: TranscriptionOptions,
): Promise< string > => {
  const texts: string[] = []

  for( const piece of pieces ) {
    let audio: Buffer

    try {
      audio = await readFile( piece )
    } catch( error ) {
      throw new Error(
        `Could not read audio file ${ piece }: ${ reasonOf( error, options.apiKey ) }`,
        { cause: error },
      )
    }

    const sofar = texts.join( '\n\n' )
    const prompt = sofar === '' ? undefined : sofar.slice( -PROMPT_CHARS )
    const text = await transcribeOne( audio, path.basename( piece ), prompt, options )

    if( text !== '' ) {
      texts.push( text )
    }
  }

  if( texts.length === 0 ) {
    throw new Error( 'OpenAI returned an empty transcript' )
  }

  return texts.join( '\n\n' )
}

// Free to call: reading a model costs nothing
export const checkTranscriptionModel = async ( options: TranscriptionOptions ): Promise< void > => {
  const response = await send(
    endpoint( options.baseUrl, `/v1/models/${ encodeURIComponent( options.model ) }` ),
    { method: 'GET' },
    CHECK_TIMEOUT_MS,
    options,
    'OpenAI did not answer within 10 seconds',
  )

  if( !response.ok ) {
    throw new Error( `OpenAI model check failed (${ response.status })${
      await messageOf( response, options.apiKey ) }` )
  }

  await response.body?.cancel()
}
