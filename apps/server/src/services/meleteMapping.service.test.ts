// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Clients
import { mapNote } from '../clients/claude.client.js'
// Errors
import { MeleteError } from '../errors.js'
// Melete
import { buildMapUser } from '../melete/map.js'
import { LOCKED_INSTRUCTIONS_MELETE_MAP, buildMeleteSystemPrompt } from '../melete/prompts.js'
import { bodyHash, splitFrontMatter } from '../melete/scan.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { listConcepts, replaceSyllabus } from '../repositories/meleteConcepts.repository.js'
import {
  listNoteConcepts,
  setNoteConcepts,
} from '../repositories/meleteNoteConcepts.repository.js'
import {
  findNote,
  listNotesUnder,
  setEnrolled,
  updateNote,
} from '../repositories/meleteNotes.repository.js'
import {
  insertQuestions,
  listForNote,
  saveCard,
} from '../repositories/meleteQuestions.repository.js'
import { findRun } from '../repositories/meleteRuns.repository.js'
import { listSubjects, updateSubject } from '../repositories/meleteSubjects.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import { mapForNote } from './meleteMapping.service.js'
import { resetScanClock, scanLearningRoot } from './meleteScan.service.js'
import { resolveMeletePrompt } from './prompts.service.js'
// Test support
import { defaultTestAdmin, createTestUser } from '../test-support/auth.js'
import {
  GENERICS_NOTE,
  MeleteVault,
  createMeleteVault,
} from '../test-support/meleteVault.fixture.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const configMock = vi.hoisted( () => ( { logLevel: 'silent', sessionDays: 30, vaultsPath: '' } ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( '../clients/claude.client.js' )

const map = vi.mocked( mapNote )

const T0 = new Date( '2026-10-22T10:00:00.000Z' )
const GENERICS_PATH = 'Learning/TypeScript/Generics.md'
const GENERICS_BODY = splitFrontMatter( GENERICS_NOTE ).body
const usage = { input_tokens: 900, output_tokens: 80 }

let vault: MeleteVault

const reply = ( overrides: Record< string, unknown > = {} ) => ( {
  output: {
    concepts: [ 'c2' ],
    off_syllabus: null,
    labels: [ { question: 1, concept: 'c2' }, { question: 2, concept: 'c2' } ],
    ...overrides,
  },
  usage,
} )

type Setup = { id: string, subjectId: string, conceptIds: string[], questionIds: string[] }

// A scanned, enrolled note with two questions in an approved subject, claimed for mapping
const claimed = async ( { approved = true } = {} ): Promise< Setup > => {
  await scanLearningRoot( userId, { force: true, now: T0 } )

  const note = listNotesUnder( userId, 'Learning' ).find( ( { path } ) => path === GENERICS_PATH )

  if( note === undefined ) {
    throw new Error( 'No note' )
  }

  const subject = listSubjects( userId ).find( ( { id } ) => id === note.subject_id )

  if( subject === undefined ) {
    throw new Error( 'No subject' )
  }

  replaceSyllabus( userId, subject.id, [ {
    name: 'Basics',
    concepts: [
      { name: 'Types', description: 'Type annotations' },
      { name: 'Generics', description: 'Types with parameters' },
      { name: 'Unions', description: '' },
    ],
  } ] )

  if( approved ) {
    updateSubject( userId, subject.id, { syllabus_status: 'approved' } )
  }

  setEnrolled( userId, [ note.id ], true, T0.toISOString() )
  updateNote( userId, note.id, { mapping: 'mapping' } )

  const questions = insertQuestions( userId, note.id, 1, note.body_hash, [
    { prompt: 'What is a generic type?', answer: 'A type with parameters.', passage: '' },
    { prompt: 'Why use generics?', answer: 'To reuse code.', passage: '' },
  ] )

  return {
    id: note.id,
    subjectId: subject.id,
    conceptIds: listConcepts( userId, subject.id ).map( ( { id } ) => id ),
    questionIds: questions.map( ( { id } ) => id ),
  }
}

const runs = () => getDatabase().prepare( 'SELECT * FROM melete_runs ORDER BY id' ).all()

const labels = ( noteId: string ) => {
  return listForNote( userId, noteId ).map( ( { concept_id: conceptId } ) => conceptId )
}

beforeEach( async () => {
  vault = await createMeleteVault()
  configMock.vaultsPath = vault.vaultsPath
  setSetting( userId, 'melete_learning_root', 'Learning' )
  setSetting( userId, 'melete_map_model', 'claude-haiku-5-5' )
  resetScanClock()
  map.mockReset()
  map.mockResolvedValue( reply() )
} )

afterEach( async () => {
  await vault.cleanup()
  vi.restoreAllMocks()
} )

