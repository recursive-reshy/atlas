// Packages
import { readFile } from 'node:fs/promises'
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest'
// Clients
import { checkTranscriptionModel, transcribePieces } from './openaiTranscription.client.js'

vi.mock( 'node:fs/promises' )

const options = {
  baseUrl: 'https://api.openai.test',
  apiKey: 'sk-secret-key',
  model: 'gpt-transcribe',
}

const jsonResponse = ( body: unknown, status: number = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

let fetchMock: MockInstance< typeof fetch >

const urlOf = ( call: number ): string => {
  const input = fetchMock.mock.calls[ call ]?.[ 0 ]

  return input instanceof Request ? input.url : String( input )
}

const formOf = ( call: number ): FormData => {
  const init = fetchMock.mock.calls[ call ]?.[ 1 ]

  if( !( init?.body instanceof FormData ) ) {
    throw new Error( 'The request had no form body' )
  }

  return init.body
}

beforeEach( () => {
  vi.mocked( readFile ).mockResolvedValue( Buffer.from( 'webm bytes' ) )
  fetchMock = vi.spyOn( globalThis, 'fetch' )
  fetchMock.mockImplementation( () => {
    return Promise.resolve( jsonResponse( { text: ' Hello there. ' } ) )
  } )
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'transcribePieces', () => {
  it( 'posts one piece as multipart form data with the key and the model', async () => {
    const text = await transcribePieces( [ '/work/job/encoded.webm' ], options )

    expect( text ).toBe( 'Hello there.' )
    expect( fetchMock ).toHaveBeenCalledOnce()
    expect( urlOf( 0 ) )
      .toBe( 'https://api.openai.test/v1/audio/transcriptions' )

    const init = fetchMock.mock.calls[ 0 ]?.[ 1 ]
    const form = formOf( 0 )
    const file = form.get( 'file' )

    expect( init?.method ).toBe( 'POST' )
    expect( new Headers( init?.headers ).get( 'authorization' ) ).toBe( 'Bearer sk-secret-key' )
    expect( form.get( 'model' ) ).toBe( 'gpt-transcribe' )
    expect( form.has( 'prompt' ) ).toBe( false )
    expect( file instanceof File ? file.name : '' ).toBe( 'encoded.webm' )
  } )

  it( 'copes with a trailing slash on the base URL', async () => {
    await transcribePieces( [ '/w/a.webm' ], { ...options, baseUrl: 'https://api.openai.test/' } )

    expect( urlOf( 0 ) )
      .toBe( 'https://api.openai.test/v1/audio/transcriptions' )
  } )

  it( 'sends the pieces in order, carrying the last 200 characters as the prompt', async () => {
    const first = `${ 'a'.repeat( 300 ) }END`
    fetchMock
      .mockResolvedValueOnce( jsonResponse( { text: first } ) )
      .mockResolvedValueOnce( jsonResponse( { text: 'second' } ) )
      .mockResolvedValueOnce( jsonResponse( { text: 'third' } ) )

    const text = await transcribePieces( [ '/w/01.webm', '/w/02.webm', '/w/03.webm' ], options )

    expect( vi.mocked( readFile ).mock.calls.map( ( [ file ] ) => file ) )
      .toEqual( [ '/w/01.webm', '/w/02.webm', '/w/03.webm' ] )
    expect( formOf( 0 ).has( 'prompt' ) ).toBe( false )
    expect( formOf( 1 ).get( 'prompt' ) ).toBe( first.slice( -200 ) )
    expect( formOf( 2 ).get( 'prompt' ) ).toBe( `${ first }\n\nsecond`.slice( -200 ) )
    expect( text ).toBe( `${ first }\n\nsecond\n\nthird` )
  } )

  it( 'reports an unreadable audio file', async () => {
    vi.mocked( readFile ).mockRejectedValue( new Error( 'ENOENT: no such file' ) )

    await expect( transcribePieces( [ '/w/a.webm' ], options ) ).rejects.toThrow(
      'Could not read audio file /w/a.webm: ENOENT: no such file',
    )
    expect( fetchMock ).not.toHaveBeenCalled()
  } )

  it( 'fails with the status and the API\'s message on a 401, without the key', async () => {
    fetchMock.mockResolvedValue( jsonResponse(
      { error: { message: 'Incorrect API key provided: sk-secret-key.' } },
      401,
    ) )

    const error = await transcribePieces( [ '/w/a.webm' ], options ).catch( ( e: unknown ) => e )

    expect( error ).toBeInstanceOf( Error )
    expect( ( error as Error ).message )
      .toBe( 'OpenAI transcription failed (401): Incorrect API key provided: [hidden].' )
    expect( fetchMock ).toHaveBeenCalledOnce()
  } )

  it( 'fails with just the status when the error body is not the API\'s', async () => {
    fetchMock.mockResolvedValue( new Response( 'gateway down', { status: 400 } ) )

    await expect( transcribePieces( [ '/w/a.webm' ], options ) )
      .rejects.toThrow( 'OpenAI transcription failed (400)' )
  } )

  it.each( [ 429, 500, 503 ] )( 'retries once after 5 seconds on a %i', async ( status ) => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce( jsonResponse( { error: { message: 'busy' } }, status ) )
      .mockResolvedValueOnce( jsonResponse( { text: 'worked' } ) )

    const pending = transcribePieces( [ '/w/a.webm' ], options )

    await vi.advanceTimersByTimeAsync( 4999 )
    expect( fetchMock ).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync( 1 )

    expect( await pending ).toBe( 'worked' )
    expect( fetchMock ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'fails when the retry fails too', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation( () => {
      return Promise.resolve( jsonResponse( { error: { message: 'busy' } }, 429 ) )
    } )

    const pending = transcribePieces( [ '/w/a.webm' ], options )
    const assertion = expect( pending ).rejects.toThrow( 'OpenAI transcription failed (429): busy' )

    await vi.advanceTimersByTimeAsync( 5000 )
    await assertion
    expect( fetchMock ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'does not retry a 400', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { error: { message: 'bad audio' } }, 400 ) )

    await expect( transcribePieces( [ '/w/a.webm' ], options ) ).rejects.toThrow( 'bad audio' )
    expect( fetchMock ).toHaveBeenCalledOnce()
  } )

  it( 'times out after 30 minutes with a readable message', async () => {
    fetchMock.mockRejectedValue( new DOMException( 'signal timed out', 'TimeoutError' ) )

    await expect( transcribePieces( [ '/w/a.webm' ], options ) )
      .rejects.toThrow( 'OpenAI transcription timed out after 30 minutes' )
  } )

  it( 'asks fetch to time out after 30 minutes', async () => {
    const timeout = vi.spyOn( AbortSignal, 'timeout' )

    await transcribePieces( [ '/w/a.webm' ], options )

    expect( timeout ).toHaveBeenCalledWith( 30 * 60 * 1000 )
  } )

  it( 'says it could not reach OpenAI, without the key', async () => {
    fetchMock.mockRejectedValue( new TypeError( 'fetch failed for sk-secret-key' ) )

    const error = await transcribePieces( [ '/w/a.webm' ], options ).catch( ( e: unknown ) => e )

    expect( ( error as Error ).message ).toBe( 'Could not reach OpenAI: fetch failed for [hidden]' )
  } )

  it( 'fails on a response that is not { text }', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { segments: [] } ) )

    await expect( transcribePieces( [ '/w/a.webm' ], options ) )
      .rejects.toThrow( 'Unexpected response from OpenAI' )
  } )

  it( 'fails on an empty transcript', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { text: '  ' } ) )

    await expect( transcribePieces( [ '/w/a.webm' ], options ) )
      .rejects.toThrow( 'OpenAI returned an empty transcript' )
  } )

  it( 'skips an empty piece when others have text', async () => {
    fetchMock
      .mockResolvedValueOnce( jsonResponse( { text: 'one' } ) )
      .mockResolvedValueOnce( jsonResponse( { text: '' } ) )
      .mockResolvedValueOnce( jsonResponse( { text: 'three' } ) )

    expect( await transcribePieces( [ '/w/1', '/w/2', '/w/3' ], options ) ).toBe( 'one\n\nthree' )
  } )
} )

