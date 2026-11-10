// Packages
import { describe, expect, it } from 'vitest'
// Local
import {
  CalendarConnectionStatus,
  CalendarRuleResponse,
  ConnectCalendarResponse,
  CreateCalendarRuleBody,
  GetCalendarResponse,
  ListCalendarRulesResponse,
  ListCalendarsResponse,
  SelectCalendarBody,
  UpdateCalendarRuleBody,
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

describe( 'calendar rules', () => {
  const subject = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
  const goal = '4f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'

  it( 'creates a rule with a phrase and exactly one target', () => {
    expect( CreateCalendarRuleBody.parse( { phrase: ' Gym ', subject_id: subject } ) )
      .toEqual( { phrase: 'Gym', subject_id: subject } )
    expect( CreateCalendarRuleBody.parse( { phrase: 'Gym', goal_id: goal } ).goal_id ).toBe( goal )
    expect( CreateCalendarRuleBody.safeParse( { phrase: 'Gym' } ).success ).toBe( false )
    expect( CreateCalendarRuleBody.safeParse( {
      phrase: 'Gym',
      subject_id: subject,
      goal_id: goal,
    } ).success ).toBe( false )
  } )

  it( 'keeps the phrase between 1 and 100 characters and refuses extra keys', () => {
    const make = ( phrase: string ) => CreateCalendarRuleBody
      .safeParse( { phrase, goal_id: goal } ).success

    expect( make( '  ' ) ).toBe( false )
    expect( make( 'x'.repeat( 101 ) ) ).toBe( false )
    expect( make( 'x'.repeat( 100 ) ) ).toBe( true )
    expect( CreateCalendarRuleBody.safeParse( { phrase: 'a', goal_id: goal, x: 1 } ).success )
      .toBe( false )
  } )

  it( 'updates the phrase, one new target or the position, and something at least', () => {
    expect( UpdateCalendarRuleBody.parse( { phrase: 'Run' } ) ).toEqual( { phrase: 'Run' } )
    expect( UpdateCalendarRuleBody.parse( { goal_id: goal } ).goal_id ).toBe( goal )
    expect( UpdateCalendarRuleBody.parse( { position: 0 } ).position ).toBe( 0 )
    expect( UpdateCalendarRuleBody.safeParse( {} ).success ).toBe( false )
    expect( UpdateCalendarRuleBody.safeParse( { subject_id: subject, goal_id: goal } ).success )
      .toBe( false )
    expect( UpdateCalendarRuleBody.safeParse( { position: -1 } ).success ).toBe( false )
  } )

  it( 'lists rules with their target and position', () => {
    const rule = {
      id: subject,
      phrase: 'Gym',
      subject_id: null,
      goal_id: goal,
      position: 0,
    }

    expect( ListCalendarRulesResponse.parse( { rules: [ rule ] } ).rules ).toEqual( [ rule ] )
    expect( CalendarRuleResponse.parse( { rule } ).rule.phrase ).toBe( 'Gym' )
  } )
} )
