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
  googleAccessToken,
  transcribeYouTube,
} from './gemini.client.js'

const authMock = vi.hoisted( () => ( { getAccessToken: vi.fn() } ) )

vi.mock( 'google-auth-library', () => ( {
  GoogleAuth: class {
    getAccessToken = authMock.getAccessToken
  },
} ) )

const URL_OF_VIDEO = 'https://www.youtube.com/watch?v=abc123'
const TOKEN = 'ya29.secret-token'

const options = {
  project: 'atlas-prod',
  location: 'global',
  model: 'gemini-3.8-flash',
  getAccessToken: (): Promise< string > => Promise.resolve( TOKEN ),
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
  it( 'posts to generateContent on the global endpoint with the bearer token', async () => {
    await transcribeYouTube( URL_OF_VIDEO, options )

    const init = fetchMock.mock.calls[ 0 ]?.[ 1 ]

    expect( fetchMock ).toHaveBeenCalledOnce()
    expect( urlOf( 0 ) ).toBe(
      'https://aiplatform.googleapis.com/v1/projects/atlas-prod/locations/global'
      + '/publishers/google/models/gemini-3.8-flash:generateContent',
    )
    expect( init?.method ).toBe( 'POST' )

    const headers = new Headers( init?.headers )

    expect( headers.get( 'authorization' ) ).toBe( `Bearer ${ TOKEN }` )
    expect( headers.get( 'content-type' ) ).toBe( 'application/json' )
  } )

  it( 'uses the regional host and location for a regional location', async () => {
    await transcribeYouTube( URL_OF_VIDEO, { ...options, location: 'us-central1' } )

    expect( urlOf( 0 ) ).toBe(
      'https://us-central1-aiplatform.googleapis.com/v1/projects/atlas-prod'
      + '/locations/us-central1/publishers/google/models/gemini-3.8-flash:generateContent',
    )
  } )

  it( 'uses a given base URL instead of the Google host', async () => {
    await transcribeYouTube( URL_OF_VIDEO, { ...options, baseUrl: 'http://fakes:4000/' } )

    expect( urlOf( 0 ) ).toMatch( /^http:\/\/fakes:4000\/v1\/projects\/atlas-prod\// )
  } )

  it( 'sends one user turn: the video as fileData, then the prompt', async () => {
    await transcribeYouTube( URL_OF_VIDEO, options )

    expect( bodyOf( 0 ).contents ).toEqual( [ {
      role: 'user',
      parts: [
        { fileData: { fileUri: URL_OF_VIDEO, mimeType: 'video/mp4' } },
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

  it( 'asks for the token again on every call', async () => {
    const getAccessToken = vi.fn( () => Promise.resolve( TOKEN ) )

    await transcribeYouTube( URL_OF_VIDEO, { ...options, getAccessToken } )
    await transcribeYouTube( URL_OF_VIDEO, { ...options, getAccessToken } )

    expect( getAccessToken ).toHaveBeenCalledTimes( 2 )
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

  it( 'reports missing credentials', async () => {
    const getAccessToken = vi.fn( () => {
      return Promise.reject( new Error( 'Could not load the default credentials' ) )
    } )

    await expect( transcribeYouTube( URL_OF_VIDEO, { ...options, getAccessToken } ) )
      .rejects.toThrow( 'Could not get Google credentials: Could not load the default credentials' )
    expect( fetchMock ).not.toHaveBeenCalled()
  } )

  it( 'never puts the access token in an error', async () => {
    fetchMock.mockResolvedValue( failure( 401, `Invalid token ${ TOKEN }`, 'UNAUTHENTICATED' ) )

    const failed = transcribeYouTube( URL_OF_VIDEO, options )

    await expect( failed ).rejects.toThrow( 'Gemini request failed (401): Invalid token [hidden]' )
    await expect( failed ).rejects.not.toThrow( /ya29/ )

    fetchMock.mockRejectedValue( new Error( `bad header Bearer ${ TOKEN }` ) )
    await expect( transcribeYouTube( URL_OF_VIDEO, options ) ).rejects.not.toThrow( /ya29/ )
  } )
} )

describe( 'checkGeminiModel', () => {
  it( 'reads the model resource on the global host, without a project', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse( { name: 'publishers/google/models/gemini-3.8-flash' } ),
    )

    await expect( checkGeminiModel( options ) ).resolves.toBeUndefined()

    const init = fetchMock.mock.calls[ 0 ]?.[ 1 ]

    expect( urlOf( 0 ) )
      .toBe( 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash' )
    expect( init?.method ).toBe( 'GET' )
    expect( new Headers( init?.headers ).get( 'authorization' ) ).toBe( `Bearer ${ TOKEN }` )
  } )

  it( 'uses the regional host for a regional location and a base URL when given', async () => {
    fetchMock.mockImplementation( () => Promise.resolve( jsonResponse( {} ) ) )

    await checkGeminiModel( { ...options, location: 'eu' } )
    await checkGeminiModel( { ...options, baseUrl: 'http://fakes:4000' } )

    expect( urlOf( 0 ) )
      .toBe( 'https://eu-aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.8-flash' )
    expect( urlOf( 1 ) ).toBe( 'http://fakes:4000/v1/publishers/google/models/gemini-3.8-flash' )
  } )

  it( 'fails readably for an unknown model', async () => {
    fetchMock.mockResolvedValue( jsonResponse(
      { error: { code: 404, message: 'Publisher Model not found.', status: 'NOT_FOUND' } },
      404,
    ) )

    await expect( checkGeminiModel( options ) )
      .rejects.toThrow( 'Gemini model check failed (404): Publisher Model not found.' )
  } )

  it( 'fails when Gemini cannot be reached or the credentials are missing', async () => {
    fetchMock.mockRejectedValue( new Error( 'offline' ) )
    await expect( checkGeminiModel( options ) ).rejects.toThrow( 'Could not reach Gemini: offline' )

    const getAccessToken = vi.fn( () => Promise.reject( new Error( 'no credentials' ) ) )

    await expect( checkGeminiModel( { ...options, getAccessToken } ) )
      .rejects.toThrow( 'Could not get Google credentials: no credentials' )
  } )

  it( 'reports a timeout after 10 seconds', async () => {
    fetchMock.mockRejectedValue( new DOMException( 'timed out', 'TimeoutError' ) )

    await expect( checkGeminiModel( options ) )
      .rejects.toThrow( 'Gemini did not answer within 10 seconds' )
  } )
} )

describe( 'googleAccessToken', () => {
  beforeEach( () => {
    authMock.getAccessToken.mockReset()
  } )

  it( 'returns the token Application Default Credentials give', async () => {
    authMock.getAccessToken.mockResolvedValue( 'ya29.from-adc' )

    expect( await googleAccessToken() ).toBe( 'ya29.from-adc' )
  } )

  it( 'fails when there is no token', async () => {
    authMock.getAccessToken.mockResolvedValue( null )

    await expect( googleAccessToken() ).rejects.toThrow( 'Google gave no access token' )
  } )
} )
