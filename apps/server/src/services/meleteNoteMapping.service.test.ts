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
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../errors.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { listConcepts, replaceSyllabus } from '../repositories/meleteConcepts.repository.js'
import {
  listNoteConcepts,
  setNoteConcepts,
} from '../repositories/meleteNoteConcepts.repository.js'
import { findNote, listNotesBySubject, updateNote } from '../repositories/meleteNotes.repository.js'
import { findQuestion, setQuestionConcept } from '../repositories/meleteQuestions.repository.js'
import { listSections } from '../repositories/meleteSections.repository.js'
import { listSubjects, updateSubject } from '../repositories/meleteSubjects.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import { resetScanClock, scanLearningRoot } from './meleteScan.service.js'
import { applyOffSyllabusAction, setNoteConceptsByHand } from './meleteNoteMapping.service.js'
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
  vi.restoreAllMocks()
} )

type Setup = {
  subjectId: string
  noteId: string
  otherNoteId: string
  sections: string[]
  concepts: string[]
  rustConcept: string
}

// TypeScript (two notes, enrolled) with Basics (A, B) and Advanced (C), and Rust with one concept
const approved = async ( status: 'approved' | 'draft' = 'approved' ): Promise< Setup > => {
  await scanLearningRoot( userId, { force: true, now: T0 } )

  const subject = listSubjects( userId ).find( ( { folder } ) => folder === 'Learning/TypeScript' )
  const rust = listSubjects( userId ).find( ( { folder } ) => folder === 'Learning/Rust' )

  if( subject === undefined || rust === undefined ) {
    throw new Error( 'The vault fixture was not scanned' )
  }

  replaceSyllabus( userId, subject.id, [
    {
      name: 'Basics',
      concepts: [ { name: 'A', description: '' }, { name: 'B', description: '' } ],
    },
    { name: 'Advanced', concepts: [ { name: 'C', description: '' } ] },
  ] )
  replaceSyllabus( userId, rust.id, [
    { name: 'Rusty', concepts: [ { name: 'Ownership', description: '' } ] },
  ] )
  updateSubject( userId, subject.id, { syllabus_status: status } )
  getDatabase().prepare( 'UPDATE melete_notes SET enrolled = 1' ).run()

  const [ note, other ] = listNotesBySubject( userId, subject.id )

  return {
    subjectId: subject.id,
    noteId: note.id,
    otherNoteId: other.id,
    sections: listSections( userId, subject.id ).map( ( { id } ) => id ),
    concepts: listConcepts( userId, subject.id ).map( ( { id } ) => id ),
    rustConcept: listConcepts( userId, rust.id )[ 0 ].id,
  }
}

const conceptsOf = ( noteId: string ) => {
  return listNoteConcepts( userId, noteId ).map( ( { concept_id: id, source } ) => [ id, source ] )
}

