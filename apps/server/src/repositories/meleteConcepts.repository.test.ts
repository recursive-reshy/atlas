// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
// Repositories
import {
  deleteConcept,
  findConcept,
  insertConcept,
  listConceptUsage,
  listConcepts,
  replaceSyllabus,
  updateConcept,
} from './meleteConcepts.repository.js'
import { insertSection, listSections } from './meleteSections.repository.js'
import { listNoteConcepts, setNoteConcepts } from './meleteNoteConcepts.repository.js'
import { findQuestion, setQuestionConcept } from './meleteQuestions.repository.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'
import { addNote, addQuestion, addSubject } from '../test-support/meleteData.fixture.js'

let userId = ''
let subjectId = ''
let sectionId = ''

const concept = ( name: string, position: number ): Parameters< typeof insertConcept >[ 1 ] => {
  return {
    subject_id: subjectId,
    section_id: sectionId,
    name,
    description: `About ${ name }`,
    position,
  }
}

beforeEach( () => {
  userId = defaultTestAdmin().id
  subjectId = addSubject( userId )
  sectionId = insertSection( userId, { subject_id: subjectId, name: 'Basics', position: 0 } ).id
} )

describe( 'insertConcept, findConcept and listConcepts', () => {
  it( 'stores a concept and finds it again', () => {
    const stored = insertConcept( userId, concept( 'Types', 0 ) )

    expect( stored ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      subject_id: subjectId,
      section_id: sectionId,
      position: 0,
      name: 'Types',
      description: 'About Types',
      created_at: expect.stringMatching( /^\d{4}-\d{2}-\d{2}T/ ) as string,
    } )
    expect( findConcept( userId, stored.id ) ).toEqual( stored )
    expect( findConcept( userId, 'missing' ) ).toBeUndefined()
  } )

  it( 'lists by section position, then concept position', () => {
    const later = insertSection( userId, { subject_id: subjectId, name: 'Later', position: 1 } )

    insertConcept( userId, { ...concept( 'Later 0', 0 ), section_id: later.id } )
    insertConcept( userId, concept( 'Basics 1', 1 ) )
    insertConcept( userId, concept( 'Basics 0', 0 ) )

    expect( listConcepts( userId, subjectId ).map( ( { name } ) => name ) )
      .toEqual( [ 'Basics 0', 'Basics 1', 'Later 0' ] )
  } )
} )

describe( 'updateConcept', () => {
  it( 'changes name, description, position and section', () => {
    const { id } = insertConcept( userId, concept( 'Old', 0 ) )
    const other = insertSection( userId, { subject_id: subjectId, name: 'Other', position: 1 } )

    expect( updateConcept( userId, id, { name: 'New', description: 'Fresh' } ) )
      .toMatchObject( { name: 'New', description: 'Fresh', position: 0, section_id: sectionId } )
    expect( updateConcept( userId, id, { position: 3, section_id: other.id } ) )
      .toMatchObject( { name: 'New', position: 3, section_id: other.id } )
    expect( updateConcept( userId, 'missing', { name: 'x' } ) ).toBeUndefined()
  } )
} )

describe( 'deleteConcept', () => {
  it( 'drops its mappings and clears its questions\' labels', () => {
    const { id } = insertConcept( userId, concept( 'Gone', 0 ) )
    const noteId = addNote( userId, subjectId )
    const questionId = addQuestion( userId, noteId )

    setNoteConcepts( userId, noteId, [ id ], 'claude' )
    setQuestionConcept( userId, questionId, id )
    deleteConcept( userId, id )

    expect( findConcept( userId, id ) ).toBeUndefined()
    expect( listNoteConcepts( userId, noteId ) ).toEqual( [] )
    expect( findQuestion( userId, questionId )?.concept_id ).toBeNull()
  } )
} )

describe( 'replaceSyllabus', () => {
  const draft = [
    { name: 'One', concepts: [ { name: 'A', description: 'a' }, { name: 'B', description: 'b' } ] },
    { name: 'Two', concepts: [ { name: 'C', description: 'c' } ] },
  ]

  it( 'replaces every section and concept, numbering them in order', () => {
    insertConcept( userId, concept( 'Old', 0 ) )
    replaceSyllabus( userId, subjectId, draft )

    expect( listSections( userId, subjectId ).map( ( { name, position } ) => [ name, position ] ) )
      .toEqual( [ [ 'One', 0 ], [ 'Two', 1 ] ] )
    expect( listConcepts( userId, subjectId ).map( ( { name, position } ) => [ name, position ] ) )
      .toEqual( [ [ 'A', 0 ], [ 'B', 1 ], [ 'C', 0 ] ] )
  } )

  it( 'removes the old mappings and labels with the old concepts', () => {
    const old = insertConcept( userId, concept( 'Old', 0 ) )
    const noteId = addNote( userId, subjectId )
    const questionId = addQuestion( userId, noteId )

    setNoteConcepts( userId, noteId, [ old.id ], 'hand' )
    setQuestionConcept( userId, questionId, old.id )
    replaceSyllabus( userId, subjectId, draft )

    expect( listNoteConcepts( userId, noteId ) ).toEqual( [] )
    expect( findQuestion( userId, questionId )?.concept_id ).toBeNull()
  } )

  it( 'leaves the old syllabus when a row fails to store', () => {
    insertConcept( userId, concept( 'Kept', 0 ) )

    expect( () => replaceSyllabus( userId, subjectId, [
      { name: 'Bad', concepts: [ { name: null as unknown as string, description: '' } ] },
    ] ) ).toThrow()
    expect( listConcepts( userId, subjectId ).map( ( { name } ) => name ) ).toEqual( [ 'Kept' ] )
    expect( listSections( userId, subjectId ).map( ( { name } ) => name ) ).toEqual( [ 'Basics' ] )
  } )

  it( 'does not touch another subject', () => {
    const other = addSubject( userId, 'Learning/Other' )

    insertSection( userId, { subject_id: other, name: 'Theirs', position: 0 } )
    replaceSyllabus( userId, subjectId, draft )

    expect( listSections( userId, other ).map( ( { name } ) => name ) ).toEqual( [ 'Theirs' ] )
  } )
} )

