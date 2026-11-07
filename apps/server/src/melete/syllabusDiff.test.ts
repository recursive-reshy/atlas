// Packages
import { describe, expect, it } from 'vitest'
// Shared
import type { MeleteSyllabus, MeleteSyllabusEdit } from '@atlas/shared'
// Errors
import { ValidationError } from '../errors.js'
// Melete
import { planSyllabus } from './syllabusDiff.js'

const id = ( n: number ): string => `00000000-0000-4000-8000-${ String( n ).padStart( 12, '0' ) }`

// Sections 1 and 2 hold concepts 11, 12, 13 and 21, 22
const current: MeleteSyllabus = {
  sections: [
    {
      id: id( 1 ),
      name: 'Basics',
      concepts: [
        { id: id( 11 ), name: 'SQL', description: 'Queries' },
        { id: id( 12 ), name: 'Joins', description: 'Combining tables' },
        { id: id( 13 ), name: 'Indexes', description: 'Speed' },
      ],
    },
    {
      id: id( 2 ),
      name: 'Advanced',
      concepts: [
        { id: id( 21 ), name: 'Windows', description: 'Frames' },
        { id: id( 22 ), name: 'CTEs', description: 'WITH' },
      ],
    },
  ],
}

// The syllabus as it stands, as an edit
const unchanged = (): MeleteSyllabusEdit => structuredClone( current )

const sectionOf = ( edit: MeleteSyllabusEdit, n: number ) => {
  const found = edit.sections.find( ( section ) => section.id === id( n ) )

  if( found === undefined ) {
    throw new Error( `No section ${ n }` )
  }

  return found
}

const conceptNames = ( plan: ReturnType< typeof planSyllabus > ): string[][] => {
  return plan.sections.map( ( { concepts } ) => concepts.map( ( { name } ) => name ) )
}

describe( 'planSyllabus, counting what changed', () => {
  it( 'finds nothing to do when nothing changed', () => {
    const plan = planSyllabus( current, unchanged() )

    expect( plan.diff ).toEqual( { renamed: 0, added: 0, removed: 0, moved: 0 } )
    expect( plan.removeConceptIds ).toEqual( [] )
    expect( plan.removeSectionIds ).toEqual( [] )
  } )

  it( 'counts a renamed concept, and a re-described one, as updates only', () => {
    const edit = unchanged()

    sectionOf( edit, 1 ).concepts[ 0 ].name = 'Structured Query Language'
    sectionOf( edit, 1 ).concepts[ 1 ].description = 'Linking rows across tables'

    const plan = planSyllabus( current, edit )

    expect( plan.diff ).toEqual( { renamed: 2, added: 0, removed: 0, moved: 0 } )
    expect( plan.removeConceptIds ).toEqual( [] )
    expect( plan.sections[ 0 ].concepts[ 0 ] )
      .toMatchObject( { id: id( 11 ), name: 'Structured Query Language', position: 0 } )
  } )

  it( 'does not count a section rename as a concept change', () => {
    const edit = unchanged()

    sectionOf( edit, 2 ).name = 'Hard parts'

    const plan = planSyllabus( current, edit )

    expect( plan.diff ).toEqual( { renamed: 0, added: 0, removed: 0, moved: 0 } )
    expect( plan.sections[ 1 ] ).toMatchObject( { id: id( 2 ), name: 'Hard parts', position: 1 } )
  } )

  it( 'counts a concept without an id as added, with no id in the plan', () => {
    const edit = unchanged()

    sectionOf( edit, 2 ).concepts.push( { name: 'Recursion', description: 'Self-reference' } )

    const plan = planSyllabus( current, edit )

    expect( plan.diff ).toEqual( { renamed: 0, added: 1, removed: 0, moved: 0 } )
    expect( plan.sections[ 1 ].concepts[ 2 ] )
      .toEqual( { id: null, name: 'Recursion', description: 'Self-reference', position: 2 } )
  } )

  it( 'counts a concept missing from the edit as removed, and does not count the shift', () => {
    const edit = unchanged()

    sectionOf( edit, 1 ).concepts.splice( 0, 1 )

    const plan = planSyllabus( current, edit )

    expect( plan.diff ).toEqual( { renamed: 0, added: 0, removed: 1, moved: 0 } )
    expect( plan.removeConceptIds ).toEqual( [ id( 11 ) ] )
    expect( conceptNames( plan )[ 0 ] ).toEqual( [ 'Joins', 'Indexes' ] )
    expect( plan.sections[ 0 ].concepts.map( ( { position } ) => position ) ).toEqual( [ 0, 1 ] )
  } )

  it( 'counts one concept dragged within its section as one move', () => {
    const edit = unchanged()
    const [ sql ] = sectionOf( edit, 1 ).concepts.splice( 0, 1 )

    sectionOf( edit, 1 ).concepts.push( sql )

    const plan = planSyllabus( current, edit )

    expect( plan.diff ).toEqual( { renamed: 0, added: 0, removed: 0, moved: 1 } )
    expect( conceptNames( plan )[ 0 ] ).toEqual( [ 'Joins', 'Indexes', 'SQL' ] )
  } )

  it( 'counts a concept moved to another section as one move', () => {
    const edit = unchanged()
    const [ ctes ] = sectionOf( edit, 2 ).concepts.splice( 1, 1 )

    sectionOf( edit, 1 ).concepts.splice( 1, 0, ctes )

    const plan = planSyllabus( current, edit )

    expect( plan.diff ).toEqual( { renamed: 0, added: 0, removed: 0, moved: 1 } )
    expect( conceptNames( plan ) )
      .toEqual( [ [ 'SQL', 'CTEs', 'Joins', 'Indexes' ], [ 'Windows' ] ] )
    expect( plan.sections[ 0 ].concepts[ 1 ] )
      .toMatchObject( { id: id( 22 ), position: 1 } )
  } )

  it( 'counts moving a whole section as moving no concept', () => {
    const edit = unchanged()

    edit.sections.reverse()

    const plan = planSyllabus( current, edit )

    expect( plan.diff ).toEqual( { renamed: 0, added: 0, removed: 0, moved: 0 } )
    expect( plan.sections.map( ( { id: sectionId, position } ) => [ sectionId, position ] ) )
      .toEqual( [ [ id( 2 ), 0 ], [ id( 1 ), 1 ] ] )
  } )

  it( 'counts everything at once', () => {
    const edit = unchanged()

    sectionOf( edit, 1 ).concepts[ 0 ].name = 'SQL basics'
    sectionOf( edit, 1 ).concepts.splice( 2, 1 )
    sectionOf( edit, 2 ).concepts.push( { name: 'Recursion', description: '' } )

    const [ windows ] = sectionOf( edit, 2 ).concepts.splice( 0, 1 )

    sectionOf( edit, 1 ).concepts.push( windows )

    expect( planSyllabus( current, edit ).diff )
      .toEqual( { renamed: 1, added: 1, removed: 1, moved: 1 } )
  } )
} )

