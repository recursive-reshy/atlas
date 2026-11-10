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
import { failingRowFixture, statusFixture } from '../fixtures/status.fixture'
import { ApiError } from '#src/lib/apiError'
import { getHealthErrors, getStatus, refreshStatus } from './status.api'

const fetchMock = vi.fn()
const EMPTY_JSON = { headers: { 'Content-Type': 'application/json' }, body: '{}' }

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'getStatus', () => {
  it( 'gets /api/status and returns the parsed response', async () => {
    const body = statusFixture( [ failingRowFixture() ] )

    fetchMock.mockResolvedValue( new Response( JSON.stringify( body ), { status: 200 } ) )

    await expect( getStatus() ).resolves.toEqual( body )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/status', undefined )
  } )

  it( 'rejects a response that does not match the schema', async () => {
    fetchMock.mockResolvedValue( new Response( JSON.stringify( { rows: [] } ), { status: 200 } ) )

    await expect( getStatus() ).rejects.toThrow( 'Unexpected response from the server' )
  } )

  it( 'throws the server\'s message on a failure', async () => {
    fetchMock.mockResolvedValue(
      new Response( JSON.stringify( { error: 'Internal Server Error' } ), { status: 500 } ),
    )

    await expect( getStatus() ).rejects.toEqual( new ApiError( 'Internal Server Error', 500 ) )
  } )
} )

describe( 'refreshStatus', () => {
  it( 'posts to /api/status/refresh and returns the parsed response', async () => {
    const body = statusFixture()

    fetchMock.mockResolvedValue( new Response( JSON.stringify( body ), { status: 200 } ) )

    await expect( refreshStatus() ).resolves.toEqual( body )
    expect( fetchMock ).toHaveBeenCalledWith(
      '/api/status/refresh',
      { method: 'POST', ...EMPTY_JSON },
    )
  } )
} )

describe( 'getHealthErrors', () => {
  it( 'gets the errors of one subject and returns them', async () => {
    const errors = [ { at: '2026-10-22T10:00:00.000Z', message: 'The site answered 500' } ]

    fetchMock.mockResolvedValue( new Response( JSON.stringify( { errors } ), { status: 200 } ) )

    await expect( getHealthErrors( 'feed', 'f 1' ) ).resolves.toEqual( errors )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/status/feed/f%201/errors', undefined )
  } )

  it( 'rejects a response that does not match the schema', async () => {
    const body = JSON.stringify( { errors: [ 1 ] } )

    fetchMock.mockResolvedValue( new Response( body, { status: 200 } ) )

    await expect( getHealthErrors( 'feed', 'f1' ) ).rejects.toThrow( 'Unexpected response' )
  } )
} )
