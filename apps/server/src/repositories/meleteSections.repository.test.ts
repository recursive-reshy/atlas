// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Repositories
import {
  deleteSection,
  insertSection,
  listSections,
  updateSection,
} from './meleteSections.repository.js'
import { insertConcept, listConcepts } from './meleteConcepts.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'
import { addSubject } from '../test-support/meleteData.fixture.js'

let userId = ''
let subjectId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
  subjectId = addSubject( userId )
} )

describe( 'insertSection and listSections', () => {
  it( 'stores a section and lists a subject\'s sections in position order', () => {
    insertSection( userId, { subject_id: subjectId, name: 'Second', position: 1 } )

    const first = insertSection( userId, { subject_id: subjectId, name: 'First', position: 0 } )

    expect( first ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      subject_id: subjectId,
      position: 0,
      name: 'First',
      created_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )
    expect( listSections( userId, subjectId ).map( ( { name } ) => name ) )
      .toEqual( [ 'First', 'Second' ] )
  } )

  it( 'lists only the asked subject\'s sections', () => {
    insertSection( userId, { subject_id: subjectId, name: 'Mine', position: 0 } )

    expect( listSections( userId, addSubject( userId, 'Learning/Other' ) ) ).toEqual( [] )
  } )
} )

describe( 'updateSection', () => {
  it( 'renames and moves a section, leaving the rest as it was', () => {
    const { id } = insertSection( userId, { subject_id: subjectId, name: 'Old', position: 0 } )

    expect( updateSection( userId, id, { name: 'New' } ) )
      .toMatchObject( { name: 'New', position: 0 } )
    expect( updateSection( userId, id, { position: 4 } ) )
      .toMatchObject( { name: 'New', position: 4 } )
    expect( updateSection( userId, id, {} ) ).toMatchObject( { name: 'New', position: 4 } )
  } )

  it( 'finds no such section', () => {
    expect( updateSection( userId, 'missing', { name: 'x' } ) ).toBeUndefined()
  } )
} )

describe( 'deleteSection', () => {
  it( 'deletes the section and its concepts', () => {
    const section = insertSection( userId, { subject_id: subjectId, name: 'Gone', position: 0 } )

    insertConcept( userId, {
      subject_id: subjectId,
      section_id: section.id,
      name: 'Concept',
      description: '',
      position: 0,
    } )
    deleteSection( userId, section.id )

    expect( listSections( userId, subjectId ) ).toEqual( [] )
    expect( listConcepts( userId, subjectId ) ).toEqual( [] )
  } )
} )

describe( 'ownership', () => {
  it( 'never reads, changes or deletes another user\'s sections', () => {
    const other = createTestUser( { role: 'member', modules: [ 'melete' ] } ).id
    const { id } = insertSection( userId, { subject_id: subjectId, name: 'Mine', position: 0 } )

    expect( listSections( other, subjectId ) ).toEqual( [] )
    expect( updateSection( other, id, { name: 'Taken' } ) ).toBeUndefined()
    deleteSection( other, id )

    expect( listSections( userId, subjectId ) ).toHaveLength( 1 )
    expect( listSections( userId, subjectId )[ 0 ].name ).toBe( 'Mine' )
  } )
} )