describe( 'setNoteConceptsByHand', () => {
  it( 'maps the note by hand, pins it, clears the flag and queues a labels-only Map', async () => {
    const { noteId, concepts } = await approved()

    updateNote( userId, noteId, {
      off_syllabus: 'flagged',
      off_syllabus_suggestion: 'Decorators',
    } )
    setNoteConcepts( userId, noteId, [ concepts[ 2 ] ], 'claude' )

    const view = setNoteConceptsByHand( userId, noteId, [ concepts[ 1 ], concepts[ 0 ] ] )

    expect( conceptsOf( noteId ) ).toEqual( [
      [ concepts[ 0 ], 'hand' ],
      [ concepts[ 1 ], 'hand' ],
    ] )
    expect( findNote( userId, noteId ) ).toMatchObject( {
      mapping: 'queued',
      mapping_error: null,
      mapping_pinned: true,
      off_syllabus: null,
      off_syllabus_suggestion: null,
    } )
    expect( view.note ).toMatchObject( {
      mapping: 'queued',
      mapping_pinned: true,
      concept_ids: [ concepts[ 0 ], concepts[ 1 ] ],
    } )
  } )

  it( 'keeps the order of the syllabus, and each concept once', async () => {
    const { noteId, concepts } = await approved()

    setNoteConceptsByHand( userId, noteId, [ concepts[ 2 ], concepts[ 0 ], concepts[ 2 ] ] )

    expect( conceptsOf( noteId ) ).toEqual( [
      [ concepts[ 0 ], 'hand' ],
      [ concepts[ 2 ], 'hand' ],
    ] )
  } )

  it( 'clears the mapping and the labels for an empty list, and pins without queuing', async () => {
    const { noteId, concepts } = await approved()
    const questionId = addQuestion( userId, noteId )

    setNoteConcepts( userId, noteId, [ concepts[ 0 ] ], 'claude' )
    setQuestionConcept( userId, questionId, concepts[ 0 ] )
    setNoteConceptsByHand( userId, noteId, [] )

    expect( conceptsOf( noteId ) ).toEqual( [] )
    expect( findQuestion( userId, questionId )?.concept_id ).toBeNull()
    expect( findNote( userId, noteId ) ).toMatchObject( { mapping: 'idle', mapping_pinned: true } )
  } )

  it( 'does not queue a note that is not enrolled', async () => {
    const { noteId, concepts } = await approved()

    getDatabase().prepare( 'UPDATE melete_notes SET enrolled = 0' ).run()
    setNoteConceptsByHand( userId, noteId, [ concepts[ 0 ] ] )

    expect( findNote( userId, noteId ) )
      .toMatchObject( { mapping: 'idle', mapping_pinned: true } )
    expect( conceptsOf( noteId ) ).toEqual( [ [ concepts[ 0 ], 'hand' ] ] )
  } )

  it( 'refuses a foreign or unknown concept, changing nothing', async () => {
    const { noteId, concepts, rustConcept } = await approved()

    setNoteConcepts( userId, noteId, [ concepts[ 0 ] ], 'claude' )

    for( const bad of [ rustConcept, crypto.randomUUID() ] ) {
      expect( () => setNoteConceptsByHand( userId, noteId, [ concepts[ 1 ], bad ] ) )
        .toThrow( ValidationError )
    }

    expect( conceptsOf( noteId ) ).toEqual( [ [ concepts[ 0 ], 'claude' ] ] )
    expect( findNote( userId, noteId )?.mapping_pinned ).toBe( false )
  } )

  it( 'refuses a subject whose syllabus is not approved', async () => {
    const { noteId, concepts } = await approved( 'draft' )

    expect( () => setNoteConceptsByHand( userId, noteId, [ concepts[ 0 ] ] ) )
      .toThrow( ConflictError )
  } )

  it( 'answers not found for an unknown note and for another user\'s', async () => {
    const { noteId, concepts } = await approved()
    const other = createTestUser( { modules: [ 'melete' ] } ).id

    expect( () => setNoteConceptsByHand( userId, crypto.randomUUID(), [] ) )
      .toThrow( NotFoundError )
    expect( () => setNoteConceptsByHand( other, noteId, [ concepts[ 0 ] ] ) )
      .toThrow( NotFoundError )
  } )
} )

