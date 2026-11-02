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
// Shared
import type { LinkRequest, LinkResponse } from '@atlas/shared'
// Clients
import {
  AgentError,
  checkHealth,
  clearAgentHealthCache,
  fetchInstructions,
  requestLinks,
} from './agent.client.js'
// Logging
import { withLogContext } from '../logContext.js'

const SECRET = 's3cr3t-'.repeat( 6 )

const { agentConfig } = vi.hoisted( () => ( {
  agentConfig: { agent: null as { url: string, secret: string, timeoutMs: number } | null },
} ) )

vi.mock( '../config.js', () => ( { config: agentConfig } ) )

const request: LinkRequest = {
  note: { title: 'T', tags: [ 'a' ], folder: 'Notes', body: 'Body about pricing.' },
  vault_dir: 'naresh',
  model: 'claude-haiku-5-5',
  guidance: 'Link well.',
}

const usage = {
  input_tokens: 10,
  output_tokens: 5,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  tool_calls: 1,
  turns: 2,
}

const linked: LinkResponse = {
  outcome: 'linked',
  reason: null,
  suggestions: [ {
    target: 'Pricing Strategy',
    kind: 'new_concept',
    anchor: 'pricing',
    reason: 'It is about pricing.',
  } ],
  usage,
}

const failed: LinkResponse = {
  outcome: 'failed',
  reason: 'Timed out after 90 s',
  suggestions: [],
  usage,
}

