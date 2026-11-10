// Packages
import { describe, expect, it } from 'vitest'
// Melete
import { processSyllabus } from './syllabus.js'

const concept = ( name: string, description = '' ) => ( { name, description } )

const names = ( sections: { concepts: { name: string }[] }[] ): string[][] => {
  return sections.map( ( { concepts } ) => concepts.map( ( { name } ) => name ) )
}

describe( 'processSyllabus', () => {
  it( 'keeps the order of sections and concepts', () => {
    const { sections, capped } = processSyllabus( { sections: [
      { name: 'Basics', concepts: [ concept( 'SQL', 'Queries' ), concept( 'Joins' ) ] },
      { name: 'Advanced', concepts: [ concept( 'Windows' ) ] },
    ] } )

    expect( sections ).toEqual( [
      { name: 'Basics', concepts: [ concept( 'SQL', 'Queries' ), concept( 'Joins' ) ] },
      { name: 'Advanced', concepts: [ concept( 'Windows' ) ] },
    ] )
    expect( capped ).toBe( 0 )
  } )

  it( 'trims names and descriptions', () => {
    const { sections } = processSyllabus( { sections: [
      { name: '  Basics ', concepts: [ concept( '  SQL  ', '  Queries \n' ) ] },
    ] } )

    expect( sections ).toEqual( [ { name: 'Basics', concepts: [ concept( 'SQL', 'Queries' ) ] } ] )
  } )

  it( 'drops concepts with an empty name', () => {
    const { sections } = processSyllabus( { sections: [
      {
        name: 'Basics',
        concepts: [ concept( '   ', 'No name' ), concept( 'SQL' ), concept( '' ) ],
      },
    ] } )

    expect( names( sections ) ).toEqual( [ [ 'SQL' ] ] )
  } )

  it( 'names a section with an empty name General, so its concepts are not lost', () => {
    const { sections } = processSyllabus( { sections: [
      { name: ' ', concepts: [ concept( 'SQL' ) ] },
    ] } )

    expect( sections ).toEqual( [ { name: 'General', concepts: [ concept( 'SQL' ) ] } ] )
  } )

  it( 'drops a later concept with the same name, ignoring case, across sections', () => {
    const { sections } = processSyllabus( { sections: [
      { name: 'One', concepts: [ concept( 'Joins', 'first' ), concept( 'joins', 'second' ) ] },
      { name: 'Two', concepts: [ concept( 'JOINS' ), concept( 'Indexes' ) ] },
    ] } )

    expect( sections ).toEqual( [
      { name: 'One', concepts: [ concept( 'Joins', 'first' ) ] },
      { name: 'Two', concepts: [ concept( 'Indexes' ) ] },
    ] )
  } )

  it( 'drops a section left with no concepts', () => {
    const { sections } = processSyllabus( { sections: [
      { name: 'Empty', concepts: [] },
      { name: 'Blank', concepts: [ concept( ' ' ) ] },
      { name: 'Copy', concepts: [ concept( 'SQL' ) ] },
      { name: 'Only copies', concepts: [ concept( 'sql' ) ] },
    ] } )

    expect( sections.map( ( { name } ) => name ) ).toEqual( [ 'Copy' ] )
  } )

  it( 'caps the syllabus at 80 concepts, dropping the later ones and counting them', () => {
    const many = ( prefix: string, count: number ) => {
      return Array.from( { length: count }, ( _, index ) => concept( `${ prefix } ${ index }` ) )
    }
    const { sections, capped } = processSyllabus( { sections: [
      { name: 'A', concepts: many( 'A', 50 ) },
      { name: 'B', concepts: many( 'B', 40 ) },
      { name: 'C', concepts: many( 'C', 5 ) },
    ] } )

    expect( sections.flatMap( ( { concepts } ) => concepts ) ).toHaveLength( 80 )
    expect( sections.map( ( { name, concepts } ) => [ name, concepts.length ] ) )
      .toEqual( [ [ 'A', 50 ], [ 'B', 30 ] ] )
    expect( capped ).toBe( 15 )
  } )

  it( 'returns no sections when nothing usable is left', () => {
    expect( processSyllabus( { sections: [ { name: 'Nothing', concepts: [ concept( '' ) ] } ] } ) )
      .toEqual( { sections: [], capped: 0 } )
  } )
} )
