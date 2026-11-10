// Testing Library
import { act } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ApiError } from '../lib/apiError'
import { listFolders } from '../api/vault.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { useFolders } from './useFolders'

vi.mock( '../api/vault.api' )

const mockedListFolders = vi.mocked( listFolders )

const response = {
  default_folder: 'Mnemosyne',
  folders: [ { name: 'Learning', path: 'Learning', children: [] } ],
}

beforeEach( () => {
  mockedListFolders.mockReset()
} )

describe( 'useFolders', () => {
  it( 'starts empty, then returns the default folder and the tree', async () => {
    mockedListFolders.mockResolvedValue( response )
    const { result } = renderHookWithClient( () => useFolders() )

    expect( result.current ).toEqual( { defaultFolder: null, folders: [], error: null } )

    await vi.waitFor( () => expect( result.current.folders ).toEqual( response.folders ) )
    expect( result.current ).toEqual( {
      defaultFolder: 'Mnemosyne',
      folders: response.folders,
      error: null,
    } )
  } )

  it( 'asks the server once for the same client, however many times it renders', async () => {
    mockedListFolders.mockResolvedValue( response )
    const { result, rerender, queryClient } = renderHookWithClient( () => useFolders() )
    await vi.waitFor( () => expect( result.current.defaultFolder ).toBe( 'Mnemosyne' ) )

    rerender()
    rerender()

    expect( mockedListFolders ).toHaveBeenCalledTimes( 1 )
    expect( queryClient.getQueryData( [ 'vault', 'folders' ] ) ).toEqual( response )
  } )

  it( 'does not poll', async () => {
    vi.useFakeTimers()
    mockedListFolders.mockResolvedValue( response )
    renderHookWithClient( () => useFolders() )
    await act( () => vi.advanceTimersByTimeAsync( 120_000 ) )
    vi.useRealTimers()

    expect( mockedListFolders ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'reports a readable error and keeps the tree empty', async () => {
    mockedListFolders.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useFolders() )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Could not reach the server' ) )
    expect( result.current.folders ).toEqual( [] )
    expect( result.current.defaultFolder ).toBeNull()
  } )
} )
