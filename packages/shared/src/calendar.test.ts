// Packages
import { describe, expect, it } from 'vitest'
// Local
import {
  CalendarConnectionStatus,
  ConnectCalendarResponse,
  GetCalendarResponse,
  ListCalendarsResponse,
  SelectCalendarBody,
} from './calendar.js'

describe( 'CalendarConnectionStatus', () => {
  it( 'has the four states of the Settings section', () => {
    expect( CalendarConnectionStatus.options )
      .toEqual( [ 'not_configured', 'not_connected', 'connected', 'broken' ] )
  } )
} )

describe( 'GetCalendarResponse', () => {
  it( 'accepts a status alone', () => {
    expect( GetCalendarResponse.parse( { status: 'not_connected' } ) )
      .toEqual( { status: 'not_connected' } )
  } )

  it( 'accepts a connected account with its calendar and last sync', () => {
    const body = {
      status: 'connected',
      email: 'max@example.test',
      calendar: { id: 'cal-1', name: 'Atlas' },
      import_from: '2026-11-09',
      last_synced_at: '2026-11-10T09:00:00.000Z',
    }

    expect( GetCalendarResponse.parse( body ) ).toEqual( body )
  } )

  it( 'accepts a broken account with its error, and refuses an unknown status', () => {
    expect( GetCalendarResponse.parse( { status: 'broken', error: 'Revoked' } ).error )
      .toBe( 'Revoked' )
    expect( GetCalendarResponse.safeParse( { status: 'gone' } ).success ).toBe( false )
  } )
} )

describe( 'ConnectCalendarResponse and ListCalendarsResponse', () => {
  it( 'carry the consent URL and the calendars', () => {
    expect( ConnectCalendarResponse.parse( { url: 'https://accounts.google.com/x' } ).url )
      .toContain( 'google' )
    expect( ConnectCalendarResponse.safeParse( { url: 'not a url' } ).success ).toBe( false )
    expect( ListCalendarsResponse.parse( {
      calendars: [ { id: 'a', name: 'Atlas', primary: false } ],
    } ).calendars ).toHaveLength( 1 )
  } )
} )

describe( 'SelectCalendarBody', () => {
  it( 'takes a calendar and the day to import from', () => {
    expect( SelectCalendarBody.parse( { calendar_id: 'cal-1', import_from: '2026-11-09' } ) )
      .toEqual( { calendar_id: 'cal-1', import_from: '2026-11-09' } )
  } )

  it( 'refuses an empty calendar, a bad day and extra keys', () => {
    expect( SelectCalendarBody.safeParse( { calendar_id: '', import_from: '2026-11-09' } ).success )
      .toBe( false )
    expect( SelectCalendarBody.safeParse( {
      calendar_id: 'c',
      import_from: '2026-02-30',
    } ).success ).toBe( false )
    expect( SelectCalendarBody.safeParse( {
      calendar_id: 'c',
      import_from: '2026-11-09',
      extra: 1,
    } ).success ).toBe( false )
  } )
} )
