// Vitest
import { describe, expect, it } from 'vitest'
// App
import { formatExpiry } from './expiry'

const now = Date.parse( '2026-10-15T12:00:00.000Z' )
const at = ( minutes: number, seconds = 0 ): string => {
  return new Date( now + ( minutes * 60 + seconds ) * 1000 ).toISOString()
}

describe( 'formatExpiry', () => {
  it.each( [
    [ at( 5 * 60 ), 'expires in 5h' ],
    [ at( 4 * 60 + 20 ), 'expires in 5h' ],
    [ at( 24 * 60 ), 'expires in 24h' ],
    [ at( 91 ), 'expires in 2h' ],
    [ at( 90 ), 'expires in 90m' ],
    [ at( 20 ), 'expires in 20m' ],
    [ at( 1, 1 ), 'expires in 2m' ],
    [ at( 1 ), 'expires in 1m' ],
    [ at( 0, 59 ), 'expiring now' ],
    [ at( 0 ), 'expired' ],
    [ at( -10 ), 'expired' ],
  ] )( 'formats %s as "%s"', ( expiresAt, expected ) => {
    expect( formatExpiry( expiresAt, now ) ).toBe( expected )
  } )
} )
