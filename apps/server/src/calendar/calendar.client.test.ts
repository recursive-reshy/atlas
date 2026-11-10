// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Calendar
import { withCalendar } from './auth.js'
import { findCalendar, listCalendars, listEvents } from './calendar.client.js'

vi.mock( './auth.js', () => ( { withCalendar: vi.fn() } ) )

const clientWith = ( calendarList: object, events: object = {} ): void => {
  vi.mocked( withCalendar ).mockImplementation( ( _id, run ) => run( {
    calendarList,
    events,
  } as never ) )
}

beforeEach( () => {
  vi.resetAllMocks()
} )

describe( 'listEvents', () => {
  const FROM = new Date( '2026-11-03T00:00:00.000Z' )
  const TO = new Date( '2026-11-10T12:00:00.000Z' )

  it( 'reads the window with recurring events expanded, across every page', async () => {
    const list = vi.fn()
      .mockResolvedValueOnce( { data: { items: [ {
        id: 'a',
        summary: 'Gym',
        start: { dateTime: '2026-11-09T15:00:00+08:00' },
        end: { dateTime: '2026-11-09T16:00:00+08:00' },
      } ], nextPageToken: 'p2' } } )
      .mockResolvedValueOnce( { data: { items: [ {
        id: 'b',
        summary: 'Run',
        start: { dateTime: '2026-11-09T10:00:00Z' },
        end: { dateTime: '2026-11-09T11:00:00Z' },
      } ] } } )

    clientWith( {}, { list } )

    expect( await listEvents( 'user-1', 'cal-1', FROM, TO ) ).toEqual( [
      {
        event_id: 'a',
        title: 'Gym',
        started_at: '2026-11-09T07:00:00.000Z',
        ended_at: '2026-11-09T08:00:00.000Z',
      },
      {
        event_id: 'b',
        title: 'Run',
        started_at: '2026-11-09T10:00:00.000Z',
        ended_at: '2026-11-09T11:00:00.000Z',
      },
    ] )
    expect( list ).toHaveBeenNthCalledWith( 1, expect.objectContaining( {
      calendarId: 'cal-1',
      timeMin: FROM.toISOString(),
      timeMax: TO.toISOString(),
      singleEvents: true,
      showDeleted: false,
      pageToken: undefined,
    } ) )
    expect( list ).toHaveBeenNthCalledWith( 2, expect.objectContaining( { pageToken: 'p2' } ) )
  } )

  it( 'drops all-day events, cancelled ones and those without an id', async () => {
    const timed = { dateTime: '2026-11-09T07:00:00Z' }
    const later = { dateTime: '2026-11-09T08:00:00Z' }

    clientWith( {}, { list: vi.fn().mockResolvedValue( { data: { items: [
      {
        id: 'all-day',
        summary: 'Holiday',
        start: { date: '2026-11-09' },
        end: { date: '2026-11-10' },
      },
      { id: 'cancelled', summary: 'Gone', status: 'cancelled', start: timed, end: later },
      { summary: 'No id', start: timed, end: later },
      { id: 'no-end', summary: 'Open', start: timed },
      { id: 'ok', summary: 'Kept', start: timed, end: later },
    ] } } ) } )

    expect( ( await listEvents( 'user-1', 'cal-1', FROM, TO ) ).map( ( e ) => e.event_id ) )
      .toEqual( [ 'ok' ] )
  } )

  it( 'gives an event with no title an empty one', async () => {
    clientWith( {}, { list: vi.fn().mockResolvedValue( { data: { items: [ {
      id: 'x',
      start: { dateTime: '2026-11-09T07:00:00Z' },
      end: { dateTime: '2026-11-09T08:00:00Z' },
    } ] } } ) } )

    expect( ( await listEvents( 'user-1', 'cal-1', FROM, TO ) )[ 0 ]?.title ).toBe( '' )
  } )

  it( 'passes a Google failure on, so nothing is half-read', async () => {
    clientWith( {}, { list: vi.fn().mockRejectedValue( new Error( 'Backend Error' ) ) } )

    await expect( listEvents( 'user-1', 'cal-1', FROM, TO ) ).rejects.toThrow( 'Backend Error' )
  } )
} )

describe( 'listCalendars', () => {
  it( 'puts the primary calendar first and names an override over the summary', async () => {
    clientWith( { list: vi.fn().mockResolvedValue( { data: { items: [
      { id: 'b', summary: 'Zed' },
      { id: 'a', summary: 'Alpha', summaryOverride: 'My Alpha' },
      { id: 'me', summary: 'me@example.com', primary: true },
      { summary: 'no id' },
    ] } } ) } )

    expect( await listCalendars( 'user-1' ) ).toEqual( [
      { id: 'me', name: 'me@example.com', primary: true },
      { id: 'a', name: 'My Alpha', primary: false },
      { id: 'b', name: 'Zed', primary: false },
    ] )
  } )
} )

describe( 'findCalendar', () => {
  it( 'returns the id and name', async () => {
    clientWith( { get: vi.fn().mockResolvedValue( { data: { id: 'a', summary: 'Alpha' } } ) } )

    expect( await findCalendar( 'user-1', 'a' ) ).toEqual( { id: 'a', name: 'Alpha' } )
  } )
} )
