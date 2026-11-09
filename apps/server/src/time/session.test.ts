// Packages
import { describe, expect, it } from 'vitest'
// Time
import { nextSession } from './session.js'
import type { OpenSession } from './session.js'

const options = {
  gapMinutes: 5,
  finalCardSeconds: 30,
  // A fixed day boundary: the study day changes at 20:00Z, as Singapore's does at 04:00
  dayOf: ( at: Date ): string => new Date( at.getTime() + 4 * 3_600_000 ).toISOString()
    .slice( 0, 10 ),
}

const minutes = ( base: string, plus: number, seconds = 0 ): Date => {
  return new Date( new Date( base ).getTime() + plus * 60_000 + seconds * 1000 )
}

const START = '2026-11-10T10:00:00.000Z'

const open: OpenSession = {
  id: 's1',
  started_at: START,
  ended_at: START,
  day: '2026-11-10',
}

describe( 'nextSession', () => {
  it( 'starts a session with the final card credit when there is none', () => {
    expect( nextSession( undefined, new Date( START ), options ) ).toEqual( {
      kind: 'start',
      started_at: START,
      ended_at: START,
      day: '2026-11-10',
      seconds: 30,
    } )
  } )

  it( 'extends a session whose last answer is within the gap', () => {
    expect( nextSession( open, minutes( START, 2 ), options ) ).toEqual( {
      kind: 'extend',
      id: 's1',
      ended_at: minutes( START, 2 ).toISOString(),
      seconds: 120 + 30,
    } )
  } )

  it( 'measures from the first answer to the last, not between neighbours', () => {
    const later: OpenSession = { ...open, ended_at: minutes( START, 4 ).toISOString() }

    expect( nextSession( later, minutes( START, 8 ), options ) ).toMatchObject( {
      kind: 'extend',
      seconds: 8 * 60 + 30,
    } )
  } )

  it( 'extends at exactly the gap and starts a new session one second past it', () => {
    expect( nextSession( open, minutes( START, 5 ), options ).kind ).toBe( 'extend' )
    expect( nextSession( open, minutes( START, 5, 1 ), options ) ).toMatchObject( {
      kind: 'start',
      started_at: minutes( START, 5, 1 ).toISOString(),
      seconds: 30,
    } )
  } )

  it( 'follows the gap setting', () => {
    expect( nextSession( open, minutes( START, 8 ), { ...options, gapMinutes: 10 } ).kind )
      .toBe( 'extend' )
    expect( nextSession( open, minutes( START, 2 ), { ...options, gapMinutes: 1 } ).kind )
      .toBe( 'start' )
  } )

  it( 'follows the final card setting', () => {
    expect( nextSession( open, minutes( START, 1 ), { ...options, finalCardSeconds: 0 } ) )
      .toMatchObject( { seconds: 60 } )
  } )

  it( 'never records less than a second, even with no final card credit', () => {
    expect( nextSession( undefined, new Date( START ), { ...options, finalCardSeconds: 0 } ) )
      .toMatchObject( { kind: 'start', seconds: 1 } )
    expect( nextSession( open, new Date( START ), { ...options, finalCardSeconds: 0 } ) )
      .toMatchObject( { kind: 'extend', seconds: 1 } )
  } )

  it( 'keeps the day a session started on when it runs past the day boundary', () => {
    const late = '2026-11-10T19:58:00.000Z'
    const session: OpenSession = {
      id: 's2',
      started_at: late,
      ended_at: late,
      day: '2026-11-10',
    }
    const step = nextSession( session, minutes( late, 4 ), options )

    expect( step.kind ).toBe( 'extend' )
    expect( step ).not.toHaveProperty( 'day' )
    expect( options.dayOf( minutes( late, 4 ) ) ).toBe( '2026-11-11' )
  } )

  it( 'takes the day of the answer that starts a session', () => {
    expect( nextSession( undefined, new Date( '2026-11-10T20:30:00.000Z' ), options ) )
      .toMatchObject( { day: '2026-11-11' } )
  } )

  it( 'does not move the end of a session back for an answer stamped earlier', () => {
    const later: OpenSession = { ...open, ended_at: minutes( START, 3 ).toISOString() }

    expect( nextSession( later, minutes( START, 1 ), options ) ).toMatchObject( {
      kind: 'extend',
      ended_at: minutes( START, 3 ).toISOString(),
      seconds: 3 * 60 + 30,
    } )
  } )
} )
