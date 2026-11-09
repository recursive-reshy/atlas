// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Errors
import { ConflictError, NotFoundError } from '../errors.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { listConcepts, replaceSyllabus } from '../repositories/meleteConcepts.repository.js'
import { setNoteConcepts } from '../repositories/meleteNoteConcepts.repository.js'
import { listNotesBySubject } from '../repositories/meleteNotes.repository.js'
import { listSections } from '../repositories/meleteSections.repository.js'
import { listSubjects, updateSubject } from '../repositories/meleteSubjects.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import { getGaps } from './meleteGaps.service.js'
import { resetScanClock, scanLearningRoot } from './meleteScan.service.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'
import { addQuestion } from '../test-support/meleteData.fixture.js'
import { MeleteVault, createMeleteVault } from '../test-support/meleteVault.fixture.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const configMock = vi.hoisted( () => ( { logLevel: 'silent', sessionDays: 30, vaultsPath: '' } ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )

const T0 = new Date( '2026-11-07T10:00:00.000Z' )

let vault: MeleteVault

beforeEach( async () => {
  vault = await createMeleteVault()
  configMock.vaultsPath = vault.vaultsPath
  setSetting( userId, 'melete_learning_root', 'Learning' )
  resetScanClock()
} )

afterEach( async () => {
  await vault.cleanup()
} )

// Basics (A, B) and Advanced (C, D); the notes are enrolled
const approved = async ( status: 'approved' | 'draft' = 'approved' ) => {
  await scanLearningRoot( userId, { force: true, now: T0 } )

  const subject = listSubjects( userId ).find( ( { folder } ) => folder === 'Learning/TypeScript' )

  if( subject === undefined ) {
    throw new Error( 'No subject' )
  }

  replaceSyllabus( userId, subject.id, [
    {
      name: 'Basics',
      concepts: [ { name: 'A', description: '' }, { name: 'B', description: '' } ],
    },
    {
      name: 'Advanced',
      concepts: [ { name: 'C', description: 'See' }, { name: 'D', description: '' } ],
    },
  ] )
  updateSubject( userId, subject.id, { syllabus_status: status } )
  getDatabase().prepare( 'UPDATE melete_notes SET enrolled = 1' ).run()

  const [ note ] = listNotesBySubject( userId, subject.id )
  const [ a, b, c, d ] = listConcepts( userId, subject.id ).map( ( { id } ) => id )

  return {
    subjectId: subject.id,
    noteId: note?.id ?? '',
    sections: listSections( userId, subject.id ).map( ( { id } ) => id ),
    a: a ?? '',
    b: b ?? '',
    c: c ?? '',
    d: d ?? '',
  }
}

describe( 'getGaps', () => {
  it( 'lists the sections and concepts in syllabus order with their numbers', async () => {
    const { subjectId, noteId, sections, a, b } = await approved()

    setNoteConcepts( userId, noteId, [ a, b ], 'claude' )
    addQuestion( userId, noteId, { conceptId: a, reps: 3, stability: 21 } )
    addQuestion( userId, noteId, { position: 2, conceptId: a, reps: 0 } )
    addQuestion( userId, noteId, { position: 3, conceptId: b, reps: 2, stability: 21 * 0.8 } )

    const gaps = getGaps( userId, subjectId )

    expect( gaps.sections.map( ( { id, name } ) => [ id, name ] ) )
      .toEqual( [ [ sections[ 0 ], 'Basics' ], [ sections[ 1 ], 'Advanced' ] ] )
    expect( gaps.sections[ 0 ]?.concepts ).toEqual( [
      {
        id: a,
        name: 'A',
        description: '',
        bucket: 'weak',
        mastery: 0.5,
        note_count: 1,
        question_count: 2,
      },
      {
        id: b,
        name: 'B',
        description: '',
        bucket: 'solid',
        mastery: 0.8,
        note_count: 1,
        question_count: 1,
      },
    ] )
    expect( gaps.sections[ 1 ]?.concepts.map( ( { bucket } ) => bucket ) )
      .toEqual( [ 'uncovered', 'uncovered' ] )
  } )

  it( 'rolls up each section and the subject', async () => {
    const { subjectId, noteId, a, b } = await approved()

    setNoteConcepts( userId, noteId, [ a, b ], 'claude' )
    addQuestion( userId, noteId, { conceptId: a, reps: 3, stability: 21 } )

    const gaps = getGaps( userId, subjectId )

    expect( gaps.sections.map( ( { coverage, mastery } ) => [ coverage, mastery ] ) )
      .toEqual( [ [ 1, 0.5 ], [ 0, 0 ] ] )
    expect( gaps.coverage ).toBe( 0.5 )
    expect( gaps.mastery ).toBeCloseTo( 0.25 )
  } )

  it( 'says to cover the first uncovered concept, then to review the weakest', async () => {
    const { subjectId, noteId, a, b, c, d } = await approved()

    setNoteConcepts( userId, noteId, [ a, b ], 'claude' )

    expect( getGaps( userId, subjectId ).next_step ).toEqual( { kind: 'cover', concept_id: c } )

    const second = listNotesBySubject( userId, subjectId )[ 1 ]?.id ?? ''

    setNoteConcepts( userId, second, [ c, d ], 'claude' )
    addQuestion( userId, noteId, { conceptId: a, reps: 3, stability: 21 } )
    addQuestion( userId, noteId, { position: 2, conceptId: b, reps: 1, stability: 4 } )
    addQuestion( userId, second, { conceptId: c, reps: 1, stability: 8 } )
    addQuestion( userId, second, { position: 2, conceptId: d, reps: 1, stability: 20 } )

    expect( getGaps( userId, subjectId ).next_step ).toEqual( { kind: 'review', concept_id: b } )
  } )

  it( 'has nothing to suggest when every concept is solid', async () => {
    const { subjectId, noteId, a, b, c, d } = await approved()

    setNoteConcepts( userId, noteId, [ a, b, c, d ], 'claude' )

    for( const [ index, conceptId ] of [ a, b, c, d ].entries() ) {
      addQuestion( userId, noteId, { position: index + 1, conceptId, reps: 4, stability: 30 } )
    }

    expect( getGaps( userId, subjectId ).next_step ).toEqual( { kind: 'none' } )
  } )

  it( 'refuses a subject whose syllabus is not approved', async () => {
    const { subjectId } = await approved( 'draft' )

    expect( () => getGaps( userId, subjectId ) ).toThrow( ConflictError )
  } )

  it( 'answers not found for an unknown subject and for another user\'s', async () => {
    const { subjectId } = await approved()
    const other = createTestUser( { modules: [ 'melete' ] } ).id

    expect( () => getGaps( userId, crypto.randomUUID() ) ).toThrow( NotFoundError )
    expect( () => getGaps( other, subjectId ) ).toThrow( NotFoundError )
  } )
} )
