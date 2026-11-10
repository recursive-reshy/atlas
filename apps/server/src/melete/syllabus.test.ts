// Packages
import { describe, expect, it } from 'vitest'
// Melete
import {
  MAX_SYLLABUS_NOTES,
  NOTE_OPENING_CHARACTERS,
  buildSyllabusUser,
  noteOpening,
  processSyllabus,
} from './syllabus.js'

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

describe( 'noteOpening', () => {
  it( 'is the first 300 characters of the body with whitespace collapsed', () => {
    const body = `# Title\n\n${ 'word '.repeat( 200 ) }`
    const opening = noteOpening( body )

    expect( NOTE_OPENING_CHARACTERS ).toBe( 300 )
    expect( opening.length ).toBeLessThanOrEqual( 300 )
    expect( opening.startsWith( '# Title word word' ) ).toBe( true )
    expect( opening ).not.toContain( '\n' )
  } )

  it( 'keeps a short body whole, trimmed', () => {
    expect( noteOpening( '  A short note.\n' ) ).toBe( 'A short note.' )
    expect( noteOpening( '' ) ).toBe( '' )
  } )
} )

describe( 'buildSyllabusUser', () => {
  const input = {
    name: 'Data Engineering',
    level: 'working' as const,
    intent: 'Pass the GCP exam',
    notes: [
      { title: 'BigQuery', opening: 'BigQuery is a warehouse.' },
      { title: 'Empty', opening: '' },
    ],
  }

  it( 'states the subject, the level, the intent and each note', () => {
    expect( buildSyllabusUser( input ) ).toBe( [
      'Subject: Data Engineering',
      'Target level: Working knowledge',
      'Intent: Pass the GCP exam',
      '',
      'Notes already in the folder:',
      '<source_content>',
      '- BigQuery: BigQuery is a warehouse.',
      '- Empty',
      '</source_content>',
    ].join( '\n' ) )
  } )

  it.each( [
    [ 'awareness', 'Awareness' ],
    [ 'working', 'Working knowledge' ],
    [ 'proficient', 'Proficient' ],
    [ 'expert', 'Expert' ],
  ] as const )( 'labels the level %s as %s', ( level, label ) => {
    expect( buildSyllabusUser( { ...input, level } ) ).toContain( `Target level: ${ label }` )
  } )

  it( 'leaves out the intent when there is none', () => {
    const text = buildSyllabusUser( { ...input, intent: null } )

    expect( text ).not.toContain( 'Intent' )
  } )

  it( 'says so when the folder has no notes', () => {
    expect( buildSyllabusUser( { ...input, notes: [] } ) ).toContain( 'No notes yet.' )
  } )

  it( 'names at most 60 notes', () => {
    const notes = Array.from( { length: 80 }, ( _, index ) => {
      return { title: `Note ${ index }`, opening: '' }
    } )
    const lines = buildSyllabusUser( { ...input, notes } ).split( '\n' ).filter( ( line ) => {
      return line.startsWith( '- ' )
    } )

    expect( MAX_SYLLABUS_NOTES ).toBe( 60 )
    expect( lines ).toHaveLength( 60 )
    expect( lines.at( -1 ) ).toBe( '- Note 59' )
  } )
} )