describe( 'ownership', () => {
  it( 'never reads, changes or deletes another user\'s concepts', () => {
    const other = createTestUser( { role: 'member', modules: [ 'melete' ] } ).id
    const { id } = insertConcept( userId, concept( 'Mine', 0 ) )

    expect( listConcepts( other, subjectId ) ).toEqual( [] )
    expect( findConcept( other, id ) ).toBeUndefined()
    expect( updateConcept( other, id, { name: 'Taken' } ) ).toBeUndefined()
    deleteConcept( other, id )
    replaceSyllabus( other, subjectId, [
      { name: 'X', concepts: [ { name: 'Y', description: '' } ] },
    ] )

    expect( listConcepts( userId, subjectId ).map( ( { name } ) => name ) ).toEqual( [ 'Mine' ] )
  } )
} )

describe( 'listConceptUsage', () => {
  const addConcept = ( name: string, position: number ): string => {
    return insertConcept( userId, concept( name, position ) ).id
  }

  it( 'lists the concepts in syllabus order with their live notes and active questions', () => {
    const first = addConcept( 'First', 0 )
    const second = addConcept( 'Second', 1 )
    const noteId = addNote( userId, subjectId )
    const otherNote = addNote( userId, subjectId )

    setNoteConcepts( userId, noteId, [ first, second ], 'claude' )
    setNoteConcepts( userId, otherNote, [ first ], 'hand' )
    addQuestion( userId, noteId, { conceptId: first, reps: 3, stability: 12.5 } )
    addQuestion( userId, noteId, { conceptId: first, position: 2 } )

    expect( listConceptUsage( userId, subjectId ) ).toEqual( [
      {
        id: first,
        section_id: sectionId,
        note_count: 2,
        questions: [ { reps: 3, stability: 12.5 }, { reps: 0, stability: 0 } ],
      },
      { id: second, section_id: sectionId, note_count: 1, questions: [] },
    ] )
  } )

  it( 'leaves out notes that are not enrolled or are missing, and their questions', () => {
    const id = addConcept( 'Only', 0 )
    const unenrolled = addNote( userId, subjectId, { enrolled: false } )
    const missing = addNote( userId, subjectId, { missingAt: '2026-10-02T00:00:00.000Z' } )

    for( const noteId of [ unenrolled, missing ] ) {
      setNoteConcepts( userId, noteId, [ id ], 'claude' )
      addQuestion( userId, noteId, { conceptId: id, reps: 2, stability: 9 } )
    }

    expect( listConceptUsage( userId, subjectId ) )
      .toEqual( [ { id, section_id: sectionId, note_count: 0, questions: [] } ] )
  } )

  it( 'counts only active questions, and only those labelled with the concept', () => {
    const id = addConcept( 'Only', 0 )
    const other = addConcept( 'Other', 1 )
    const noteId = addNote( userId, subjectId )

    setNoteConcepts( userId, noteId, [ id ], 'claude' )
    addQuestion( userId, noteId, { conceptId: id, state: 'dropped', reps: 1, stability: 3 } )
    addQuestion( userId, noteId, { conceptId: id, state: 'retired', position: 2, reps: 1 } )
    addQuestion( userId, noteId, { conceptId: other, position: 3, reps: 4, stability: 8 } )
    addQuestion( userId, noteId, { conceptId: null, position: 4 } )

    expect( listConceptUsage( userId, subjectId ).map( ( { questions } ) => questions ) )
      .toEqual( [ [], [ { reps: 4, stability: 8 } ] ] )
  } )

  it( 'does not see another user\'s concepts or another subject\'s', () => {
    addConcept( 'Mine', 0 )

    const other = createTestUser( { modules: [ 'melete' ] } ).id

    expect( listConceptUsage( other, subjectId ) ).toEqual( [] )
    expect( listConceptUsage( userId, addSubject( userId, 'Learning/Other' ) ) ).toEqual( [] )
  } )
} )