describe( 'applyOffSyllabusAction', () => {
  const flagged = async ( suggestion: string | null = 'Decorators' ) => {
    const setup = await approved()

    updateNote( userId, setup.noteId, {
      off_syllabus: 'flagged',
      off_syllabus_suggestion: suggestion,
    } )

    return setup
  }

  describe( 'dismiss', () => {
    it( 'marks the flag dismissed and keeps the suggestion', async () => {
      const { noteId } = await flagged()
      const view = applyOffSyllabusAction( userId, noteId, { action: 'dismiss' } )

      expect( view.note ).toMatchObject( {
        off_syllabus: 'dismissed',
        off_syllabus_suggestion: 'Decorators',
      } )
      expect( findNote( userId, noteId )?.mapping ).toBe( 'idle' )
    } )

    it( 'refuses a note that is not flagged', async () => {
      const { noteId } = await approved()

      expect( () => applyOffSyllabusAction( userId, noteId, { action: 'dismiss' } ) )
        .toThrow( ConflictError )

      updateNote( userId, noteId, { off_syllabus: 'dismissed' } )

      expect( () => applyOffSyllabusAction( userId, noteId, { action: 'dismiss' } ) )
        .toThrow( ConflictError )
    } )
  } )

  describe( 'add_concept', () => {
    it( 'adds the suggestion to the end of the section and maps the note to it', async () => {
      const { subjectId, noteId, sections } = await flagged()
      const before = listConcepts( userId, subjectId ).length
      const view = applyOffSyllabusAction(
        userId,
        noteId,
        { action: 'add_concept', section_id: sections[ 1 ] },
      )
      const added = listConcepts( userId, subjectId ).at( -1 )

      expect( listConcepts( userId, subjectId ) ).toHaveLength( before + 1 )
      expect( added ).toMatchObject( { name: 'Decorators', section_id: sections[ 1 ] } )
      expect( conceptsOf( noteId ) ).toEqual( [ [ added?.id, 'hand' ] ] )
      expect( view.note ).toMatchObject( {
        off_syllabus: null,
        off_syllabus_suggestion: null,
        mapping: 'queued',
        mapping_pinned: true,
        concept_ids: [ added?.id ],
      } )
    } )

    it( 'uses the name given instead of the suggestion', async () => {
      const { subjectId, noteId, sections } = await flagged( null )

      applyOffSyllabusAction(
        userId,
        noteId,
        { action: 'add_concept', section_id: sections[ 0 ], name: 'Mixins' },
      )

      expect( listConcepts( userId, subjectId ).map( ( { name } ) => name ) ).toContain( 'Mixins' )
    } )

    it( 'queues the other flagged notes, since a concept was added', async () => {
      const { noteId, otherNoteId, sections } = await flagged()

      updateNote( userId, otherNoteId, { off_syllabus: 'flagged' } )
      applyOffSyllabusAction( userId, noteId, { action: 'add_concept', section_id: sections[ 0 ] } )

      expect( findNote( userId, otherNoteId )?.mapping ).toBe( 'queued' )
    } )

    it( 'refuses a taken name, a missing name and a section of another subject', async () => {
      const { noteId, sections } = await flagged()
      const rustSection = listSections(
        userId,
        listSubjects( userId ).find( ( { folder } ) => folder === 'Learning/Rust' )?.id ?? '',
      )[ 0 ].id

      expect( () => applyOffSyllabusAction(
        userId,
        noteId,
        { action: 'add_concept', section_id: sections[ 0 ], name: ' a ' },
      ) ).toThrow( ConflictError )
      expect( () => applyOffSyllabusAction(
        userId,
        noteId,
        { action: 'add_concept', section_id: rustSection },
      ) ).toThrow( NotFoundError )
      expect( findNote( userId, noteId )?.off_syllabus ).toBe( 'flagged' )

      updateNote( userId, noteId, { off_syllabus_suggestion: '  ' } )

      expect( () => applyOffSyllabusAction(
        userId,
        noteId,
        { action: 'add_concept', section_id: sections[ 0 ] },
      ) ).toThrow( ValidationError )
    } )

    it( 'refuses a note that is not flagged', async () => {
      const { noteId, sections } = await approved()

      expect( () => applyOffSyllabusAction(
        userId,
        noteId,
        { action: 'add_concept', section_id: sections[ 0 ], name: 'X' },
      ) ).toThrow( ConflictError )
    } )
  } )

  it( 'answers not found for an unknown note and for another user\'s', async () => {
    const { noteId } = await flagged()
    const other = createTestUser( { modules: [ 'melete' ] } ).id

    expect( () => applyOffSyllabusAction( userId, crypto.randomUUID(), { action: 'dismiss' } ) )
      .toThrow( NotFoundError )
    expect( () => applyOffSyllabusAction( other, noteId, { action: 'dismiss' } ) )
      .toThrow( NotFoundError )
    expect( findNote( userId, noteId )?.off_syllabus ).toBe( 'flagged' )
  } )
} )