describe( 'planSyllabus, sections', () => {
  it( 'plans a new section without an id, and numbers every section', () => {
    const edit = unchanged()

    edit.sections.push( { name: 'Extras', concepts: [ { name: 'Views', description: '' } ] } )

    const plan = planSyllabus( current, edit )

    expect( plan.sections.map( ( section ) => [ section.id, section.name, section.position ] ) )
      .toEqual( [ [ id( 1 ), 'Basics', 0 ], [ id( 2 ), 'Advanced', 1 ], [ null, 'Extras', 2 ] ] )
    expect( plan.diff.added ).toBe( 1 )
  } )

  it( 'lists a section missing from the edit for removal, and its concepts as removed', () => {
    const edit = unchanged()

    edit.sections.splice( 1, 1 )

    const plan = planSyllabus( current, edit )

    expect( plan.removeSectionIds ).toEqual( [ id( 2 ) ] )
    expect( plan.removeConceptIds ).toEqual( [ id( 21 ), id( 22 ) ] )
    expect( plan.diff ).toEqual( { renamed: 0, added: 0, removed: 2, moved: 0 } )
  } )

  it( 'keeps a concept that leaves a removed section for another one', () => {
    const edit = unchanged()
    const [ windows ] = sectionOf( edit, 2 ).concepts.splice( 0, 1 )

    sectionOf( edit, 1 ).concepts.push( windows )
    edit.sections.splice( 1, 1 )

    const plan = planSyllabus( current, edit )

    expect( plan.removeSectionIds ).toEqual( [ id( 2 ) ] )
    expect( plan.removeConceptIds ).toEqual( [ id( 22 ) ] )
    expect( plan.diff ).toEqual( { renamed: 0, added: 0, removed: 1, moved: 1 } )
  } )

  it( 'plans a concept moved into a new section', () => {
    const edit = unchanged()
    const [ indexes ] = sectionOf( edit, 1 ).concepts.splice( 2, 1 )

    edit.sections.push( { name: 'Performance', concepts: [ indexes ] } )

    const plan = planSyllabus( current, edit )

    expect( plan.sections[ 2 ] ).toMatchObject( { id: null, name: 'Performance' } )
    expect( plan.sections[ 2 ].concepts[ 0 ] ).toMatchObject( { id: id( 13 ), position: 0 } )
    expect( plan.diff ).toEqual( { renamed: 0, added: 0, removed: 0, moved: 1 } )
  } )
} )

describe( 'planSyllabus, refusing an edit', () => {
  it( 'refuses a section id that is not in the syllabus', () => {
    const edit = unchanged()

    edit.sections[ 0 ].id = id( 99 )

    expect( () => planSyllabus( current, edit ) )
      .toThrow( new ValidationError( 'The syllabus has no such section' ) )
  } )

  it( 'refuses a concept id that is not in the syllabus', () => {
    const edit = unchanged()

    edit.sections[ 0 ].concepts[ 0 ].id = id( 99 )

    expect( () => planSyllabus( current, edit ) )
      .toThrow( new ValidationError( 'The syllabus has no such concept' ) )
  } )

  it( 'refuses the same section or concept twice', () => {
    const twiceSection = unchanged()
    const twiceConcept = unchanged()

    twiceSection.sections[ 1 ].id = id( 1 )
    twiceConcept.sections[ 1 ].concepts[ 0 ].id = id( 11 )

    expect( () => planSyllabus( current, twiceSection ) )
      .toThrow( new ValidationError( 'A section appears twice' ) )
    expect( () => planSyllabus( current, twiceConcept ) )
      .toThrow( new ValidationError( 'A concept appears twice' ) )
  } )
} )
