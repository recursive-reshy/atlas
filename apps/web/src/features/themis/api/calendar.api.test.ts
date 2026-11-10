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
import { calendarChoicesFixture, calendarFixture } from '../fixtures/calendar.fixture'
import {
  disconnectCalendar,
  getCalendar,
  listCalendars,
  selectCalendar,
  startCalendarConnect,
  syncCalendar,
} from './calendar.api'

const fetchMock = vi.fn()

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'startCalendarConnect', () => {
  it( 'posts and returns the consent URL', async () => {
    fetchMock.mockResolvedValue(
      new Response( JSON.stringify( { url: 'https://accounts.google.com/o/oauth2/auth?x=1' } ) ),
    )

    await expect( startCalendarConnect() ).resolves.toBe( 'https://accounts.google.com/o/oauth2/auth?x=1' )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/calendar/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( {} ),
    } )
  } )

  it( 'throws what the server says', async () => {
    fetchMock.mockResolvedValue(
      new Response( JSON.stringify( { error: 'Calendar isn\'t set up' } ), { status: 409 } ),
    )

    await expect( startCalendarConnect() ).rejects.toThrow( 'Calendar isn\'t set up' )
  } )
} )

describe( 'syncCalendar', () => {
  const counts = {
    added: 2,
    updated: 0,
    removed: 1,
    drafts: 3,
    skipped: false,
  }

  it( 'posts with no age check by default', async () => {
    fetchMock.mockResolvedValue( new Response( JSON.stringify( counts ) ) )

    await expect( syncCalendar() ).resolves.toEqual( counts )
    expect( fetchMock ).toHaveBeenCalledWith(
      '/api/calendar/sync',
      expect.objectContaining( { method: 'POST' } ),
    )
  } )

  it( 'passes if_older_than when given', async () => {
    fetchMock.mockResolvedValue( new Response( JSON.stringify( { ...counts, skipped: true } ) ) )

    await expect( syncCalendar( 300 ) ).resolves.toEqual( { ...counts, skipped: true } )
    expect( fetchMock.mock.calls[ 0 ][ 0 ] ).toBe( '/api/calendar/sync?if_older_than=300' )
  } )

  it( 'rejects a body that is not the contract', async () => {
    fetchMock.mockResolvedValue( new Response( JSON.stringify( { added: 'many' } ) ) )

    await expect( syncCalendar() ).rejects.toThrow( 'Unexpected response' )
  } )
} )

describe( 'getCalendar', () => {
  it( 'reads the connection', async () => {
    fetchMock.mockResolvedValue( new Response( JSON.stringify( calendarFixture() ) ) )

    await expect( getCalendar() ).resolves.toEqual( calendarFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/calendar', undefined )
  } )
} )

describe( 'listCalendars', () => {
  it( 'returns the calendars to choose from', async () => {
    fetchMock.mockResolvedValue(
      new Response( JSON.stringify( { calendars: calendarChoicesFixture() } ) ),
    )

    await expect( listCalendars() ).resolves.toEqual( calendarChoicesFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/calendar/calendars', undefined )
  } )
} )

describe( 'selectCalendar', () => {
  it( 'puts the choice and returns the new status', async () => {
    const body = { calendar_id: 'work@example.com', import_from: '2026-11-01' }

    fetchMock.mockResolvedValue( new Response( JSON.stringify( calendarFixture() ) ) )

    await expect( selectCalendar( body ) ).resolves.toEqual( calendarFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/calendar/selection', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( body ),
    } )
  } )
} )

describe( 'disconnectCalendar', () => {
  it.each( [ true, false ] )( 'deletes with remove_time=%s', async ( removeTime ) => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await disconnectCalendar( removeTime )

    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/calendar?remove_time=${ removeTime }`,
      expect.objectContaining( { method: 'DELETE' } ),
    )
  } )
} )
