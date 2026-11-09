// Vitest
import { describe, expect, it } from 'vitest'
// App
import { formatStudyTime } from './formatStudyTime'

describe( 'formatStudyTime', () => {
  it.each( [
    [ 0, '0 min' ],
    [ 29, '0 min' ],
    [ 30, '1 min' ],
    [ 90, '2 min' ],
    [ 59 * 60, '59 min' ],
    [ 60 * 60, '1 h' ],
    [ 65 * 60, '1 h 5 min' ],
    [ 150 * 60, '2 h 30 min' ],
    [ 24 * 3600, '24 h' ],
  ] )( 'shows %i seconds as %s', ( seconds, expected ) => {
    expect( formatStudyTime( seconds ) ).toBe( expected )
  } )
} )
