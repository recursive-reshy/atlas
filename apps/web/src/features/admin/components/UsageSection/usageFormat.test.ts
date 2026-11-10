// Vitest
import { describe, expect, it } from 'vitest'
// App
import { formatCost, formatMinutes, sumCost } from './usageFormat'

describe( 'formatCost', () => {
  it.each( [
    [ null, '—' ],
    [ 0, '$0.00' ],
    [ 0.004, '<$0.01' ],
    [ 0.01, '$0.01' ],
    [ 1.2345, '$1.23' ],
    [ 12, '$12.00' ],
  ] )( 'formats %s as %s', ( cost, text ) => {
    expect( formatCost( cost ) ).toBe( text )
  } )
} )

describe( 'sumCost', () => {
  it( 'is null when no run has a cost', () => {
    expect( sumCost( [ null, null ] ) ).toBeNull()
    expect( sumCost( [] ) ).toBeNull()
  } )

  it( 'adds the costs that are known', () => {
    expect( sumCost( [ 1.5, null, 0.25 ] ) ).toBe( 1.75 )
  } )
} )

describe( 'formatMinutes', () => {
  it.each( [
    [ 0, '0 min' ],
    [ 29, '0 min' ],
    [ 30, '1 min' ],
    [ 90, '2 min' ],
    [ 3600, '60 min' ],
  ] )( 'formats %s seconds as %s', ( seconds, text ) => {
    expect( formatMinutes( seconds ) ).toBe( text )
  } )
} )
