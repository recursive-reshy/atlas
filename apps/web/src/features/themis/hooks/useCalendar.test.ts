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
import { calendarChoicesFixture, calendarFixture } from '../fixtures/calendar.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import {
  disconnectCalendar,
  getCalendar,
  listCalendars,
  selectCalendar,
  syncCalendar,
} from '../api/calendar.api'
import { calendarKeys, themisKeys } from '#src/lib/queryKeys'
import { useCalendar } from './useCalendar'
import { useCalendarChoices } from './useCalendarChoices'
import {
  useDisconnectCalendar,
  useSelectCalendar,
  useSyncCalendarNow,
} from './useCalendarMutations'

vi.mock( '../api/calendar.api' )

beforeEach( () => {
  vi.resetAllMocks()
  vi.mocked( getCalendar ).mockResolvedValue( calendarFixture() )
} )

describe( 'useCalendar', () => {
  it( 'loads the connection', async () => {
    const { result } = renderHookWithClient( () => useCalendar() )

    expect( result.current ).toEqual( { calendar: null, isLoading: true, error: null } )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.calendar ).toEqual( calendarFixture() )
  } )

  it( 'keeps the error text', async () => {
    vi.mocked( getCalendar ).mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useCalendar() )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Could not reach the server' ) )
  } )
} )

describe( 'useCalendarChoices', () => {
  it( 'lists calendars only when asked', async () => {
    vi.mocked( listCalendars ).mockResolvedValue( calendarChoicesFixture() )
    const off = renderHookWithClient( () => useCalendarChoices( false ) )

    expect( listCalendars ).not.toHaveBeenCalled()
    expect( off.result.current.choices ).toEqual( [] )

    const on = renderHookWithClient( () => useCalendarChoices( true ) )

    await vi.waitFor(
      () => expect( on.result.current.choices ).toEqual( calendarChoicesFixture() ),
    )
  } )
} )

describe( 'calendar mutations', () => {
  it( 'selecting a calendar refreshes the status, Themis and the choices', async () => {
    vi.mocked( selectCalendar ).mockResolvedValue( calendarFixture() )
    const { result, queryClient } = renderHookWithClient( () => useSelectCalendar() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    result.current.mutate( { calendar_id: 'work@example.com', import_from: '2026-11-01' } )

    await vi.waitFor( () => expect( invalidate ).toHaveBeenCalledWith(
      { queryKey: calendarKeys.all },
    ) )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: themisKeys.all } )
    expect( selectCalendar ).toHaveBeenCalledWith(
      { calendar_id: 'work@example.com', import_from: '2026-11-01' },
    )
  } )

  it( 'disconnecting passes whether to remove imported time and refreshes', async () => {
    vi.mocked( disconnectCalendar ).mockResolvedValue( undefined )
    const { result, queryClient } = renderHookWithClient( () => useDisconnectCalendar() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    result.current.mutate( true )

    await vi.waitFor( () => expect( disconnectCalendar ).toHaveBeenCalledWith( true ) )
    await vi.waitFor( () => expect( invalidate ).toHaveBeenCalledWith(
      { queryKey: themisKeys.all },
    ) )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: calendarKeys.all } )
  } )

  it( 'syncing now reads without an age check and refreshes', async () => {
    vi.mocked( syncCalendar ).mockResolvedValue(
      { added: 1, updated: 0, removed: 0, drafts: 1, skipped: false },
    )
    const { result, queryClient } = renderHookWithClient( () => useSyncCalendarNow() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    result.current.mutate()

    await vi.waitFor( () => expect( syncCalendar ).toHaveBeenCalledWith() )
    await vi.waitFor( () => expect( invalidate ).toHaveBeenCalledWith(
      { queryKey: themisKeys.all },
    ) )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: calendarKeys.all } )
  } )
} )
