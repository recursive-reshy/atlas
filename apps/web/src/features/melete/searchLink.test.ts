// Vitest
import { describe, expect, it } from 'vitest'
// App
import { searchUrl } from './searchLink'

describe( 'searchUrl', () => {
  it.each( [ 'video', 'talk' ] as const )( 'searches YouTube for a %s', ( kind ) => {
    expect( searchUrl( kind, 'matt pocock unions' ) )
      .toBe( 'https://www.youtube.com/results?search_query=matt%20pocock%20unions' )
  } )

  it.each( [ 'book', 'docs', 'course', 'article', 'other' ] as const )(
    'searches the web for a %s',
    ( kind ) => {
      expect( searchUrl( kind, 'effective typescript' ) )
        .toBe( 'https://www.google.com/search?q=effective%20typescript' )
    },
  )

  it( 'escapes characters that would change the query', () => {
    expect( searchUrl( 'book', 'c++ & rust #1?' ) )
      .toBe( 'https://www.google.com/search?q=c%2B%2B%20%26%20rust%20%231%3F' )
  } )
} )