describe( 'checkTranscriptionModel', () => {
  it( 'asks for the model with the key and passes on a 200', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { id: 'gpt-transcribe' } ) )

    await expect( checkTranscriptionModel( options ) ).resolves.toBeUndefined()

    expect( urlOf( 0 ) )
      .toBe( 'https://api.openai.test/v1/models/gpt-transcribe' )
    expect( new Headers( fetchMock.mock.calls[ 0 ]?.[ 1 ]?.headers ).get( 'authorization' ) )
      .toBe( 'Bearer sk-secret-key' )
  } )

  it( 'throws the status and message when the model is not found', async () => {
    fetchMock.mockResolvedValue( jsonResponse(
      { error: { message: 'The model does not exist' } },
      404,
    ) )

    await expect( checkTranscriptionModel( options ) )
      .rejects.toThrow( 'OpenAI model check failed (404): The model does not exist' )
  } )

  it( 'throws on a rejected key without printing it', async () => {
    fetchMock.mockResolvedValue( jsonResponse(
      { error: { message: 'Bad key sk-secret-key' } },
      401,
    ) )

    await expect( checkTranscriptionModel( options ) )
      .rejects.toThrow( 'OpenAI model check failed (401): Bad key [hidden]' )
  } )

  it( 'says it could not reach OpenAI', async () => {
    fetchMock.mockRejectedValue( new TypeError( 'fetch failed' ) )

    await expect( checkTranscriptionModel( options ) )
      .rejects.toThrow( 'Could not reach OpenAI: fetch failed' )
  } )

  it( 'says so when OpenAI does not answer in time', async () => {
    fetchMock.mockRejectedValue( new DOMException( 'timed out', 'TimeoutError' ) )

    await expect( checkTranscriptionModel( options ) )
      .rejects.toThrow( 'OpenAI did not answer within 10 seconds' )
  } )
} )
