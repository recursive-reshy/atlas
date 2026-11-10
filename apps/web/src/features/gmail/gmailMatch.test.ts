// Vitest
import { describe, expect, it } from 'vitest'
// App
import { fromMatch, matchKey, toMatch } from './gmailMatch'

describe( 'toMatch', () => {
  it( 'builds a labels match', () => {
    expect( toMatch( { kind: 'labels', labelIds: [ 'A', 'B' ], query: 'ignored' } ) )
      .toEqual( { kind: 'labels', label_ids: [ 'A', 'B' ] } )
  } )

  it( 'builds a search match with the query trimmed', () => {
    expect( toMatch( { kind: 'query', labelIds: [ 'A' ], query: '  from:a@b.c ' } ) )
      .toEqual( { kind: 'query', query: 'from:a@b.c' } )
  } )

  it( 'has no match for no labels, a blank query or more than ten labels', () => {
    const many = Array.from( { length: 11 }, ( _, index ) => `L${ index }` )

    expect( toMatch( { kind: 'labels', labelIds: [], query: '' } ) ).toBeNull()
    expect( toMatch( { kind: 'query', labelIds: [], query: '   ' } ) ).toBeNull()
    expect( toMatch( { kind: 'labels', labelIds: many, query: '' } ) ).toBeNull()
  } )
} )

describe( 'fromMatch', () => {
  it( 'starts a draft from a labels match', () => {
    expect( fromMatch( { kind: 'labels', label_ids: [ 'A' ] } ) )
      .toEqual( { kind: 'labels', labelIds: [ 'A' ], query: '' } )
  } )

  it( 'starts a draft from a search match', () => {
    expect( fromMatch( { kind: 'query', query: 'from:a@b.c' } ) )
      .toEqual( { kind: 'query', labelIds: [], query: 'from:a@b.c' } )
  } )
} )

describe( 'matchKey', () => {
  it( 'is the same for the same labels in any order', () => {
    expect( matchKey( { kind: 'labels', label_ids: [ 'B', 'A' ] } ) )
      .toBe( matchKey( { kind: 'labels', label_ids: [ 'A', 'B' ] } ) )
  } )

  it( 'differs between labels, between queries, and between a label and a query', () => {
    const keys = [
      matchKey( { kind: 'labels', label_ids: [ 'A' ] } ),
      matchKey( { kind: 'labels', label_ids: [ 'B' ] } ),
      matchKey( { kind: 'query', query: 'A' } ),
      matchKey( { kind: 'query', query: 'B' } ),
      matchKey( null ),
    ]

    expect( new Set( keys ).size ).toBe( 5 )
  } )
} )
