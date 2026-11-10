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
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { syncCalendar } from '../api/calendar.api'
import { themisKeys } from '#src/lib/queryKeys'
import { useCalendarSync } from './useCalendarSync'

vi.mock( '../api/calendar.api' )

const mockedSync = vi.mocked( syncCalendar )

beforeEach( () => {
  mockedSync.mockReset()
  mockedSync.mockResolvedValue( {
    added: 1,
    updated: 0,
    removed: 0,
    drafts: 1,
    skipped: false,
  } )
} )

describe( 'useCalendarSync', () => {
  it( 'syncs once when connected, skipping a read under five minutes old', async () => {
    const { rerender } = renderHookWithClient( () => useCalendarSync( true ) )

    await vi.waitFor( () => expect( mockedSync ).toHaveBeenCalledWith( 300 ) )
    rerender()
    expect( mockedSync ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'refreshes Themis afterwards', async () => {
    const { queryClient } = renderHookWithClient( () => useCalendarSync( true ) )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    await vi.waitFor( () => expect( invalidate ).toHaveBeenCalledWith(
      { queryKey: themisKeys.all },
    ) )
  } )

  it( 'does nothing when not connected', () => {
    renderHookWithClient( () => useCalendarSync( false ) )

    expect( mockedSync ).not.toHaveBeenCalled()
  } )

  it( 'never throws into the page when the sync fails', async () => {
    mockedSync.mockRejectedValue( new ApiError( 'Calendar sync failed', 502 ) )
    const { result } = renderHookWithClient( () => useCalendarSync( true ) )

    await vi.waitFor( () => expect( mockedSync ).toHaveBeenCalled() )
    expect( result.current ).toBeUndefined()
  } )
} )
