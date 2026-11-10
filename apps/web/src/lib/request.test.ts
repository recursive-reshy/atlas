// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ApiError } from './apiError'
import { request, send } from './request'

const fetchMock = vi.fn()

const rejection = async ( promise: Promise< unknown > ): Promise< ApiError > => {
  const error: unknown = await promise.then( () => null, ( reason: unknown ) => reason )
  expect( error ).toBeInstanceOf( ApiError )
  return error as ApiError
}

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'send', () => {
  it( 'passes the url and options to fetch and returns the response', async () => {
    const response = new Response( null, { status: 204 } )
    fetchMock.mockResolvedValue( response )

    await expect( send( '/api/x', { method: 'GET' } ) ).resolves.toBe( response )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/x', { method: 'GET' } )
  } )

  it.each( [ 'POST', 'PUT', 'PATCH', 'DELETE' ] )(
    'sends %s as JSON with an empty object when it has no body',
    async ( method ) => {
      fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

      await send( '/api/x', { method } )

      expect( fetchMock ).toHaveBeenCalledWith( '/api/x', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      } )
    },
  )

  it( 'leaves a mutating request that already has a body alone', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )
    const init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    }

    await send( '/api/x', init )

    expect( fetchMock ).toHaveBeenCalledWith( '/api/x', init )
  } )

  it( 'reports an unreachable server', async () => {
    fetchMock.mockRejectedValue( new TypeError( 'Failed to fetch' ) )

    const error = await rejection( send( '/api/x' ) )

    expect( error.message ).toBe( 'Could not reach the server' )
    expect( error.status ).toBeNull()
  } )

  it( 'uses the server error message on a non-2xx response', async () => {
    const body = JSON.stringify( { error: 'Nope' } )
    fetchMock.mockResolvedValue( new Response( body, { status: 409 } ) )

    const error = await rejection( send( '/api/x' ) )

    expect( error.message ).toBe( 'Nope' )
    expect( error.status ).toBe( 409 )
  } )

  it( 'falls back to the status when the error body is not parseable', async () => {
    fetchMock.mockResolvedValue( new Response( 'boom', { status: 500 } ) )

    const error = await rejection( send( '/api/x' ) )

    expect( error.message ).toBe( 'Request failed with status 500' )
  } )
} )

describe( 'request', () => {
  const Thing = {
    safeParse: ( data: unknown ) => {
      return typeof data === 'object' && data !== null && 'name' in data
        && typeof data.name === 'string'
        ? { success: true as const, data: { name: data.name } }
        : { success: false as const }
    },
  }

  it( 'returns the body parsed with the schema', async () => {
    fetchMock.mockResolvedValue( new Response( JSON.stringify( { name: 'a' } ), { status: 200 } ) )

    await expect( request( '/api/x', Thing ) ).resolves.toEqual( { name: 'a' } )
  } )

  it( 'rejects a body that does not match the schema', async () => {
    fetchMock.mockResolvedValue( new Response( JSON.stringify( { nope: 1 } ), { status: 200 } ) )

    const error = await rejection( request( '/api/x', Thing ) )

    expect( error.message ).toBe( 'Unexpected response from the server' )
    expect( error.status ).toBe( 200 )
  } )

  it( 'rejects a body that is not JSON', async () => {
    fetchMock.mockResolvedValue( new Response( 'html', { status: 200 } ) )

    const error = await rejection( request( '/api/x', Thing ) )

    expect( error.message ).toBe( 'Unexpected response from the server' )
  } )
} )
