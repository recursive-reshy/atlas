// Vitest
import {
  describe,
  expect,
  it,
} from 'vitest'
// App
import { daysBefore, localDate } from './localDate'

describe( 'localDate', () => {
  it( 'is the calendar date in the device\'s own time zone, padded', () => {
    expect( localDate( new Date( 2026, 0, 5, 23, 59 ) ) ).toBe( '2026-01-05' )
    expect( localDate( new Date( 2026, 10, 8, 0, 1 ) ) ).toBe( '2026-11-08' )
  } )
} )

describe( 'daysBefore', () => {
  it( 'goes back whole calendar days, across a month and a year', () => {
    const now = new Date( 2026, 0, 3, 12 )

    expect( daysBefore( now, 0 ) ).toBe( '2026-01-03' )
    expect( daysBefore( now, 3 ) ).toBe( '2025-12-31' )
    expect( daysBefore( now, 365 ) ).toBe( '2025-01-03' )
  } )

  it( 'does not change the date it is given', () => {
    const now = new Date( 2026, 5, 15, 12 )

    daysBefore( now, 10 )

    expect( localDate( now ) ).toBe( '2026-06-15' )
  } )
} )
