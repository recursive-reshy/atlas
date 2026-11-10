// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ApiError } from '#src/lib/apiError'
import { getHealthErrors } from '../api/status.api'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { useHealthErrors } from './useHealthErrors'

vi.mock( '../api/status.api' )

const mockedGet = vi.mocked( getHealthErrors )
const errors = [
  { at: '2026-10-22T10:00:00.000Z', message: 'second' },
  { at: '2026-10-22T09:00:00.000Z', message: 'first' },
]

beforeEach( () => {
  mockedGet.mockReset()
  mockedGet.mockResolvedValue( errors )
} )

describe( 'useHealthErrors', () => {
  it( 'does not load while it is not enabled', () => {
    const { result } = renderHookWithClient( () => useHealthErrors( 'feed', 'f1', false ) )

    expect( mockedGet ).not.toHaveBeenCalled()
    expect( result.current.errors ).toEqual( [] )
    expect( result.current.isLoading ).toBe( false )
  } )

  it( 'loads the errors of the subject once enabled', async () => {
    const { result, rerender } = renderHookWithClient(
      ( { enabled } ) => useHealthErrors( 'feed', 'f1', enabled ),
      { initialProps: { enabled: false } },
    )

    rerender( { enabled: true } )

    await vi.waitFor( () => expect( result.current.errors ).toEqual( errors ) )
    expect( mockedGet ).toHaveBeenCalledWith( 'feed', 'f1' )
    expect( result.current.error ).toBeNull()
  } )

  it( 'keeps each subject\'s errors apart', async () => {
    mockedGet.mockImplementation( ( kind, id ) => {
      return Promise.resolve( [ { at: '2026-10-22T10:00:00.000Z', message: `${ kind }:${ id }` } ] )
    } )

    const { result } = renderHookWithClient( () => ( {
      feed: useHealthErrors( 'feed', 'f1', true ),
      source: useHealthErrors( 'gmail_source', 'f1', true ),
    } ) )

    await vi.waitFor( () => expect( result.current.source.errors ).toHaveLength( 1 ) )
    expect( result.current.feed.errors[ 0 ]?.message ).toBe( 'feed:f1' )
    expect( result.current.source.errors[ 0 ]?.message ).toBe( 'gmail_source:f1' )
  } )

  it( 'returns the error message when loading fails', async () => {
    mockedGet.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )

    const { result } = renderHookWithClient( () => useHealthErrors( 'feed', 'f1', true ) )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Could not reach the server' ) )
    expect( result.current.errors ).toEqual( [] )
  } )
} )
