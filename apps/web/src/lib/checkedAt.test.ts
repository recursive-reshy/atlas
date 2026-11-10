// Vitest
import { describe, expect, it } from 'vitest'
// App
import { formatAgo, formatChecked } from './checkedAt'

const NOW = Date.parse( '2026-10-18T10:00:00.000Z' )

describe( 'formatChecked', () => {
  it.each( [
    [ null, 'Not checked yet' ],
    [ '2026-10-18T09:59:30.000Z', 'Checked just now' ],
    [ '2026-10-18T10:00:30.000Z', 'Checked just now' ],
    [ '2026-10-18T09:59:00.000Z', 'Checked 1m ago' ],
    [ '2026-10-18T09:05:00.000Z', 'Checked 55m ago' ],
    [ '2026-10-18T09:00:00.000Z', 'Checked 1h ago' ],
    [ '2026-10-17T11:00:00.000Z', 'Checked 23h ago' ],
    [ '2026-10-17T10:00:00.000Z', 'Checked 1d ago' ],
    [ '2026-10-10T10:00:00.000Z', 'Checked 8d ago' ],
  ] )( 'reads %s as "%s"', ( checkedAt, expected ) => {
    expect( formatChecked( checkedAt, NOW ) ).toBe( expected )
  } )
} )

describe( 'formatAgo', () => {
  it.each( [
    [ '2026-10-18T09:59:30.000Z', 'just now' ],
    [ '2026-10-18T10:00:30.000Z', 'just now' ],
    [ '2026-10-18T09:59:00.000Z', '1m ago' ],
    [ '2026-10-18T09:00:00.000Z', '1h ago' ],
    [ '2026-10-17T10:00:00.000Z', '1d ago' ],
  ] )( 'reads %s as "%s"', ( at, expected ) => {
    expect( formatAgo( at, NOW ) ).toBe( expected )
  } )
} )
