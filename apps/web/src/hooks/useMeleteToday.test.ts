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
import { getMeleteToday } from '../api/melete.api'
import { meleteTodayFixture } from '../test-support/melete.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { useMeleteToday } from './useMeleteToday'

vi.mock( '../api/melete.api' )

const mockedGet = vi.mocked( getMeleteToday )

beforeEach( () => {
  mockedGet.mockReset()
} )

describe( 'useMeleteToday', () => {
  it( 'starts loading, then returns Today', async () => {
    mockedGet.mockResolvedValue( meleteTodayFixture() )
    const { result } = renderHookWithClient( () => useMeleteToday() )

    expect( result.current ).toEqual( { today: null, isLoading: true, error: null } )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current ).toEqual(
      { today: meleteTodayFixture(), isLoading: false, error: null },
    )
  } )

  it( 'does not ask while disabled, and is not loading', () => {
    const { result } = renderHookWithClient( () => useMeleteToday( false ) )

    expect( mockedGet ).not.toHaveBeenCalled()
    expect( result.current ).toEqual( { today: null, isLoading: false, error: null } )
  } )

  it( 'reports a load error', async () => {
    mockedGet.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useMeleteToday() )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Could not reach the server' ) )
    expect( result.current.today ).toBeNull()
  } )
} )
