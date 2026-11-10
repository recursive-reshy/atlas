// Packages
import { act } from '@testing-library/react'
import { focusManager } from '@tanstack/react-query'
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
import { getStatus } from '../api/status.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { failingRowFixture, statusFixture } from '../test-support/status.fixture'
import { useStatus } from './useStatus'

vi.mock( '../api/status.api' )

const mockedGet = vi.mocked( getStatus )

beforeEach( () => {
  mockedGet.mockReset()
  mockedGet.mockResolvedValue( statusFixture( [ failingRowFixture() ] ) )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'useStatus', () => {
  it( 'starts loading with no rows, then returns the rows and the failing count', async () => {
    const { result } = renderHookWithClient( () => useStatus() )

    expect( result.current.isLoading ).toBe( true )
    expect( result.current.rows ).toEqual( [] )
    expect( result.current.failingCount ).toBe( 0 )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.rows ).toEqual( [ failingRowFixture() ] )
    expect( result.current.failingCount ).toBe( 1 )
    expect( result.current.updatedAt ).toBeGreaterThan( 0 )
    expect( result.current.error ).toBeNull()
  } )

  it( 'asks again every 60 seconds', async () => {
    vi.useFakeTimers()

    const { result } = renderHookWithClient( () => useStatus() )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )

    const loaded = mockedGet.mock.calls.length

    await act( () => vi.advanceTimersByTimeAsync( 59_000 ) )
    expect( mockedGet ).toHaveBeenCalledTimes( loaded )
    await act( () => vi.advanceTimersByTimeAsync( 1_001 ) )
    expect( mockedGet ).toHaveBeenCalledTimes( loaded + 1 )
  } )

  it( 'asks again when the window regains focus', async () => {
    const { result } = renderHookWithClient( () => useStatus() )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )

    const loaded = mockedGet.mock.calls.length

    act( () => {
      focusManager.setFocused( false )
      focusManager.setFocused( true )
    } )

    await vi.waitFor( () => expect( mockedGet ).toHaveBeenCalledTimes( loaded + 1 ) )
  } )

  it( 'returns the error message when loading fails', async () => {
    mockedGet.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )

    const { result } = renderHookWithClient( () => useStatus() )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.rows ).toEqual( [] )
    expect( result.current.error ).toBe( 'Could not reach the server' )
  } )
} )
