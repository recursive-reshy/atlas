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
import { ApiError } from '../lib/apiError'
import { listFolders } from './vault.api'

const fetchMock = vi.fn()

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'listFolders', () => {
  const body = {
    default_folder: 'Mnemosyne',
    folders: [
      { name: 'Learning', path: 'Learning', children: [] },
    ],
  }

  it( 'gets the folder tree', async () => {
    fetchMock.mockResolvedValue( new Response( JSON.stringify( body ), { status: 200 } ) )

    await expect( listFolders() ).resolves.toEqual( body )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/vault/folders', undefined )
  } )

  it( 'rejects an unexpected response', async () => {
    fetchMock.mockResolvedValue( new Response( JSON.stringify( { folders: 5 } ), { status: 200 } ) )

    await expect( listFolders() ).rejects.toThrow( 'Unexpected response from the server' )
  } )

  it( 'reports an unreachable server', async () => {
    fetchMock.mockRejectedValue( new TypeError( 'Failed to fetch' ) )

    await expect( listFolders() ).rejects.toBeInstanceOf( ApiError )
  } )
} )
