// Packages
import { describe, it, expect } from 'vitest'
// Melete
import { buildSuggestUser, processSuggestions } from './suggest.js'

const item = ( overrides: Record< string, string > = {} ) => ( {
  title: 'The Rust Book',
  by: 'Klabnik and Nichols',
  kind: 'book' as const,
  why: 'The standard introduction.',
  query: 'rust programming language book',
  ...overrides,
} )

describe( 'processSuggestions', () => {
  it( 'keeps clean suggestions as they are', () => {
    expect( processSuggestions( { suggestions: [ item() ] } ) ).toEqual( [ item() ] )
  } )

  it( 'trims every field', () => {
    expect( processSuggestions( { suggestions: [ item( {
      title: '  The Rust Book ',
      by: ' Klabnik ',
      why: ' Fits. ',
      query: ' rust book ',
    } ) ] } ) ).toEqual( [ item( {
      title: 'The Rust Book',
      by: 'Klabnik',
      why: 'Fits.',
      query: 'rust book',
    } ) ] )
  } )

  it.each( [
    [ 'https://doc.rust-lang.org/book/ is free', 'is free' ],
    [ 'Read http://example.com now', 'Read now' ],
    [ 'See HTTPS://EXAMPLE.COM/x', 'See' ],
    [ 'On www.example.com today', 'On today' ],
    [ 'Two https://a.b/c and http://d.e/f links', 'Two and links' ],
  ] )( 'removes the link from "%s"', ( text, expected ) => {
    const [ result ] = processSuggestions( { suggestions: [ item( { why: text } ) ] } )

    expect( result?.why ).toBe( expected )
  } )

  it( 'removes links from every field', () => {
    const [ result ] = processSuggestions( { suggestions: [ item( {
      title: 'Book https://x.io',
      by: 'Me http://y.io',
      why: 'Why https://z.io',
      query: 'rust https://w.io book',
    } ) ] } )

    expect( JSON.stringify( result ) ).not.toMatch( /https?:|www\./i )
    expect( result?.query ).toBe( 'rust book' )
  } )

  it( 'leaves a plain word such as http alone', () => {
    const [ result ] = processSuggestions( { suggestions: [ item( {
      title: 'HTTP: The Definitive Guide',
      query: 'http caching tutorial',
    } ) ] } )

    expect( result ).toMatchObject( {
      title: 'HTTP: The Definitive Guide',
      query: 'http caching tutorial',
    } )
  } )

  it( 'drops a suggestion left with no title or no query', () => {
    expect( processSuggestions( { suggestions: [
      item( { title: 'https://only.a/link' } ),
      item( { query: 'http://only.a/link' } ),
      item( { title: 'Kept' } ),
    ] } ).map( ( { title } ) => title ) ).toEqual( [ 'Kept' ] )
  } )

  it( 'keeps at most five, in order', () => {
    const many = Array.from( { length: 7 }, ( _, index ) => item( { title: `Book ${ index }` } ) )

    expect( processSuggestions( { suggestions: many } ).map( ( { title } ) => title ) )
      .toEqual( [ 'Book 0', 'Book 1', 'Book 2', 'Book 3', 'Book 4' ] )
  } )
} )

describe( 'buildSuggestUser', () => {
  const input = {
    subject: 'Rust',
    level: 'working' as const,
    intent: 'Build a CLI',
    section: 'Basics',
    concept: 'Ownership',
    description: 'One owner at a time',
  }

  it( 'gives the subject, level, intent, section and concept', () => {
    expect( buildSuggestUser( input ) ).toBe( [
      'Subject: Rust',
      'Target level: Working knowledge',
      'Intent: Build a CLI',
      '',
      'Section: Basics',
      'Concept: Ownership',
      'Description: One owner at a time',
    ].join( '\n' ) )
  } )

  it( 'leaves out an intent and a description that are not there', () => {
    const user = buildSuggestUser( { ...input, intent: null, description: '' } )

    expect( user ).not.toContain( 'Intent' )
    expect( user ).not.toContain( 'Description' )
  } )
} )
