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
import { getThemisOverview } from '../api/themis.api'
import { overviewFixture } from '../fixtures/themis.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { useThemisOverview } from './useThemisOverview'

vi.mock( '../api/themis.api' )

const mockedGet = vi.mocked( getThemisOverview )

beforeEach( () => {
  mockedGet.mockReset()
} )

describe( 'useThemisOverview', () => {
  it( 'starts loading, then returns the overview for the period', async () => {
    mockedGet.mockResolvedValue( overviewFixture() )
    const { result } = renderHookWithClient( () => useThemisOverview( 'week' ) )

    expect( result.current ).toEqual( { overview: null, isLoading: true, error: null } )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.overview ).toEqual( overviewFixture() )
    expect( mockedGet ).toHaveBeenCalledWith( 'week' )
  } )

  it( 'asks again when the period changes', async () => {
    mockedGet.mockResolvedValue( overviewFixture() )
    const { result, rerender } = renderHookWithClient(
      ( { period } ) => useThemisOverview( period ),
      { initialProps: { period: 'week' as const } },
    )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    rerender( { period: 'month' as never } )
    await vi.waitFor( () => expect( mockedGet ).toHaveBeenCalledWith( 'month' ) )
  } )

  it( 'does not ask while disabled, and is not loading', () => {
    const { result } = renderHookWithClient( () => useThemisOverview( 'week', false ) )

    expect( mockedGet ).not.toHaveBeenCalled()
    expect( result.current ).toEqual( { overview: null, isLoading: false, error: null } )
  } )

  it( 'reports a load error', async () => {
    mockedGet.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useThemisOverview( 'week' ) )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Could not reach the server' ) )
    expect( result.current.overview ).toBeNull()
  } )
} )
