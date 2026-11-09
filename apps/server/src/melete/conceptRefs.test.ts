// Packages
import { describe, it, expect } from 'vitest'
// Melete
import { buildConceptList, conceptRefs, resolveRefs } from './conceptRefs.js'

const concepts = [
  { id: 'id-1', name: 'Generics', description: 'Types with parameters' },
  { id: 'id-2', name: 'Narrowing', description: '' },
  { id: 'id-3', name: 'Unions', description: 'Either-or types' },
]

describe( 'conceptRefs', () => {
  it( 'numbers the concepts c1…cN in the order given', () => {
    expect( conceptRefs( concepts ).map( ( { ref, id } ) => [ ref, id ] ) ).toEqual( [
      [ 'c1', 'id-1' ],
      [ 'c2', 'id-2' ],
      [ 'c3', 'id-3' ],
    ] )
  } )
} )

describe( 'buildConceptList', () => {
  it( 'writes one line per concept, with the description when there is one', () => {
    expect( buildConceptList( concepts ) ).toBe( [
      'c1: Generics — Types with parameters',
      'c2: Narrowing',
      'c3: Unions — Either-or types',
    ].join( '\n' ) )
  } )
} )

describe( 'resolveRefs', () => {
  it( 'maps refs to ids in the order given', () => {
    expect( resolveRefs( [ 'c3', 'c1' ], concepts ) ).toEqual( [ 'id-3', 'id-1' ] )
  } )

  it( 'drops unknown refs and repeats, and ignores case and spacing', () => {
    expect( resolveRefs( [ 'c9', ' C2 ', 'c2', 'id-1', 'x' ], concepts ) ).toEqual( [ 'id-2' ] )
  } )

  it( 'keeps at most 5', () => {
    const many = Array.from( { length: 8 }, ( _, index ) => ( {
      id: `id-${ index }`,
      name: `Concept ${ index }`,
      description: '',
    } ) )

    expect( resolveRefs( many.map( ( _, index ) => `c${ index + 1 }` ), many ) )
      .toHaveLength( 5 )
  } )
} )
