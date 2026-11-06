// Packages
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
import {
  TRANSCRIPTION_PROMPT,
  checkGeminiModel,
  transcribeYouTube,
} from './gemini.client.js'

const URL_OF_VIDEO = 'https://www.youtube.com/watch?v=abc123'
const KEY = 'AIza-gemini-secret-key'

const options = {
  model: 'gemini-3.8-flash',
  apiKey: KEY,
}

type Candidate = { text?: string, finishReason?: string, thought?: boolean }

const reply = ( candidates: Candidate[], extra: Record< string, unknown > = {} ): unknown => ( {
  candidates: [ {
    content: { parts: candidates.map( ( { text, thought } ) => ( { text, thought } ) ) },
    finishReason: candidates.at( -1 )?.finishReason ?? 'STOP',
  } ],
  usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, thoughtsTokenCount: 50 },
  ...extra,
} )

const jsonResponse = ( body: unknown, status: number = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

let fetchMock: MockInstance< typeof fetch >

const urlOf = ( call: number ): string => {
  const input = fetchMock.mock.calls[ call ]?.[ 0 ]

  return input instanceof Request ? input.url : String( input )
}

type RequestJson = {
  contents: unknown
  generationConfig: unknown
}

const bodyOf = ( call: number ): RequestJson => {
  const body = fetchMock.mock.calls[ call ]?.[ 1 ]?.body

  return JSON.parse( typeof body === 'string' ? body : '{}' ) as RequestJson
}

beforeEach( () => {
  fetchMock = vi.spyOn( globalThis, 'fetch' )
  fetchMock.mockImplementation( () => {
    const text = ' Hello there.\n\nSecond paragraph. '

    return Promise.resolve( jsonResponse( reply( [ { text } ] ) ) )
  } )
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'transcribeYouTube request', () => {
  it( 'posts to generateContent on the Developer API with the key in a header', async () => {
    await transcribeYouTube( URL_OF_VIDEO, options )

    const init = fetchMock.mock.calls[ 0 ]?.[ 1 ]

    expect( fetchMock ).toHaveBeenCalledOnce()
    expect( urlOf( 0 ) ).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
    )
    expect( urlOf( 0 ) ).not.toContain( KEY )
    expect( init?.method ).toBe( 'POST' )

    const headers = new Headers( init?.headers )

    expect( headers.get( 'x-goog-api-key' ) ).toBe( KEY )
    expect( headers.get( 'content-type' ) ).toBe( 'application/json' )
    expect( headers.get( 'authorization' ) ).toBeNull()
  } )

  it( 'uses a given base URL instead of the Google host', async () => {
    await transcribeYouTube( URL_OF_VIDEO, { ...options, baseUrl: 'http://fakes:4000/' } )

    expect( urlOf( 0 ) )
      .toBe( 'http://fakes:4000/v1beta/models/gemini-3.8-flash:generateContent' )
  } )

  it( 'sends one user turn: the video as fileData, then the prompt', async () => {
    await transcribeYouTube( URL_OF_VIDEO, options )

    expect( bodyOf( 0 ).contents ).toEqual( [ {
      role: 'user',
      parts: [
        { fileData: { fileUri: URL_OF_VIDEO } },
        { text: TRANSCRIPTION_PROMPT },
      ],
    } ] )
  } )

  it( 'asks for low resolution, no randomness, the full output and low thinking', async () => {
    await transcribeYouTube( URL_OF_VIDEO, options )

    expect( bodyOf( 0 ).generationConfig ).toEqual( {
      temperature: 0,
      maxOutputTokens: 65_536,
      mediaResolution: 'MEDIA_RESOLUTION_LOW',
      thinkingConfig: { thinkingLevel: 'LOW', includeThoughts: false },
    } )
  } )

  it( 'asks for a verbatim transcript with no timestamps or commentary', () => {
    expect( TRANSCRIPTION_PROMPT ).toMatch( /verbatim/i )
    expect( TRANSCRIPTION_PROMPT ).toMatch( /timestamps/i )
    expect( TRANSCRIPTION_PROMPT ).toMatch( /original language|language it is spoken/i )
  } )
} )

describe( 'transcribeYouTube response', () => {
  it( 'returns the trimmed text, not truncated, with the tokens', async () => {
    expect( await transcribeYouTube( URL_OF_VIDEO, options ) ).toEqual( {
      text: 'Hello there.\n\nSecond paragraph.',
      truncated: false,
      inputTokens: 1200,
      outputTokens: 350,
    } )
  } )

  it( 'joins the text parts and leaves out thought parts', async () => {
    fetchMock.mockResolvedValue( jsonResponse( reply( [
      { text: 'Thinking about it', thought: true },
      { text: 'First. ' },
      { text: 'Second.' },
    ] ) ) )

    expect( ( await transcribeYouTube( URL_OF_VIDEO, options ) ).text ).toBe( 'First. Second.' )
  } )

  it( 'counts only candidate tokens when there are no thought tokens', async () => {
    fetchMock.mockResolvedValue( jsonResponse( reply(
      [ { text: 'Hi' } ],
      { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4 } },
    ) ) )

    expect( await transcribeYouTube( URL_OF_VIDEO, options ) )
      .toMatchObject( { inputTokens: 10, outputTokens: 4 } )
  } )

  it( 'keeps the text and marks it truncated when the output limit was reached', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse( reply( [ { text: 'Part one.', finishReason: 'MAX_TOKENS' } ] ) ),
    )

    expect( await transcribeYouTube( URL_OF_VIDEO, options ) )
      .toMatchObject( { text: 'Part one.', truncated: true } )
  } )

  it.each( [ 'SAFETY', 'RECITATION', 'PROHIBITED_CONTENT', 'OTHER' ] )(
    'fails readably when Gemini stops with %s',
    async ( finishReason ) => {
      fetchMock.mockResolvedValue( jsonResponse( reply( [ { text: 'Some', finishReason } ] ) ) )

      await expect( transcribeYouTube( URL_OF_VIDEO, options ) )
        .rejects.toThrow( `Gemini did not finish the transcript (${ finishReason })` )
    },
  )

  it( 'fails when the prompt was blocked', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { promptFeedback: { blockReason: 'SAFETY' } } ) )

    await expect( transcribeYouTube( URL_OF_VIDEO, options ) )
      .rejects.toThrow( 'Gemini blocked the request (SAFETY)' )
  } )

  it( 'fails when there is no candidate', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { candidates: [] } ) )

    await expect( transcribeYouTube( URL_OF_VIDEO, options ) )
      .rejects.toThrow( 'Gemini returned no transcript' )
  } )

  it( 'fails when the text is empty', async () => {
    fetchMock.mockResolvedValue( jsonResponse( reply( [ { text: '  ' } ] ) ) )

    await expect( transcribeYouTube( URL_OF_VIDEO, options ) )
      .rejects.toThrow( 'Gemini returned an empty transcript' )
  } )

  it( 'fails on a response of the wrong shape', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { candidates: 'many' } ) )

    await expect( transcribeYouTube( URL_OF_VIDEO, options ) )
      .rejects.toThrow( 'Unexpected response from Gemini' )
  } )
} )

