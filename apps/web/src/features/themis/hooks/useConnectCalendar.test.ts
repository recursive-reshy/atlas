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
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { startCalendarConnect } from '../api/calendar.api'
import { useConnectCalendar } from './useConnectCalendar'

vi.mock( '../api/calendar.api' )

const mockedStart = vi.mocked( startCalendarConnect )
const assign = vi.fn()

beforeEach( () => {
  mockedStart.mockReset()
  assign.mockReset()
  vi.stubGlobal( 'location', { assign } )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'useConnectCalendar', () => {
  it( 'goes to Google when the server gives the consent URL', async () => {
    mockedStart.mockResolvedValue( 'https://accounts.google.com/consent' )
    const { result } = renderHookWithClient( () => useConnectCalendar() )

    result.current.mutate()

    await vi.waitFor(
      () => expect( assign ).toHaveBeenCalledWith( 'https://accounts.google.com/consent' ),
    )
  } )

  it( 'stays put and keeps the error when the server refuses', async () => {
    mockedStart.mockRejectedValue( new Error( 'Calendar isn\'t set up' ) )
    const { result } = renderHookWithClient( () => useConnectCalendar() )

    result.current.mutate()

    await vi.waitFor(
      () => expect( result.current.error?.message ).toBe( 'Calendar isn\'t set up' ),
    )
    expect( assign ).not.toHaveBeenCalled()
  } )
} )
