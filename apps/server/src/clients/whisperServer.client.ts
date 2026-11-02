// Packages
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
// Shared
import { Segment } from '@atlas/shared'

const REQUEST_TIMEOUT_MS = 3_600_000
const HEALTH_TIMEOUT_MS = 3_000
const UNEXPECTED_RESPONSE = 'Unexpected response from whisper-server'

const ErrorBody = z.object( { error: z.string() } )

const InferenceBody = z.object( {
  segments: z.array( z.object( {
    start: z.number(),
    end: z.number(),
    text: z.string(),
  } ) ),
} )

export const transcribeAudio = async (
  audioPath: string,
  whisperUrl: string,
): Promise< Segment[] > => {
  let audio: Buffer

  try {
    audio = await readFile( audioPath )
  } catch( error ) {
    const reason = error instanceof Error ? error.message : String( error )

    throw new Error( `Could not read audio file ${ audioPath }: ${ reason }`, { cause: error } )
  }

  const body = new FormData()
  body.append( 'file', new Blob( [ new Uint8Array( audio ) ] ), path.basename( audioPath ) )
  body.append( 'response_format', 'verbose_json' )

  let response: Response

  try {
    response = await fetch( new URL( '/inference', whisperUrl ), {
      method: 'POST',
      body,
      signal: AbortSignal.timeout( REQUEST_TIMEOUT_MS ),
    } )
  } catch( error ) {
    if( error instanceof Error && error.name === 'TimeoutError' ) {
      throw new Error( 'whisper-server did not finish within 60 minutes', { cause: error } )
    }

    const reason = error instanceof Error ? error.message : String( error )

    throw new Error(
      `Could not reach whisper-server at ${ whisperUrl }: ${ reason }`,
      { cause: error },
    )
  }

  if( !response.ok ) {
    throw new Error( `whisper-server returned ${ response.status }` )
  }

  const json: unknown = await response.json().catch( () => undefined )

  const errorBody = ErrorBody.safeParse( json )

  if( errorBody.success ) {
    throw new Error( `whisper-server failed: ${ errorBody.data.error }` )
  }

  const parsed = InferenceBody.safeParse( json )

  if( !parsed.success ) {
    throw new Error( UNEXPECTED_RESPONSE )
  }

  const segments = z.array( Segment ).safeParse(
    parsed.data.segments.map( ( segment ) => ( { ...segment, text: segment.text.trim() } ) ),
  )

  if( !segments.success ) {
    throw new Error( UNEXPECTED_RESPONSE )
  }

  return segments.data
}

// Any 2xx from /health means the server is up (the real whisper.cpp build answers 200).
export const checkWhisperHealth = async ( whisperUrl: string ): Promise< void > => {
  let response: Response

  try {
    response = await fetch( new URL( '/health', whisperUrl ), {
      signal: AbortSignal.timeout( HEALTH_TIMEOUT_MS ),
    } )
  } catch( error ) {
    if( error instanceof Error && error.name === 'TimeoutError' ) {
      throw new Error( 'whisper-server did not answer within 3 seconds', { cause: error } )
    }

    const reason = error instanceof Error ? error.message : String( error )

    throw new Error(
      `Could not reach whisper-server at ${ whisperUrl }: ${ reason }`,
      { cause: error },
    )
  }

  await response.body?.cancel()

  if( !response.ok ) {
    throw new Error( `whisper-server answered ${ response.status }` )
  }
}
