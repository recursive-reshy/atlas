// Packages
import { describe, expect, it } from 'vitest'
// Calendar
import { measuredOverlap } from './overlap.js'

const at = ( time: string ): string => `2026-11-09T${ time }:00.000Z`

const event = { started_at: at( '07:00' ), ended_at: at( '08:00' ) }

const entry = ( from: string, to: string ) => ( { started_at: at( from ), ended_at: at( to ) } )

describe( 'measuredOverlap', () => {
  it( 'is 0 with no measured entries', () => {
    expect( measuredOverlap( event, [] ) ).toBe( 0 )
  } )

  it.each( [
    [ 'no overlap before', '05:00', '06:59' ],
    [ 'no overlap after', '08:01', '09:00' ],
    [ 'touching at the start', '06:00', '07:00' ],
    [ 'touching at the end', '08:00', '09:00' ],
  ] )( 'is 0 for %s', ( _name, from, to ) => {
    expect( measuredOverlap( event, [ entry( from, to ) ] ) ).toBe( 0 )
  } )

  it( 'counts only the part of a partial overlap that falls inside the event', () => {
    expect( measuredOverlap( event, [ entry( '06:30', '07:20' ) ] ) ).toBe( 20 * 60 )
    expect( measuredOverlap( event, [ entry( '07:40', '09:00' ) ] ) ).toBe( 20 * 60 )
  } )

  it( 'is the whole event when a measured entry covers it exactly', () => {
    expect( measuredOverlap( event, [ entry( '07:00', '08:00' ) ] ) ).toBe( 3600 )
  } )

  it( 'is the whole event, not more, when a measured entry spans past it', () => {
    expect( measuredOverlap( event, [ entry( '05:00', '12:00' ) ] ) ).toBe( 3600 )
  } )

  it( 'counts a measured entry inside the event as its own length', () => {
    expect( measuredOverlap( event, [ entry( '07:10', '07:25' ) ] ) ).toBe( 15 * 60 )
  } )

  it( 'adds separate measured entries', () => {
    expect( measuredOverlap( event, [ entry( '07:00', '07:10' ), entry( '07:30', '07:45' ) ] ) )
      .toBe( 25 * 60 )
  } )

  it( 'does not subtract time twice when measured entries overlap each other', () => {
    expect( measuredOverlap( event, [ entry( '07:00', '07:30' ), entry( '07:20', '07:50' ) ] ) )
      .toBe( 50 * 60 )
    expect( measuredOverlap( event, [ entry( '07:00', '07:50' ), entry( '07:10', '07:20' ) ] ) )
      .toBe( 50 * 60 )
  } )

  it( 'does not depend on the order of the entries', () => {
    const entries = [
      entry( '07:40', '07:55' ),
      entry( '07:00', '07:10' ),
      entry( '07:05', '07:45' ),
    ]

    expect( measuredOverlap( event, [ ...entries ].reverse() ) )
      .toBe( measuredOverlap( event, entries ) )
    expect( measuredOverlap( event, entries ) ).toBe( 55 * 60 )
  } )

  it( 'ignores an entry with no length or one that ends before it starts', () => {
    expect( measuredOverlap( event, [ entry( '07:30', '07:30' ), entry( '07:50', '07:40' ) ] ) )
      .toBe( 0 )
  } )

  it( 'does not change the entries it is given', () => {
    const entries = [ entry( '07:30', '07:40' ), entry( '07:00', '07:10' ) ]

    measuredOverlap( event, entries )
    expect( entries.map( ( { started_at } ) => started_at ) )
      .toEqual( [ at( '07:30' ), at( '07:00' ) ] )
  } )
} )