describe( 'mapForNote', () => {
  it( 'sends the concepts, the note and its questions with the map model and prompt', async () => {
    const { id, conceptIds } = await claimed()

    await mapForNote( userId, id, T0 )

    const { version } = resolveMeletePrompt( userId, 'melete_map' )
    const questions = listForNote( userId, id )

    expect( map ).toHaveBeenCalledWith( {
      model: 'claude-haiku-5-5',
      system: buildMeleteSystemPrompt( LOCKED_INSTRUCTIONS_MELETE_MAP, version.guidance ),
      user: buildMapUser( {
        concepts: listConcepts( userId, findNote( userId, id )?.subject_id ?? '' ),
        body: GENERICS_BODY,
        questions,
      } ),
    } )
    expect( conceptIds ).toHaveLength( 3 )
  } )

  it( 'rewrites the mapping and the labels, and returns the note to idle', async () => {
    const { id, conceptIds } = await claimed()

    setNoteConcepts( userId, id, [ conceptIds[ 0 ] ?? '' ], 'claude' )
    await mapForNote( userId, id, T0 )

    expect( listNoteConcepts( userId, id ) ).toEqual( [
      { note_id: id, concept_id: conceptIds[ 1 ], source: 'claude' },
    ] )
    expect( labels( id ) ).toEqual( [ conceptIds[ 1 ], conceptIds[ 1 ] ] )
    expect( findNote( userId, id ) ).toMatchObject( {
      mapping: 'idle',
      mapping_error: null,
      off_syllabus: null,
      off_syllabus_suggestion: null,
    } )
  } )

  it( 'never touches a question\'s card, state, wording or count', async () => {
    const { id, questionIds } = await claimed()
    const [ first ] = questionIds

    saveCard( userId, first ?? '', {
      due: '2026-11-01T00:00:00.000Z',
      stability: 12.5,
      difficulty: 4.2,
      scheduled_days: 10,
      learning_steps: 0,
      reps: 5,
      lapses: 1,
      fsrs_state: 'review',
      last_review: '2026-10-20T00:00:00.000Z',
    } )

    const rows = () => ( getDatabase()
      .prepare( 'SELECT * FROM melete_questions ORDER BY id' )
      .all() as Record< string, unknown >[] )
      .map( ( row ) => ( { ...row, concept_id: null } ) )
    const before = rows()

    await mapForNote( userId, id, T0 )

    expect( rows() ).toEqual( before )
    expect( before ).toHaveLength( 2 )
  } )

  it( 'records a map run for the note and its subject', async () => {
    const { id, subjectId } = await claimed()

    await mapForNote( userId, id, T0 )

    const [ run ] = runs() as { id: number }[]
    const { version } = resolveMeletePrompt( userId, 'melete_map' )

    expect( runs() ).toHaveLength( 1 )
    expect( findRun( userId, run?.id ?? 0 ) ).toMatchObject( {
      kind: 'map',
      note_id: id,
      subject_id: subjectId,
      question_id: null,
      model: 'claude-haiku-5-5',
      prompt_version_id: version.id,
      input_tokens: 900,
      output_tokens: 80,
      outcome: 'succeeded',
      created_at: T0.toISOString(),
    } )
  } )

  it( 'flags a note that fits no concept, with the suggestion, and unlabels it', async () => {
    const { id, conceptIds } = await claimed()

    setNoteConcepts( userId, id, [ conceptIds[ 0 ] ?? '' ], 'claude' )
    map.mockResolvedValue( reply( {
      concepts: [],
      off_syllabus: { suggested_concept: 'Decorators' },
    } ) )
    await mapForNote( userId, id, T0 )

    expect( listNoteConcepts( userId, id ) ).toEqual( [] )
    expect( labels( id ) ).toEqual( [ null, null ] )
    expect( findNote( userId, id ) ).toMatchObject( {
      off_syllabus: 'flagged',
      off_syllabus_suggestion: 'Decorators',
    } )
  } )

  it( 'keeps the old mapping and fails the note when the call fails', async () => {
    const { id, conceptIds } = await claimed()

    setNoteConcepts( userId, id, [ conceptIds[ 0 ] ?? '' ], 'claude' )
    map.mockRejectedValue( new MeleteError( 'Overloaded', { usage } ) )
    await mapForNote( userId, id, T0 )

    expect( findNote( userId, id ) )
      .toMatchObject( { mapping: 'failed', mapping_error: 'Overloaded' } )
    expect( listNoteConcepts( userId, id ).map( ( { concept_id } ) => concept_id ) )
      .toEqual( [ conceptIds[ 0 ] ] )
    expect( runs() ).toMatchObject( [ { kind: 'map', outcome: 'failed', input_tokens: 900 } ] )
  } )

  it( 'fails the note when Claude\'s answer cannot be stored', async () => {
    const { id } = await claimed()

    map.mockRejectedValue( new Error( 'database is locked' ) )
    await mapForNote( userId, id, T0 )

    expect( findNote( userId, id ) )
      .toMatchObject( { mapping: 'failed', mapping_error: 'database is locked' } )
  } )

  describe( 'a hand-mapped note', () => {
    it( 'keeps its concepts and only labels the questions', async () => {
      const { id, conceptIds } = await claimed()

      setNoteConcepts( userId, id, [ conceptIds[ 2 ] ?? '', conceptIds[ 0 ] ?? '' ], 'hand' )
      updateNote( userId, id, { mapping_pinned: true, off_syllabus: 'dismissed' } )
      map.mockResolvedValue( reply( {
        concepts: [ 'c2' ],
        off_syllabus: { suggested_concept: 'Decorators' },
        labels: [ { question: 1, concept: 'c1' }, { question: 2, concept: 'c3' } ],
      } ) )
      await mapForNote( userId, id, T0 )

      expect( map.mock.calls[ 0 ]?.[ 0 ].user ).toContain( '## Fixed concepts' )
      expect( listNoteConcepts( userId, id ).map( ( { concept_id: conceptId, source } ) => {
        return [ conceptId, source ]
      } ) ).toEqual( [ [ conceptIds[ 0 ], 'hand' ], [ conceptIds[ 2 ], 'hand' ] ] )
      expect( labels( id ) ).toEqual( [ conceptIds[ 0 ], conceptIds[ 2 ] ] )
      expect( findNote( userId, id ) ).toMatchObject( {
        mapping: 'idle',
        mapping_pinned: true,
        off_syllabus: 'dismissed',
      } )
    } )

    it( 'is mapped in full when a redraft left it no concepts, which ends the pin', async () => {
      const { id, conceptIds } = await claimed()

      updateNote( userId, id, { mapping_pinned: true } )
      await mapForNote( userId, id, T0 )

      expect( map.mock.calls[ 0 ]?.[ 0 ].user ).not.toContain( '## Fixed concepts' )
      expect( listNoteConcepts( userId, id ) ).toEqual( [
        { note_id: id, concept_id: conceptIds[ 1 ], source: 'claude' },
      ] )
      expect( findNote( userId, id )?.mapping_pinned ).toBe( false )
    } )
  } )

  describe( 'a note with nothing to map', () => {
    it( 'goes idle without a call when it is no longer enrolled', async () => {
      const { id } = await claimed()

      setEnrolled( userId, [ id ], false, T0.toISOString() )
      await mapForNote( userId, id, T0 )

      expect( map ).not.toHaveBeenCalled()
      expect( findNote( userId, id )?.mapping ).toBe( 'idle' )
    } )

    it( 'goes idle without a call when the syllabus is not approved', async () => {
      const { id } = await claimed( { approved: false } )

      await mapForNote( userId, id, T0 )

      expect( map ).not.toHaveBeenCalled()
      expect( findNote( userId, id )?.mapping ).toBe( 'idle' )
      expect( runs() ).toEqual( [] )
    } )

    it( 'goes idle without a call when the note is missing from the vault', async () => {
      const { id } = await claimed()

      updateNote( userId, id, { missing_at: T0.toISOString() } )
      await mapForNote( userId, id, T0 )

      expect( map ).not.toHaveBeenCalled()
      expect( findNote( userId, id )?.mapping ).toBe( 'idle' )
    } )

    it( 'does nothing for a note that does not exist', async () => {
      await mapForNote( userId, crypto.randomUUID(), T0 )

      expect( map ).not.toHaveBeenCalled()
    } )

    it( 'does not map a note that belongs to someone else', async () => {
      await vault.clone( 'other' )
      const other = createTestUser( { vault_dir: 'other' } ).id
      const { id } = await claimed()

      await mapForNote( other, id, T0 )

      expect( map ).not.toHaveBeenCalled()
      expect( findNote( userId, id )?.mapping ).toBe( 'mapping' )
    } )
  } )

  describe( 'a note that changed', () => {
    it( 'is handed to the scan, which queues its questions again, and is not mapped', async () => {
      const { id } = await claimed()

      await vault.write( GENERICS_PATH, '# Generics\n\nNew words.\n' )
      await mapForNote( userId, id, T0 )

      expect( map ).not.toHaveBeenCalled()
      expect( findNote( userId, id )?.mapping ).toBe( 'idle' )
      expect( bodyHash( GENERICS_BODY ) ).not.toBe( findNote( userId, id )?.body_hash )
    } )

    it( 'is left alone when it is edited during the call', async () => {
      const { id, conceptIds } = await claimed()

      setNoteConcepts( userId, id, [ conceptIds[ 0 ] ?? '' ], 'claude' )
      map.mockImplementation( () => {
        updateNote( userId, id, { body_hash: 'edited' } )

        return Promise.resolve( reply() )
      } )
      await mapForNote( userId, id, T0 )

      expect( listNoteConcepts( userId, id ).map( ( { concept_id } ) => concept_id ) )
        .toEqual( [ conceptIds[ 0 ] ] )
      expect( findNote( userId, id )?.mapping ).toBe( 'idle' )
    } )
  } )
} )
