// Vitest
import { describe, expect, it } from 'vitest'
// App
import { formatDate } from './formatDate'

describe( 'formatDate', () => {
  it( 'shows the UTC calendar date', () => {
    expect( formatDate( '2026-10-17T23:30:00.000Z' ) ).toBe( '2026-10-17' )
  } )

  it( 'shows nothing for a missing date', () => {
    expect( formatDate( null ) ).toBe( '' )
  } )
} )
