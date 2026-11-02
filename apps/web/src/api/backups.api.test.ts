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
import { runBackup } from './backups.api'

const fetchMock = vi.fn()
const EMPTY_JSON = { headers: { 'Content-Type': 'application/json' }, body: '{}' }
const result = { file: 'atlas-20261023-043000.db', bytes: 4096, at: '2026-10-22T20:30:00.000Z' }

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'runBackup', () => {
  it( 'posts to /api/backups and returns the parsed result', async () => {
    fetchMock.mockResolvedValue( new Response( JSON.stringify( result ), { status: 201 } ) )

    await expect( runBackup() ).resolves.toEqual( result )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/backups', { method: 'POST', ...EMPTY_JSON } )
  } )

  it( 'rejects a response that does not match the schema', async () => {
    fetchMock.mockResolvedValue( new Response( JSON.stringify( { file: 'x' } ), { status: 201 } ) )

    await expect( runBackup() ).rejects.toThrow( 'Unexpected response from the server' )
  } )

  it.each( [
    [ 409, 'A backup is already running' ],
    [ 500, 'Backup failed: disk full' ],
  ] )( 'throws the server\'s message on a %i', async ( status, message ) => {
    fetchMock.mockResolvedValue( new Response( JSON.stringify( { error: message } ), { status } ) )

    await expect( runBackup() ).rejects.toEqual( new ApiError( message, status ) )
  } )
} )
