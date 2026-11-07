// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Repositories
import { insertConcept } from './meleteConcepts.repository.js'
import { insertSection } from './meleteSections.repository.js'
import { listNoteConcepts, setNoteConcepts } from './meleteNoteConcepts.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'
import { addNote, addSubject } from '../test-support/meleteData.fixture.js'

let userId = ''
let subjectId = ''
let noteId = ''
let first = ''
let second = ''

const conceptIn = ( sectionId: string, name: string, position: number ): string => {
  return insertConcept( userId, {
    subject_id: subjectId,
    section_id: sectionId,
    name,
    description: '',
    position,
  } ).id
}

beforeEach( () => {
  userId = defaultTestAdmin().id
  subjectId = addSubject( userId )
  noteId = addNote( userId, subjectId )

  const section = insertSection( userId, { subject_id: subjectId, name: 'Basics', position: 0 } )

  first = conceptIn( section.id, 'First', 0 )
  second = conceptIn( section.id, 'Second', 1 )
} )

describe( 'setNoteConcepts and listNoteConcepts', () => {
  it( 'maps a note to concepts with the source', () => {
    setNoteConcepts( userId, noteId, [ first, second ], 'claude' )

    expect( listNoteConcepts( userId, noteId ) ).toEqual( [
      { note_id: noteId, concept_id: first, source: 'claude' },
      { note_id: noteId, concept_id: second, source: 'claude' },
    ] )
  } )

  it( 'replaces the earlier mapping, not adds to it', () => {
    setNoteConcepts( userId, noteId, [ first, second ], 'claude' )
    setNoteConcepts( userId, noteId, [ second ], 'hand' )

    expect( listNoteConcepts( userId, noteId ) )
      .toEqual( [ { note_id: noteId, concept_id: second, source: 'hand' } ] )
  } )

  it( 'clears the mapping when given no concepts, and ignores a repeated id', () => {
    setNoteConcepts( userId, noteId, [ first, first ], 'claude' )

    expect( listNoteConcepts( userId, noteId ) ).toHaveLength( 1 )

    setNoteConcepts( userId, noteId, [], 'claude' )

    expect( listNoteConcepts( userId, noteId ) ).toEqual( [] )
  } )

  it( 'keeps the old mapping when a concept does not exist', () => {
    setNoteConcepts( userId, noteId, [ first ], 'claude' )

    expect( () => setNoteConcepts( userId, noteId, [ second, 'missing' ], 'hand' ) ).toThrow()
    expect( listNoteConcepts( userId, noteId ).map( ( { concept_id } ) => concept_id ) )
      .toEqual( [ first ] )
  } )
} )

describe( 'ownership', () => {
  it( 'never reads or replaces another user\'s mappings', () => {
    const other = createTestUser( { role: 'member', modules: [ 'melete' ] } ).id

    setNoteConcepts( userId, noteId, [ first ], 'claude' )
    setNoteConcepts( other, noteId, [], 'hand' )

    expect( listNoteConcepts( other, noteId ) ).toEqual( [] )
    expect( listNoteConcepts( userId, noteId ) ).toHaveLength( 1 )
  } )
} )
