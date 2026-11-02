// Packages
import { describe, it, expect } from 'vitest'
// Paragraphs
import { splitParagraphs } from './paragraphs.js'

const sentence = 'This is a sentence of moderate length that says very little.'

describe( 'splitParagraphs', () => {
  it( 'keeps the text\'s own blank-line breaks', () => {
    expect( splitParagraphs( 'One.\n\nTwo.\n\n\nThree.' ) ).toEqual( [ 'One.', 'Two.', 'Three.' ] )
  } )

  it( 'trims whitespace and drops empty paragraphs', () => {
    expect( splitParagraphs( '  One.  \n\n   \n\n Two. \n' ) ).toEqual( [ 'One.', 'Two.' ] )
  } )

  it( 'returns an empty array for empty or blank text', () => {
    expect( splitParagraphs( '' ) ).toEqual( [] )
    expect( splitParagraphs( ' \n\n ' ) ).toEqual( [] )
  } )

  it( 'keeps a block of 1,200 characters or fewer whole', () => {
    const block = 'a'.repeat( 1200 )

    expect( splitParagraphs( block ) ).toEqual( [ block ] )
  } )

  it( 'splits a longer block at sentence ends into paragraphs of 400 to 800 characters', () => {
    const block = Array.from( { length: 60 }, () => sentence ).join( ' ' )
    const result = splitParagraphs( block )

    expect( result.length ).toBeGreaterThan( 1 )
    expect( result.join( ' ' ) ).toBe( block )

    for( const paragraph of result.slice( 0, -1 ) ) {
      expect( paragraph.length ).toBeGreaterThanOrEqual( 400 )
      expect( paragraph.length ).toBeLessThanOrEqual( 800 )
      expect( paragraph.endsWith( '.' ) ).toBe( true )
    }
  } )

  it( 'does not merge a short remainder into nothing', () => {
    const block = Array.from( { length: 25 }, () => sentence ).join( ' ' )

    expect( splitParagraphs( block ).every( ( paragraph ) => paragraph !== '' ) ).toBe( true )
  } )

  it( 'splits a long block with no sentence ends without losing text', () => {
    const block = 'word '.repeat( 600 ).trim()

    expect( splitParagraphs( block ).join( ' ' ) ).toBe( block )
  } )

  it( 'splits only the long blocks of a multi-block text', () => {
    const long = Array.from( { length: 40 }, () => sentence ).join( ' ' )
    const result = splitParagraphs( `Short.\n\n${ long }` )

    expect( result[ 0 ] ).toBe( 'Short.' )
    expect( result.length ).toBeGreaterThan( 2 )
  } )
} )
