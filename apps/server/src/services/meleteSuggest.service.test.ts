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
import { suggestResources } from '../clients/claude.client.js'
// Errors
import {
  BadGatewayError,
  MeleteError,
  NotFoundError,
} from '../errors.js'
// Melete
import {
  LOCKED_INSTRUCTIONS_MELETE_SUGGEST,
  buildMeleteSystemPrompt,
} from '../melete/prompts.js'
import { buildSuggestUser } from '../melete/suggest.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { listConcepts, replaceSyllabus } from '../repositories/meleteConcepts.repository.js'
import { findRun } from '../repositories/meleteRuns.repository.js'
import { listSubjects, updateSubject } from '../repositories/meleteSubjects.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import { resetScanClock, scanLearningRoot } from './meleteScan.service.js'
import { suggestForConcept } from './meleteSuggest.service.js'
import { resolveMeletePrompt } from './prompts.service.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'
import { MeleteVault, createMeleteVault } from '../test-support/meleteVault.fixture.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const configMock = vi.hoisted( () => ( { logLevel: 'silent', sessionDays: 30, vaultsPath: '' } ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( '../clients/claude.client.js' )

const suggest = vi.mocked( suggestResources )

const T0 = new Date( '2026-11-07T10:00:00.000Z' )
const usage = { input_tokens: 400, output_tokens: 250 }

const item = ( overrides: Record< string, string > = {} ) => ( {
  title: 'The Rust Book',
  by: 'Klabnik and Nichols',
  kind: 'book' as const,
  why: 'The standard introduction.',
  query: 'rust programming language book',
  ...overrides,
} )

let vault: MeleteVault

beforeEach( async () => {
  vault = await createMeleteVault()
  configMock.vaultsPath = vault.vaultsPath
  setSetting( userId, 'melete_learning_root', 'Learning' )
  setSetting( userId, 'melete_suggest_model', 'claude-opus-5-5' )
  resetScanClock()
  suggest.mockReset()
  suggest.mockResolvedValue( { output: { suggestions: [ item() ] }, usage } )
} )

afterEach( async () => {
  await vault.cleanup()
} )

// The Rust subject, with a level and an intent, and an Ownership concept in Basics
const concept = async () => {
  await scanLearningRoot( userId, { force: true, now: T0 } )

  const subject = listSubjects( userId ).find( ( { folder } ) => folder === 'Learning/Rust' )

  if( subject === undefined ) {
    throw new Error( 'No subject' )
  }

  replaceSyllabus( userId, subject.id, [ {
    name: 'Basics',
    concepts: [ { name: 'Ownership', description: 'One owner at a time' } ],
  } ] )
  updateSubject( userId, subject.id, {
    target_level: 'working',
    intent: 'Build a CLI',
    syllabus_status: 'approved',
  } )

  return { subjectId: subject.id, conceptId: listConcepts( userId, subject.id )[ 0 ]?.id ?? '' }
}

const rows = (): Record< string, number > => {
  const db = getDatabase()
  const count = ( table: string ): number => {
    return ( db.prepare( `SELECT COUNT(*) AS n FROM ${ table }` ).get() as { n: number } ).n
  }

  return Object.fromEntries( [
    'melete_subjects',
    'melete_sections',
    'melete_concepts',
    'melete_notes',
    'melete_questions',
  ].map( ( table ) => [ table, count( table ) ] ) )
}

describe( 'suggestForConcept', () => {
  it( 'sends the subject, level, intent and concept with the suggest model', async () => {
    const { conceptId } = await concept()

    await suggestForConcept( userId, conceptId, T0 )

    const { version } = resolveMeletePrompt( userId, 'melete_suggest' )

    expect( suggest ).toHaveBeenCalledWith( {
      model: 'claude-opus-5-5',
      system: buildMeleteSystemPrompt( LOCKED_INSTRUCTIONS_MELETE_SUGGEST, version.guidance ),
      user: buildSuggestUser( {
        subject: 'Rust',
        level: 'working',
        intent: 'Build a CLI',
        section: 'Basics',
        concept: 'Ownership',
        description: 'One owner at a time',
      } ),
    } )
  } )

  it( 'answers with the suggestions, links removed', async () => {
    const { conceptId } = await concept()

    suggest.mockResolvedValue( { output: { suggestions: [
      item( { why: 'Free at https://doc.rust-lang.org/book/ online.' } ),
      item( { title: 'Docs', query: 'rust docs' } ),
    ] }, usage } )

    expect( await suggestForConcept( userId, conceptId, T0 ) ).toEqual( { suggestions: [
      item( { why: 'Free at online.' } ),
      item( { title: 'Docs', query: 'rust docs' } ),
    ] } )
  } )

  it( 'records a suggest run for the subject and stores nothing else', async () => {
    const { conceptId, subjectId } = await concept()
    const before = rows()

    await suggestForConcept( userId, conceptId, T0 )

    const [ run ] = getDatabase().prepare( 'SELECT id FROM melete_runs' ).all() as { id: number }[]
    const { version } = resolveMeletePrompt( userId, 'melete_suggest' )

    expect( findRun( userId, run?.id ?? 0 ) ).toMatchObject( {
      kind: 'suggest',
      subject_id: subjectId,
      note_id: null,
      question_id: null,
      model: 'claude-opus-5-5',
      prompt_version_id: version.id,
      input_tokens: 400,
      output_tokens: 250,
      outcome: 'succeeded',
      created_at: T0.toISOString(),
    } )
    expect( rows() ).toEqual( before )
  } )

  it( 'answers 502 and records a failed run when the call fails', async () => {
    const { conceptId } = await concept()

    suggest.mockRejectedValue( new MeleteError( 'Overloaded', { usage } ) )

    await expect( suggestForConcept( userId, conceptId, T0 ) )
      .rejects.toThrow( new BadGatewayError( 'Overloaded' ) )
    const runs = getDatabase().prepare( 'SELECT outcome, error, input_tokens FROM melete_runs' )

    expect( runs.all() )
      .toEqual( [ { outcome: 'failed', error: 'Overloaded', input_tokens: 400 } ] )
  } )

  it( 'fails when nothing usable is left after the links are removed', async () => {
    const { conceptId } = await concept()

    suggest.mockResolvedValue( { output: { suggestions: [
      item( { title: 'https://only.a/link' } ),
    ] }, usage } )

    await expect( suggestForConcept( userId, conceptId, T0 ) )
      .rejects.toThrow( new BadGatewayError( 'No usable suggestions came back' ) )
    expect( getDatabase().prepare( 'SELECT outcome, input_tokens FROM melete_runs' ).all() )
      .toEqual( [ { outcome: 'failed', input_tokens: 400 } ] )
  } )

  it( 'answers not found for an unknown concept and for another user\'s', async () => {
    const { conceptId } = await concept()
    const other = createTestUser( { modules: [ 'melete' ] } ).id

    await expect( suggestForConcept( userId, crypto.randomUUID(), T0 ) )
      .rejects.toThrow( NotFoundError )
    await expect( suggestForConcept( other, conceptId, T0 ) ).rejects.toThrow( NotFoundError )
    expect( suggest ).not.toHaveBeenCalled()
  } )
} )