const json = ( body: unknown, status = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

let fetchMock: MockInstance< typeof fetch >

beforeEach( () => {
  agentConfig.agent = { url: 'http://agent:8100', secret: SECRET, timeoutMs: 120_000 }
  clearAgentHealthCache()
  fetchMock = vi.spyOn( globalThis, 'fetch' )
  fetchMock.mockResolvedValue( json( linked ) )
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

const rejection = async ( call: () => Promise< unknown > ): Promise< AgentError > => {
  const error = await call().then( () => undefined, ( caught: unknown ) => caught )

  expect( error ).toBeInstanceOf( AgentError )

  return error as AgentError
}

describe( 'requestLinks', () => {
  it( 'posts the request as JSON to /v1/link with the bearer secret', async () => {
    await requestLinks( request )

    const [ url, init ] = fetchMock.mock.calls[ 0 ] as [ URL | string, RequestInit ]
    const headers = new Headers( init.headers )

    expect( String( url ) ).toBe( 'http://agent:8100/v1/link' )
    expect( init.method ).toBe( 'POST' )
    expect( headers.get( 'authorization' ) ).toBe( `Bearer ${ SECRET }` )
    expect( headers.get( 'content-type' ) ).toContain( 'application/json' )
    expect( JSON.parse( init.body as string ) ).toEqual( request )
    expect( init.signal ).toBeInstanceOf( AbortSignal )
  } )

  it( 'sends the job ID of the log context as X-Job-Id', async () => {
    await withLogContext( { job_id: 'job-1' }, () => requestLinks( request ) )

    const [ , init ] = fetchMock.mock.calls[ 0 ] as [ URL | string, RequestInit ]

    expect( new Headers( init.headers ).get( 'x-job-id' ) ).toBe( 'job-1' )
  } )

  it( 'sends no X-Job-Id outside a job context, or on the instructions call', async () => {
    await requestLinks( request )
    fetchMock.mockResolvedValueOnce( json( { instructions: 'Locked.' } ) )
    await withLogContext( { job_id: 'job-1' }, () => fetchInstructions() )

    for( const [ , init ] of fetchMock.mock.calls as [ URL | string, RequestInit ][] ) {
      expect( new Headers( init.headers ).has( 'x-job-id' ) ).toBe( false )
    }
  } )

  it( 'handles a trailing slash in the URL', async () => {
    agentConfig.agent = { url: 'http://agent:8100/', secret: SECRET, timeoutMs: 1000 }

    await requestLinks( request )

    const [ url ] = fetchMock.mock.calls[ 0 ] as [ URL | string ]

    expect( String( url ) ).toBe( 'http://agent:8100/v1/link' )
  } )

  it( 'returns a linked response', async () => {
    expect( await requestLinks( request ) ).toEqual( linked )
  } )

  it( 'returns a failed outcome instead of throwing', async () => {
    fetchMock.mockResolvedValue( json( failed ) )

    expect( await requestLinks( request ) ).toEqual( failed )
  } )

  it( 'throws "unreachable" when the connection fails', async () => {
    fetchMock.mockRejectedValue( new TypeError( 'fetch failed' ) )

    expect( ( await rejection( () => requestLinks( request ) ) ).message )
      .toBe( 'Agent service unreachable' )
  } )

  it( 'throws a timeout message in seconds when the call times out', async () => {
    fetchMock.mockRejectedValue( new DOMException( 'The operation timed out', 'TimeoutError' ) )

    expect( ( await rejection( () => requestLinks( request ) ) ).message )
      .toBe( 'Agent service timed out after 120 s' )
  } )

  it( 'throws "rejected the secret" on 401', async () => {
    fetchMock.mockResolvedValue( json( { detail: 'unauthorized' }, 401 ) )

    expect( ( await rejection( () => requestLinks( request ) ) ).message )
      .toBe( 'Agent service rejected the secret' )
  } )

  it.each( [
    [ 'a server error', () => json( { detail: 'boom' }, 500 ) ],
    [ 'a body that is not JSON', () => new Response( 'oops', { status: 200 } ) ],
    [ 'JSON of the wrong shape', () => json( { outcome: 'maybe' } ) ],
    [ 'a failed response with no reason', () => json( { ...failed, reason: null } ) ],
  ] )( 'throws "invalid response" for %s', async ( _name, respond ) => {
    fetchMock.mockResolvedValue( respond() )

    expect( ( await rejection( () => requestLinks( request ) ) ).message )
      .toBe( 'Agent service returned an invalid response' )
  } )

  it( 'says the vault was not found when the agent answers 422', async () => {
    fetchMock.mockResolvedValue( json( { error: 'unknown_vault' }, 422 ) )

    expect( ( await rejection( () => requestLinks( request ) ) ).message )
      .toBe( 'The agent service could not find your vault' )
  } )

  it( 'never puts the secret in an error message', async () => {
    fetchMock.mockRejectedValue( new Error( `connect refused for Bearer ${ SECRET }` ) )

    expect( ( await rejection( () => requestLinks( request ) ) ).message )
      .not.toContain( SECRET )
  } )

  it( 'throws "not configured" without calling fetch when there is no agent', async () => {
    agentConfig.agent = null

    expect( ( await rejection( () => requestLinks( request ) ) ).message )
      .toBe( 'Linking isn\'t configured' )
    expect( fetchMock ).not.toHaveBeenCalled()
  } )
} )

describe( 'fetchInstructions', () => {
  it( 'gets the locked instructions with the secret', async () => {
    fetchMock.mockResolvedValue( json( { instructions: 'You link notes.' } ) )

    expect( await fetchInstructions() ).toBe( 'You link notes.' )

    const [ url, init ] = fetchMock.mock.calls[ 0 ] as [ URL | string, RequestInit ]

    expect( String( url ) ).toBe( 'http://agent:8100/v1/link/instructions' )
    expect( init.method ?? 'GET' ).toBe( 'GET' )
    expect( new Headers( init.headers ).get( 'authorization' ) ).toBe( `Bearer ${ SECRET }` )
  } )

  it.each( [
    [ 'the connection fails', () => Promise.reject( new TypeError( 'fetch failed' ) ),
      'Agent service unreachable' ],
    [ 'the secret is wrong', () => Promise.resolve( json( {}, 401 ) ),
      'Agent service rejected the secret' ],
    [ 'the reply is the wrong shape', () => Promise.resolve( json( { text: 'x' } ) ),
      'Agent service returned an invalid response' ],
  ] )( 'throws an AgentError when %s', async ( _name, respond, message ) => {
    fetchMock.mockImplementation( respond )

    expect( ( await rejection( () => fetchInstructions() ) ).message ).toBe( message )
  } )

  it( 'throws "not configured" when there is no agent', async () => {
    agentConfig.agent = null

    expect( ( await rejection( () => fetchInstructions() ) ).message )
      .toBe( 'Linking isn\'t configured' )
  } )
} )

describe( 'checkHealth', () => {
  it( 'is ok when /health answers 200, asking without the secret within two seconds', async () => {
    fetchMock.mockResolvedValue( json( { status: 'ok', vault: 'readable' } ) )

    expect( await checkHealth() ).toBe( 'ok' )

    const [ url, init ] = fetchMock.mock.calls[ 0 ] as [ URL | string, RequestInit ]

    expect( String( url ) ).toBe( 'http://agent:8100/health' )
    expect( init.signal ).toBeInstanceOf( AbortSignal )
  } )

  it( 'is unavailable on a 503, a failed connection and a timeout', async () => {
    fetchMock.mockResolvedValue( json( { status: 'error' }, 503 ) )
    expect( await checkHealth() ).toBe( 'unavailable' )

    clearAgentHealthCache()
    fetchMock.mockRejectedValue( new TypeError( 'fetch failed' ) )
    expect( await checkHealth() ).toBe( 'unavailable' )

    clearAgentHealthCache()
    fetchMock.mockRejectedValue( new DOMException( 'timed out', 'TimeoutError' ) )
    expect( await checkHealth() ).toBe( 'unavailable' )
  } )

  it( 'is unavailable without calling fetch when there is no agent', async () => {
    agentConfig.agent = null

    expect( await checkHealth() ).toBe( 'unavailable' )
    expect( fetchMock ).not.toHaveBeenCalled()
  } )

  it( 'asks again with fresh, and a plain call then reuses that answer', async () => {
    fetchMock.mockImplementation( () => Promise.resolve( json( { status: 'ok' } ) ) )
    expect( await checkHealth() ).toBe( 'ok' )

    fetchMock.mockImplementation( () => Promise.resolve( json( { status: 'error' }, 503 ) ) )

    expect( await checkHealth() ).toBe( 'ok' )
    expect( await checkHealth( { fresh: true } ) ).toBe( 'unavailable' )
    expect( await checkHealth() ).toBe( 'unavailable' )
    expect( fetchMock ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'caches the answer for 30 seconds, then asks again', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation( () => Promise.resolve( json( { status: 'ok' } ) ) )

    await checkHealth()
    vi.advanceTimersByTime( 29_000 )
    await checkHealth()

    expect( fetchMock ).toHaveBeenCalledTimes( 1 )

    vi.advanceTimersByTime( 2_000 )
    await checkHealth()

    expect( fetchMock ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'caches a failure as well', async () => {
    fetchMock.mockRejectedValue( new TypeError( 'fetch failed' ) )

    await checkHealth()
    await checkHealth()

    expect( fetchMock ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'asks again after the cache is cleared', async () => {
    fetchMock.mockImplementation( () => Promise.resolve( json( { status: 'ok' } ) ) )

    await checkHealth()
    clearAgentHealthCache()
    await checkHealth()

    expect( fetchMock ).toHaveBeenCalledTimes( 2 )
  } )
} )
