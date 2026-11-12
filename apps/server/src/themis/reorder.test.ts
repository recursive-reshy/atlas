// Packages
import { describe, expect, it } from 'vitest'
// Themis
import { reordered } from './reorder.js'

describe( 'reordered', () => {
  const ids = [ 'a', 'b', 'c', 'd' ]

  it( 'moves an id to the index given', () => {
    expect( reordered( ids, 'd', 0 ) ).toEqual( [ 'd', 'a', 'b', 'c' ] )
    expect( reordered( ids, 'a', 2 ) ).toEqual( [ 'b', 'c', 'a', 'd' ] )
  } )

  it( 'puts an id past the end at the end', () => {
    expect( reordered( ids, 'a', 99 ) ).toEqual( [ 'b', 'c', 'd', 'a' ] )
  } )

  it( 'does not change the list it is given', () => {
    reordered( ids, 'c', 0 )
    expect( ids ).toEqual( [ 'a', 'b', 'c', 'd' ] )
  } )
} )
