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
import { getVideoMeta, parseIsoDuration } from './youtubeData.client.js'

const options = { apiKey: 'AIza-secret-key' }

const item = ( overrides: Record< string, unknown > = {} ): unknown => ( {
  snippet: { title: 'A talk', channelTitle: 'Some Channel' },
  contentDetails: { duration: 'PT15M33S' },
  status: { privacyStatus: 'public' },
  ...overrides,
} )

const jsonResponse = ( body: unknown, status: number = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

let fetchMock: MockInstance< typeof fetch >

const urlOf = ( call: number ): URL => {
  const input = fetchMock.mock.calls[ call ]?.[ 0 ]

  return new URL( input instanceof Request ? input.url : String( input ) )
}

beforeEach( () => {
  fetchMock = vi.spyOn( globalThis, 'fetch' )
  fetchMock.mockImplementation( () => Promise.resolve( jsonResponse( { items: [ item() ] } ) ) )
} )

afterEach( () => {
  vi.restoreAllMocks()
} )

describe( 'parseIsoDuration', () => {
  it.each( [
    [ 'PT15M33S', 933 ],
    [ 'PT45S', 45 ],
    [ 'PT1H', 3600 ],
    [ 'PT1H2M', 3720 ],
    [ 'PT2H3M4S', 7384 ],
    [ 'P1DT2H', 93_600 ],
    [ 'P0D', 0 ],
  ] )( 'reads %s as %i seconds', ( text, seconds ) => {
    expect( parseIsoDuration( text ) ).toBe( seconds )
  } )

  it.each( [ '', '15:33', 'PT', 'P', 'not a duration' ] )( 'refuses %j', ( text ) => {
    expect( () => parseIsoDuration( text ) ).toThrow( 'Unexpected video length from YouTube' )
  } )
} )

describe( 'getVideoMeta', () => {
  it( 'asks videos.list for the snippet, content details and status of one video', async () => {
    await getVideoMeta( 'abc123', options )

    const url = urlOf( 0 )

    expect( url.origin + url.pathname ).toBe( 'https://www.googleapis.com/youtube/v3/videos' )
    expect( url.searchParams.get( 'part' ) ).toBe( 'snippet,contentDetails,status' )
    expect( url.searchParams.get( 'id' ) ).toBe( 'abc123' )
    expect( url.searchParams.get( 'key' ) ).toBe( 'AIza-secret-key' )
  } )

  it( 'returns the title, channel, length in seconds and privacy', async () => {
    expect( await getVideoMeta( 'abc123', options ) ).toEqual( {
      title: 'A talk',
      channel: 'Some Channel',
      duration_seconds: 933,
      privacy: 'public',
    } )
  } )

  it( 'uses another base URL when given one', async () => {
    await getVideoMeta( 'abc123', { ...options, baseUrl: 'http://fakes:4000/' } )

    expect( urlOf( 0 ).origin ).toBe( 'http://fakes:4000' )
    expect( urlOf( 0 ).pathname ).toBe( '/youtube/v3/videos' )
  } )

  it( 'says so when the video is not found or not visible', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { items: [] } ) )

    await expect( getVideoMeta( 'abc123', options ) )
      .rejects.toThrow( 'Video not found or not public' )
  } )

  it.each( [ 'private', 'unlisted' ] )( 'refuses a %s video before anything costs money', async (
    privacyStatus,
  ) => {
    fetchMock.mockResolvedValue(
      jsonResponse( { items: [ item( { status: { privacyStatus } } ) ] } ),
    )

    await expect( getVideoMeta( 'abc123', options ) )
      .rejects.toThrow( 'Only public YouTube videos are supported' )
  } )

  it( 'reports an HTTP error with Google\'s message and never the key', async () => {
    fetchMock.mockResolvedValue( jsonResponse(
      { error: { message: 'API key not valid: AIza-secret-key' } },
      400,
    ) )

    const failure = getVideoMeta( 'abc123', options )

    await expect( failure )
      .rejects.toThrow( 'YouTube Data API failed (400): API key not valid: [hidden]' )
  } )

  it( 'reports a status with no readable body', async () => {
    fetchMock.mockResolvedValue( new Response( 'oops', { status: 503 } ) )

    await expect( getVideoMeta( 'abc123', options ) )
      .rejects.toThrow( 'YouTube Data API failed (503)' )
  } )

  it( 'reports a network failure without the key', async () => {
    fetchMock.mockRejectedValue( new Error( 'getaddrinfo failed for ?key=AIza-secret-key' ) )

    const failure = getVideoMeta( 'abc123', options )

    await expect( failure ).rejects.toThrow( 'Could not reach the YouTube Data API' )
    await expect( failure ).rejects.not.toThrow( /AIza-secret-key/ )
  } )

  it( 'reports a timeout', async () => {
    fetchMock.mockRejectedValue( new DOMException( 'timed out', 'TimeoutError' ) )

    await expect( getVideoMeta( 'abc123', options ) )
      .rejects.toThrow( 'The YouTube Data API did not answer within 15 seconds' )
  } )

  it( 'refuses a response of the wrong shape', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { items: [ { snippet: {} } ] } ) )

    await expect( getVideoMeta( 'abc123', options ) )
      .rejects.toThrow( 'Unexpected response from the YouTube Data API' )
  } )
} )
