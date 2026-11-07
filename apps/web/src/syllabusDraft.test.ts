// Vitest
import { describe, expect, it } from 'vitest'
// App
import {
  addConcept,
  addSection,
  conceptCount,
  isDirty,
  moveConcept,
  moveSection,
  problemWith,
  removeConcept,
  removeSection,
  setConcept,
  setSectionName,
  toDraft,
  toEdit,
} from './syllabusDraft'
import {
  JOINS_ID,
  SECTION_ONE,
  SECTION_TWO,
  SQL_ID,
  syllabusFixture,
  WINDOWS_ID,
} from './test-support/syllabus.fixture'

const draft = () => toDraft( syllabusFixture() )

const shape = ( sections: ReturnType< typeof draft > ): string[][] => {
  return sections.map( ( { concepts } ) => concepts.map( ( { name } ) => name ) )
}

describe( 'toDraft and toEdit', () => {
  it( 'keep the ids of what is stored, and make an edit without any for what is new', () => {
    const edit = toEdit( draft() )

    expect( edit.sections[ 0 ].id ).toBe( SECTION_ONE )
    expect( edit.sections[ 0 ].concepts[ 1 ] )
      .toEqual( { id: JOINS_ID, name: 'Joins', description: 'Combining tables' } )

    const added = toEdit( addSection( draft(), 'new-section', 'new-concept' ) )

    expect( added.sections[ 2 ] ).toEqual( {
      name: '',
      concepts: [ { name: '', description: '' } ],
    } )
  } )

  it( 'trim names and descriptions', () => {
    const edited = setConcept( draft(), SECTION_ONE, SQL_ID, {
      name: '  SQL  ',
      description: ' x ',
    } )

    expect( toEdit( edited ).sections[ 0 ].concepts[ 0 ] )
      .toEqual( { id: SQL_ID, name: 'SQL', description: 'x' } )
  } )
} )

describe( 'moveConcept', () => {
  it( 'moves a concept one place within its section', () => {
    expect( shape( moveConcept( draft(), SECTION_ONE, SQL_ID, 1 ) ) )
      .toEqual( [ [ 'Joins', 'SQL' ], [ 'Windows' ] ] )
    expect( shape( moveConcept( draft(), SECTION_ONE, JOINS_ID, -1 ) ) )
      .toEqual( [ [ 'Joins', 'SQL' ], [ 'Windows' ] ] )
  } )

  it( 'moves the last concept of a section down into the start of the next one', () => {
    expect( shape( moveConcept( draft(), SECTION_ONE, JOINS_ID, 1 ) ) )
      .toEqual( [ [ 'SQL' ], [ 'Joins', 'Windows' ] ] )
  } )

  it( 'moves the first concept of a section up to the end of the one before', () => {
    expect( shape( moveConcept( draft(), SECTION_TWO, WINDOWS_ID, -1 ) ) )
      .toEqual( [ [ 'SQL', 'Joins', 'Windows' ], [] ] )
  } )

  it( 'does nothing at the very top or the very bottom', () => {
    expect( moveConcept( draft(), SECTION_ONE, SQL_ID, -1 ) ).toEqual( draft() )
    expect( moveConcept( draft(), SECTION_TWO, WINDOWS_ID, 1 ) ).toEqual( draft() )
  } )

  it( 'keeps the moved concept\'s id, so its mappings follow it', () => {
    const moved = moveConcept( draft(), SECTION_ONE, JOINS_ID, 1 )

    expect( toEdit( moved ).sections[ 1 ].concepts[ 0 ].id ).toBe( JOINS_ID )
  } )
} )

describe( 'moveSection', () => {
  it( 'swaps a section with its neighbour, and stops at the ends', () => {
    expect( moveSection( draft(), SECTION_ONE, 1 ).map( ( { name } ) => name ) )
      .toEqual( [ 'Advanced', 'Basics' ] )
    expect( moveSection( draft(), SECTION_TWO, -1 ).map( ( { name } ) => name ) )
      .toEqual( [ 'Advanced', 'Basics' ] )
    expect( moveSection( draft(), SECTION_ONE, -1 ) ).toEqual( draft() )
    expect( moveSection( draft(), SECTION_TWO, 1 ) ).toEqual( draft() )
  } )
} )

describe( 'adding, renaming and removing', () => {
  it( 'adds a blank concept at the end of a section', () => {
    expect( toEdit( addConcept( draft(), SECTION_TWO, 'fresh' ) ).sections[ 1 ].concepts )
      .toHaveLength( 2 )
    expect( addConcept( draft(), SECTION_TWO, 'fresh' )[ 1 ].concepts[ 1 ] )
      .toEqual( { key: 'fresh', name: '', description: '' } )
  } )

  it( 'renames a section and edits a concept without touching the rest', () => {
    const edited = setConcept(
      setSectionName( draft(), SECTION_ONE, 'Fundamentals' ),
      SECTION_TWO,
      WINDOWS_ID,
      { description: 'Window frames' },
    )

    expect( edited[ 0 ].name ).toBe( 'Fundamentals' )
    expect( edited[ 1 ].concepts[ 0 ] )
      .toMatchObject( { name: 'Windows', description: 'Window frames' } )
    expect( edited[ 0 ].concepts ).toEqual( draft()[ 0 ].concepts )
  } )

  it( 'removes a concept, and a section with its concepts', () => {
    expect( shape( removeConcept( draft(), SECTION_ONE, SQL_ID ) ) )
      .toEqual( [ [ 'Joins' ], [ 'Windows' ] ] )
    expect( shape( removeSection( draft(), SECTION_ONE ) ) ).toEqual( [ [ 'Windows' ] ] )
  } )
} )

describe( 'conceptCount, problemWith and isDirty', () => {
  it( 'counts the concepts across sections', () => {
    expect( conceptCount( draft() ) ).toBe( 3 )
  } )

  it( 'finds no problem with a stored syllabus', () => {
    expect( problemWith( draft() ) ).toBeNull()
  } )

  it.each( [
    [ 'a blank section name', setSectionName( draft(), SECTION_ONE, '  ' ), 'Name every section' ],
    [
      'a blank concept name',
      setConcept( draft(), SECTION_ONE, SQL_ID, { name: ' ' } ),
      'Name every concept',
    ],
    [
      'an empty section',
      removeConcept( draft(), SECTION_TWO, WINDOWS_ID ),
      'Every section needs a concept',
    ],
  ] )( 'names the problem of %s', ( _label, edited, message ) => {
    expect( problemWith( edited ) ).toBe( message )
  } )

  it( 'refuses more than 80 concepts', () => {
    let big = draft()

    for( let index = 0; index < 78; index++ ) {
      big = addConcept( big, SECTION_ONE, `c${ index }` )
      big = setConcept( big, SECTION_ONE, `c${ index }`, { name: `Concept ${ index }` } )
    }

    expect( conceptCount( big ) ).toBe( 81 )
    expect( problemWith( big ) ).toBe( 'A syllabus has at most 80 concepts' )
  } )

  it( 'is dirty only when the edit differs from the stored syllabus', () => {
    expect( isDirty( draft(), syllabusFixture() ) ).toBe( false )
    expect( isDirty( setSectionName( draft(), SECTION_ONE, 'Basics ' ), syllabusFixture() ) )
      .toBe( false )
    expect( isDirty( moveSection( draft(), SECTION_ONE, 1 ), syllabusFixture() ) ).toBe( true )
    expect( isDirty( addSection( draft(), 'k', 'c' ), syllabusFixture() ) ).toBe( true )
  } )
} )
