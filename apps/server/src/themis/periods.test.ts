// Packages
import { describe, expect, it } from 'vitest'
// Themis
import {
  addDays,
  checkinDue,
  monthStart,
  periodRange,
  previousPeriod,
  quarterStart,
  studyDay,
  weekStart,
} from './periods.js'

describe( 'addDays', () => {
  it.each( [
    [ '2026-11-07', 1, '2026-11-08' ],
    [ '2026-11-30', 1, '2026-12-01' ],
    [ '2026-12-31', 1, '2027-01-01' ],
    [ '2026-03-01', -1, '2026-02-28' ],
    [ '2028-03-01', -1, '2028-02-29' ],
  ] )( '%s %i days is %s', ( day, days, expected ) => {
    expect( addDays( day, days ) ).toBe( expected )
  } )
} )

describe( 'weekStart', () => {
  it.each( [
    [ '2026-11-02', '2026-11-02' ],
    [ '2026-11-04', '2026-11-02' ],
    [ '2026-11-08', '2026-11-02' ],
    [ '2026-11-09', '2026-11-09' ],
    [ '2027-01-01', '2026-12-28' ],
    [ '2026-01-01', '2025-12-29' ],
  ] )( 'the week of %s starts on %s', ( day, expected ) => {
    expect( weekStart( day ) ).toBe( expected )
  } )
} )

describe( 'monthStart and quarterStart', () => {
  it.each( [
    [ '2026-11-30', '2026-11-01', '2026-10-01' ],
    [ '2026-01-15', '2026-01-01', '2026-01-01' ],
    [ '2026-03-31', '2026-03-01', '2026-01-01' ],
    [ '2026-04-01', '2026-04-01', '2026-04-01' ],
    [ '2026-12-31', '2026-12-01', '2026-10-01' ],
  ] )( '%s: month %s, quarter %s', ( day, month, quarter ) => {
    expect( monthStart( day ) ).toBe( month )
    expect( quarterStart( day ) ).toBe( quarter )
  } )
} )

describe( 'periodRange', () => {
  it.each( [
    [ 'week', '2026-11-04', '2026-11-02', '2026-11-08' ],
    [ 'week', '2026-12-30', '2026-12-28', '2027-01-03' ],
    [ 'month', '2026-02-10', '2026-02-01', '2026-02-28' ],
    [ 'month', '2028-02-10', '2028-02-01', '2028-02-29' ],
    [ 'month', '2026-12-31', '2026-12-01', '2026-12-31' ],
    [ 'quarter', '2026-05-05', '2026-04-01', '2026-06-30' ],
    [ 'quarter', '2026-11-07', '2026-10-01', '2026-12-31' ],
    [ 'quarter', '2026-01-01', '2026-01-01', '2026-03-31' ],
  ] as const )( 'the %s of %s runs %s to %s', ( period, day, from, to ) => {
    expect( periodRange( period, day ) ).toEqual( { from, to } )
  } )
} )

describe( 'previousPeriod', () => {
  it.each( [
    [ 'weekly', '2026-11-11', '2026-11-02', '2026-11-08' ],
    [ 'weekly', '2026-11-09', '2026-11-02', '2026-11-08' ],
    [ 'weekly', '2026-01-01', '2025-12-22', '2025-12-28' ],
    [ 'monthly', '2026-11-15', '2026-10-01', '2026-10-31' ],
    [ 'monthly', '2026-01-01', '2025-12-01', '2025-12-31' ],
    [ 'monthly', '2026-03-31', '2026-02-01', '2026-02-28' ],
  ] as const )( '%s on %s: the period just finished is %s to %s', ( cadence, day, from, to ) => {
    expect( previousPeriod( cadence, day ) ).toEqual( { from, to } )
  } )
} )

describe( 'studyDay', () => {
  const singapore = { timeZone: 'Asia/Singapore', startHour: 4 }
  const newYork = { timeZone: 'America/New_York', startHour: 4 }

  it( 'puts an instant before the start hour in the previous day', () => {
    expect( studyDay( new Date( '2026-11-07T19:59:00Z' ), singapore ) ).toBe( '2026-11-07' )
    expect( studyDay( new Date( '2026-11-07T20:00:00Z' ), singapore ) ).toBe( '2026-11-08' )
  } )

  it( 'follows the zone\'s clock on the day it goes back', () => {
    expect( studyDay( new Date( '2026-11-01T08:30:00Z' ), newYork ) ).toBe( '2026-10-31' )
    expect( studyDay( new Date( '2026-11-01T09:00:00Z' ), newYork ) ).toBe( '2026-11-01' )
  } )

  it( 'follows the zone\'s clock on the day it goes forward', () => {
    expect( studyDay( new Date( '2026-03-08T07:59:00Z' ), newYork ) ).toBe( '2026-03-07' )
    expect( studyDay( new Date( '2026-03-08T08:00:00Z' ), newYork ) ).toBe( '2026-03-08' )
  } )
} )

describe( 'checkinDue', () => {
  const weekly = { status: 'active', checkin_cadence: 'weekly', created_day: '2026-10-01' } as const
  const monthly = { ...weekly, checkin_cadence: 'monthly' } as const

  it( 'is the week just finished, from the first day of the new week', () => {
    for( const today of [ '2026-11-09', '2026-11-11', '2026-11-15' ] ) {
      expect( checkinDue( weekly, today, [] ) )
        .toEqual( { period_start: '2026-11-02', period_end: '2026-11-08' } )
    }
  } )

  it( 'moves on when the next period starts, leaving the missed one behind', () => {
    expect( checkinDue( weekly, '2026-11-16', [ ] )?.period_start ).toBe( '2026-11-09' )
    expect( checkinDue( weekly, '2026-11-16', [ '2026-11-02' ] )?.period_start )
      .toBe( '2026-11-09' )
  } )

  it( 'is the month just finished for a monthly goal', () => {
    expect( checkinDue( monthly, '2026-11-01', [] ) )
      .toEqual( { period_start: '2026-10-01', period_end: '2026-10-31' } )
    expect( checkinDue( monthly, '2026-11-30', [] )?.period_start ).toBe( '2026-10-01' )
  } )

  it( 'is null once that period has an answer', () => {
    expect( checkinDue( weekly, '2026-11-11', [ '2026-11-02' ] ) ).toBeNull()
    expect( checkinDue( monthly, '2026-11-11', [ '2026-10-01' ] ) ).toBeNull()
  } )

  it( 'is null for a goal made after the period ended, and due for one made inside it', () => {
    expect( checkinDue( { ...weekly, created_day: '2026-11-09' }, '2026-11-11', [] ) ).toBeNull()
    expect( checkinDue( { ...weekly, created_day: '2026-11-08' }, '2026-11-11', [] ) )
      .not.toBeNull()
    expect( checkinDue( { ...weekly, created_day: '2026-11-04' }, '2026-11-11', [] ) )
      .not.toBeNull()
  } )

  it( 'is null for achieved and dropped goals and for goals with no cadence', () => {
    expect( checkinDue( { ...weekly, status: 'achieved' }, '2026-11-11', [] ) ).toBeNull()
    expect( checkinDue( { ...weekly, status: 'dropped' }, '2026-11-11', [] ) ).toBeNull()
    expect( checkinDue( { ...weekly, checkin_cadence: null }, '2026-11-11', [] ) ).toBeNull()
  } )
} )