describe( 'transcribeYouTube errors and retries', () => {
  const failure = (
    status: number,
    message: string = 'Video unavailable',
    code: string = 'INVALID_ARGUMENT',
  ): Response => jsonResponse( { error: { code: status, message, status: code } }, status )

  it( 'reports a 400 with Google\'s reason and does not retry', async () => {
    fetchMock.mockResolvedValue( failure( 400, 'Cannot fetch content from the provided URL.' ) )

    await expect( transcribeYouTube( URL_OF_VIDEO, options ) ).rejects.toThrow(
      'Gemini request failed (400): Cannot fetch content from the provided URL.',
    )
    expect( fetchMock ).toHaveBeenCalledOnce()
  } )

  it.each( [ 429, 500, 503 ] )( 'retries once after 10 seconds on %i', async ( status ) => {
    vi.useFakeTimers()
    fetchMock
      .mockResolvedValueOnce( failure( status, 'Try later', 'UNAVAILABLE' ) )
      .mockResolvedValueOnce( jsonResponse( reply( [ { text: 'Done.' } ] ) ) )

    const result = transcribeYouTube( URL_OF_VIDEO, options )

    await vi.advanceTimersByTimeAsync( 9_999 )
    expect( fetchMock ).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync( 1 )

    expect( ( await result ).text ).toBe( 'Done.' )
    expect( fetchMock ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'fails with the second answer when the retry fails too', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation( () => {
      return Promise.resolve( failure( 503, 'Overloaded', 'UNAVAILABLE' ) )
    } )

    const result = transcribeYouTube( URL_OF_VIDEO, options )
    const assertion = expect( result ).rejects.toThrow( 'Gemini request failed (503): Overloaded' )

    await vi.advanceTimersByTimeAsync( 10_000 )
    await assertion
    expect( fetchMock ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'reports a status with no readable body', async () => {
    fetchMock.mockResolvedValue( new Response( 'nope', { status: 403 } ) )

    await expect( transcribeYouTube( URL_OF_VIDEO, options ) )
      .rejects.toThrow( 'Gemini request failed (403)' )
  } )

  it( 'reports a timeout after 15 minutes', async () => {
    fetchMock.mockRejectedValue( new DOMException( 'timed out', 'TimeoutError' ) )

    await expect( transcribeYouTube( URL_OF_VIDEO, options ) )
      .rejects.toThrow( 'Gemini transcription timed out after 15 minutes' )
  } )

  it( 'sets a 15 minute abort signal on the request', async () => {
    const timeout = vi.spyOn( AbortSignal, 'timeout' )

    await transcribeYouTube( URL_OF_VIDEO, options )

    expect( timeout ).toHaveBeenCalledWith( 15 * 60 * 1000 )
  } )

  it( 'reports a network failure', async () => {
    fetchMock.mockRejectedValue( new Error( 'connect ECONNREFUSED' ) )

    await expect( transcribeYouTube( URL_OF_VIDEO, options ) )
      .rejects.toThrow( 'Could not reach Gemini: connect ECONNREFUSED' )
  } )

  it( 'reports a rejected key with Google\'s reason', async () => {
    fetchMock.mockResolvedValue( failure( 400, 'API key not valid.', 'INVALID_ARGUMENT' ) )

    await expect( transcribeYouTube( URL_OF_VIDEO, options ) )
      .rejects.toThrow( 'Gemini request failed (400): API key not valid.' )
  } )

  it( 'never puts the API key in an error', async () => {
    fetchMock.mockResolvedValue( failure( 403, `Key ${ KEY } is blocked`, 'PERMISSION_DENIED' ) )

    const failed = transcribeYouTube( URL_OF_VIDEO, options )

    await expect( failed ).rejects.toThrow( 'Gemini request failed (403): Key [hidden] is blocked' )
    await expect( failed ).rejects.not.toThrow( /AIza/ )

    fetchMock.mockRejectedValue( new Error( `bad header x-goog-api-key: ${ KEY }` ) )
    await expect( transcribeYouTube( URL_OF_VIDEO, options ) ).rejects.not.toThrow( /AIza/ )
  } )
} )

describe( 'checkGeminiModel', () => {
  it( 'reads the model resource on the Developer API with the key in a header', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { name: 'models/gemini-3.8-flash' } ) )

    await expect( checkGeminiModel( options ) ).resolves.toBeUndefined()

    const init = fetchMock.mock.calls[ 0 ]?.[ 1 ]

    expect( urlOf( 0 ) )
      .toBe( 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash' )
    expect( urlOf( 0 ) ).not.toContain( KEY )
    expect( init?.method ).toBe( 'GET' )
    expect( new Headers( init?.headers ).get( 'x-goog-api-key' ) ).toBe( KEY )
  } )

  it( 'uses a given base URL', async () => {
    fetchMock.mockImplementation( () => Promise.resolve( jsonResponse( {} ) ) )

    await checkGeminiModel( { ...options, baseUrl: 'http://fakes:4000' } )

    expect( urlOf( 0 ) ).toBe( 'http://fakes:4000/v1beta/models/gemini-3.8-flash' )
  } )

  it( 'fails readably for an unknown model', async () => {
    fetchMock.mockResolvedValue( jsonResponse(
      { error: { code: 404, message: 'models/nope is not found.', status: 'NOT_FOUND' } },
      404,
    ) )

    await expect( checkGeminiModel( options ) )
      .rejects.toThrow( 'Gemini model check failed (404): models/nope is not found.' )
  } )

  it( 'fails readably for a rejected key, without the key', async () => {
    fetchMock.mockResolvedValue( jsonResponse(
      { error: { code: 400, message: `API key not valid: ${ KEY }`, status: 'INVALID_ARGUMENT' } },
      400,
    ) )

    await expect( checkGeminiModel( options ) )
      .rejects.toThrow( 'Gemini model check failed (400): API key not valid: [hidden]' )
  } )

  it( 'fails when Gemini cannot be reached', async () => {
    fetchMock.mockRejectedValue( new Error( 'offline' ) )
    await expect( checkGeminiModel( options ) ).rejects.toThrow( 'Could not reach Gemini: offline' )
  } )

  it( 'reports a timeout after 10 seconds', async () => {
    fetchMock.mockRejectedValue( new DOMException( 'timed out', 'TimeoutError' ) )

    await expect( checkGeminiModel( options ) )
      .rejects.toThrow( 'Gemini did not answer within 10 seconds' )
  } )
} )
