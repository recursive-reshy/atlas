// Vitest
import { describe, expect, it } from 'vitest'
// App
import { formatBytes } from './formatBytes'

describe( 'formatBytes', () => {
  it.each( [
    [ 0, '0 B' ],
    [ 1023, '1023 B' ],
    [ 1536, '1.5 KB' ],
    [ 1_572_864, '1.5 MB' ],
    [ 1_610_612_736, '1.5 GB' ],
  ] )( 'formats %i as %s', ( bytes, text ) => {
    expect( formatBytes( bytes ) ).toBe( text )
  } )
} )
