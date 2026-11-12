// Packages
import { describe, expect, it } from 'vitest'
// Calendar
import { matchRule } from './rules.js'
import type { MatchableRule } from './rules.js'

const rule = ( id: string, phrase: string, position: number ): MatchableRule => ( {
  id,
  phrase,
  position,
  subject_id: null,
  goal_id: `goal-${ id }`,
} )

describe( 'matchRule', () => {
  it.each( [
    [ 'Gym session', 'gym', 'a' ],
    [ 'GYM', 'gym', 'a' ],
    [ 'morning gym', 'Gym', 'a' ],
    [ 'Leg day at the gym!', 'gym', 'a' ],
    [ 'gymnastics', 'gym', 'a' ],
    [ 'Café ☕ Standup', 'café', 'a' ],
  ] )( 'matches "%s" with the phrase "%s"', ( title, phrase, id ) => {
    expect( matchRule( title, [ rule( id, phrase, 0 ) ] )?.id ).toBe( id )
  } )

  it( 'matches nothing when no phrase is contained', () => {
    expect( matchRule( 'Dentist', [ rule( 'a', 'gym', 0 ), rule( 'b', 'run', 1 ) ] ) )
      .toBeUndefined()
  } )

  it( 'matches nothing with no rules or an empty title', () => {
    expect( matchRule( 'Gym', [] ) ).toBeUndefined()
    expect( matchRule( '', [ rule( 'a', 'gym', 0 ) ] ) ).toBeUndefined()
  } )

  it( 'takes the first rule by position when several match, whatever the order given', () => {
    const rules = [
      rule( 'late', 'gym', 5 ),
      rule( 'early', 'session', 1 ),
      rule( 'mid', 'gym', 3 ),
    ]

    expect( matchRule( 'Gym session', rules )?.id ).toBe( 'early' )
    expect( matchRule( 'Gym', rules )?.id ).toBe( 'mid' )
  } )

  it( 'ignores a phrase that is only spaces, and trims the others', () => {
    expect( matchRule( 'Gym', [ rule( 'a', '   ', 0 ) ] ) ).toBeUndefined()
    expect( matchRule( 'Gym', [ rule( 'a', ' gym ', 0 ) ] )?.id ).toBe( 'a' )
  } )

  it( 'does not read the phrase as a pattern', () => {
    expect( matchRule( 'Gym', [ rule( 'a', 'g.m', 0 ) ] ) ).toBeUndefined()
    expect( matchRule( 'Plan (Q4)', [ rule( 'a', '(q4)', 0 ) ] )?.id ).toBe( 'a' )
  } )

  it( 'does not change the rules it is given', () => {
    const rules = [ rule( 'b', 'x', 2 ), rule( 'a', 'y', 1 ) ]

    matchRule( 'x', rules )
    expect( rules.map( ( { id } ) => id ) ).toEqual( [ 'b', 'a' ] )
  } )
} )
