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
import { draftSyllabus } from '../clients/claude.client.js'
// Errors
import {
  ConflictError,
  MeleteError,
  NotFoundError,
  ValidationError,
} from '../errors.js'
// Melete
import {
  DEFAULT_MELETE_SYLLABUS_GUIDANCE,
  LOCKED_INSTRUCTIONS_MELETE_SYLLABUS,
  buildMeleteSystemPrompt,
} from '../melete/prompts.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { insertConcept, listConcepts } from '../repositories/meleteConcepts.repository.js'
import { setNoteConcepts } from '../repositories/meleteNoteConcepts.repository.js'
import { findRun } from '../repositories/meleteRuns.repository.js'
import { insertSection, listSections } from '../repositories/meleteSections.repository.js'
import {
  findSubject,
  listSubjects,
  updateSubject,
} from '../repositories/meleteSubjects.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import { draftForSubject, requestSyllabusDraft } from './meleteSyllabus.service.js'
import { resetScanClock, scanLearningRoot } from './meleteScan.service.js'
import { resolveMeletePrompt } from './prompts.service.js'
// Logging
import { logger } from '../logger.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'
import { MeleteVault, createMeleteVault } from '../test-support/meleteVault.fixture.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const configMock = vi.hoisted( () => ( {
  logLevel: 'silent',
  sessionDays: 30,
  vaultsPath: '',
  timeZone: 'Asia/Singapore',
  melete: { requestRetention: 0.9, dayStartHour: 4 },
} ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( '../clients/claude.client.js' )

const draft = vi.mocked( draftSyllabus )

const T0 = new Date( '2026-11-07T10:00:00.000Z' )
const usage = { input_tokens: 2500, output_tokens: 900 }

const reply = () => ( {
  output: {
    sections: [
      {
        name: 'Basics',
        concepts: [
          { name: 'Generics', description: 'Types with parameters.' },
          { name: 'generics', description: 'A duplicate.' },
          { name: 'Constraints', description: 'Limiting a parameter.' },
        ],
      },
      { name: 'Advanced', concepts: [ { name: 'Conditional types', description: 'extends' } ] },
    ],
  },
  usage,
} )

let vault: MeleteVault

const subjectId = (): string => {
  const found = listSubjects( userId ).find( ( { folder } ) => folder === 'Learning/TypeScript' )

  if( found === undefined ) {
    throw new Error( 'No TypeScript subject' )
  }

  return found.id
}

const runs = () => getDatabase().prepare( 'SELECT * FROM melete_runs ORDER BY id' ).all()

const names = (): string[][] => {
  const concepts = listConcepts( userId, subjectId() )

  return listSections( userId, subjectId() ).map( ( { id } ) => {
    return concepts.filter( ( { section_id } ) => section_id === id ).map( ( { name } ) => name )
  } )
}

// A scanned subject with a level, as the draft endpoint leaves it
const drafting = async (): Promise< string > => {
  await scanLearningRoot( userId, { force: true, now: T0 } )

  const id = subjectId()

  updateSubject( userId, id, {
    target_level: 'working',
    intent: 'Pass the exam',
    syllabus_status: 'drafting',
  } )

  return id
}

beforeEach( async () => {
  vault = await createMeleteVault()
  configMock.vaultsPath = vault.vaultsPath
  setSetting( userId, 'melete_learning_root', 'Learning' )
  resetScanClock()
  draft.mockReset()
  draft.mockResolvedValue( reply() )
} )

afterEach( async () => {
  await vault.cleanup()
  vi.restoreAllMocks()
} )

describe( 'requestSyllabusDraft', () => {
  const scanned = async (): Promise< string > => {
    await scanLearningRoot( userId, { force: true, now: T0 } )

    return subjectId()
  }

  it( 'marks the subject drafting, clears an old error and returns it', async () => {
    const id = await scanned()

    updateSubject( userId, id, {
      target_level: 'proficient',
      syllabus_status: 'failed',
      syllabus_error: 'Old error',
    } )

    expect( requestSyllabusDraft( userId, id, T0 ) ).toMatchObject( {
      id,
      syllabus_status: 'drafting',
      syllabus_error: null,
      target_level: 'proficient',
    } )
    expect( findSubject( userId, id ) )
      .toMatchObject( { syllabus_status: 'drafting', syllabus_error: null } )
  } )

  it( 'needs a target level', async () => {
    const id = await scanned()

    expect( () => requestSyllabusDraft( userId, id, T0 ) )
      .toThrow( new ValidationError( 'Choose a target level first' ) )
    expect( findSubject( userId, id )?.syllabus_status ).toBe( 'none' )
  } )

  it( 'is refused while a draft is already running', async () => {
    const id = await drafting()

    expect( () => requestSyllabusDraft( userId, id, T0 ) )
      .toThrow( new ConflictError( 'A syllabus is already being drafted' ) )
  } )

  it( 'lets an approved syllabus be redrafted, keeping it until the call succeeds', async () => {
    const id = await scanned()
    const section = insertSection( userId, { subject_id: id, name: 'Old', position: 0 } )

    insertConcept( userId, {
      subject_id: id,
      section_id: section.id,
      name: 'Old concept',
      description: '',
      position: 0,
    } )
    updateSubject( userId, id, { target_level: 'working', syllabus_status: 'approved' } )

    requestSyllabusDraft( userId, id, T0 )

    expect( findSubject( userId, id )?.syllabus_status ).toBe( 'drafting' )
    expect( names() ).toEqual( [ [ 'Old concept' ] ] )
  } )

  it( 'answers not found for an unknown subject and for another user\'s', async () => {
    const id = await scanned()
    const other = createTestUser( { modules: [ 'melete' ] } ).id

    expect( () => requestSyllabusDraft( userId, crypto.randomUUID(), T0 ) )
      .toThrow( NotFoundError )
    expect( () => requestSyllabusDraft( other, id, T0 ) ).toThrow( NotFoundError )
  } )
} )

describe( 'draftForSubject', () => {
  it( 'stores the processed sections and concepts and moves the subject to draft', async () => {
    const id = await drafting()

    await draftForSubject( userId, id, T0 )

    expect( findSubject( userId, id ) )
      .toMatchObject( { syllabus_status: 'draft', syllabus_error: null } )
    expect( listSections( userId, id ).map( ( { name } ) => name ) )
      .toEqual( [ 'Basics', 'Advanced' ] )
    expect( names() ).toEqual( [ [ 'Generics', 'Constraints' ], [ 'Conditional types' ] ] )
  } )

  it( 'sends the subject, level, intent and the notes\' titles and openings', async () => {
    const id = await drafting()

    await draftForSubject( userId, id, T0 )

    const { version } = resolveMeletePrompt( userId, 'melete_syllabus' )

    expect( draft ).toHaveBeenCalledTimes( 1 )

    const [ sent ] = draft.mock.calls[ 0 ]

    expect( sent.model ).toBe( 'claude-sonnet-5-5' )
    expect( sent.system ).toBe( buildMeleteSystemPrompt(
      LOCKED_INSTRUCTIONS_MELETE_SYLLABUS,
      DEFAULT_MELETE_SYLLABUS_GUIDANCE,
    ) )
    expect( version.guidance ).toBe( DEFAULT_MELETE_SYLLABUS_GUIDANCE )
    expect( sent.user ).toContain( 'Subject: TypeScript\nTarget level: Working knowledge\n' )
    expect( sent.user ).toContain( 'Intent: Pass the exam' )
    expect( sent.user ).toContain( '- Generics in TypeScript: # Generics A generic type takes' )
    expect( sent.user ).toContain( 'Conditional types' )
    expect( sent.user ).not.toContain( 'title: Generics in TypeScript' )
  } )

  it( 'uses the syllabus model setting', async () => {
    const id = await drafting()

    setSetting( userId, 'melete_syllabus_model', 'claude-opus-5-5' )
    await draftForSubject( userId, id, T0 )

    expect( draft.mock.calls[ 0 ][ 0 ].model ).toBe( 'claude-opus-5-5' )
  } )

  it( 'leaves out notes missing from the vault', async () => {
    const id = await drafting()

    await vault.remove( 'Learning/TypeScript/Advanced/Conditional Types.md' )
    await scanLearningRoot( userId, { force: true, now: T0 } )
    await draftForSubject( userId, id, T0 )

    expect( draft.mock.calls[ 0 ][ 0 ].user ).not.toContain( 'Conditional' )
    expect( draft.mock.calls[ 0 ][ 0 ].user ).toContain( 'Generics in TypeScript' )
  } )

  it( 'skips a note it cannot read and still drafts', async () => {
    const id = await drafting()

    await vault.remove( 'Learning/TypeScript/Generics.md' )
    await draftForSubject( userId, id, T0 )

    expect( findSubject( userId, id )?.syllabus_status ).toBe( 'draft' )
    expect( draft.mock.calls[ 0 ][ 0 ].user ).not.toContain( 'Generics in TypeScript' )
  } )

  it( 'records a syllabus run for the subject with model, prompt version and tokens', async () => {
    const id = await drafting()

    await draftForSubject( userId, id, T0 )

    const [ row ] = runs() as { id: number }[]
    const { version } = resolveMeletePrompt( userId, 'melete_syllabus' )

    expect( runs() ).toHaveLength( 1 )
    expect( findRun( userId, row.id ) ).toMatchObject( {
      kind: 'syllabus',
      subject_id: id,
      note_id: null,
      model: 'claude-sonnet-5-5',
      prompt_version_id: version.id,
      input_tokens: 2500,
      output_tokens: 900,
      outcome: 'succeeded',
      error: null,
      created_at: T0.toISOString(),
    } )
    expect( findRun( userId, row.id )?.cost_usd ).toBeGreaterThan( 0 )
  } )

  it( 'replaces an earlier syllabus, taking its mappings and labels with it', async () => {
    const id = await drafting()
    const section = insertSection( userId, { subject_id: id, name: 'Old', position: 0 } )
    const old = insertConcept( userId, {
      subject_id: id,
      section_id: section.id,
      name: 'Old concept',
      description: '',
      position: 0,
    } )
    const noteId = (
      getDatabase().prepare( 'SELECT id FROM melete_notes LIMIT 1' ).get() as { id: string }
    ).id

    setNoteConcepts( userId, noteId, [ old.id ], 'claude' )
    await draftForSubject( userId, id, T0 )

    expect( names() ).toEqual( [ [ 'Generics', 'Constraints' ], [ 'Conditional types' ] ] )
    expect( getDatabase().prepare( 'SELECT COUNT(*) AS count FROM melete_note_concepts' ).get() )
      .toEqual( { count: 0 } )
  } )

  describe( 'when the call fails', () => {
    const keepOldSyllabus = ( id: string ): void => {
      const section = insertSection( userId, { subject_id: id, name: 'Kept', position: 0 } )

      insertConcept( userId, {
        subject_id: id,
        section_id: section.id,
        name: 'Kept concept',
        description: '',
        position: 0,
      } )
    }

    it( 'stores the failure on the subject and keeps the old syllabus', async () => {
      const id = await drafting()

      keepOldSyllabus( id )
      draft.mockRejectedValue( new MeleteError( 'Syllabus drafting was cut off', { usage } ) )

      await draftForSubject( userId, id, T0 )

      expect( findSubject( userId, id ) ).toMatchObject( {
        syllabus_status: 'failed',
        syllabus_error: 'Syllabus drafting was cut off',
      } )
      expect( names() ).toEqual( [ [ 'Kept concept' ] ] )
    } )

    it( 'records a failed run with the tokens that were billed', async () => {
      const id = await drafting()

      draft.mockRejectedValue( new MeleteError( 'Declined', { usage } ) )
      await draftForSubject( userId, id, T0 )

      const [ row ] = runs() as { id: number }[]

      expect( findRun( userId, row.id ) ).toMatchObject( {
        kind: 'syllabus',
        subject_id: id,
        outcome: 'failed',
        error: 'Declined',
        input_tokens: 2500,
        output_tokens: 900,
      } )
    } )

    it( 'records a failed run with no tokens when the call gave none', async () => {
      const id = await drafting()

      draft.mockRejectedValue( new MeleteError( 'Rate limited' ) )
      await draftForSubject( userId, id, T0 )

      const [ row ] = runs() as { id: number }[]

      expect( findRun( userId, row.id ) )
        .toMatchObject( { outcome: 'failed', input_tokens: null, cost_usd: null } )
    } )

    it( 'stores an unexpected error the same way, and does not throw', async () => {
      const id = await drafting()

      draft.mockRejectedValue( new TypeError( 'boom' ) )

      await expect( draftForSubject( userId, id, T0 ) ).resolves.toBeUndefined()
      expect( findSubject( userId, id ) )
        .toMatchObject( { syllabus_status: 'failed', syllabus_error: 'boom' } )
    } )

    it( 'fails when nothing usable comes back, keeping the old syllabus and the run', async () => {
      const id = await drafting()

      keepOldSyllabus( id )
      draft.mockResolvedValue( {
        output: { sections: [ { name: 'Empty', concepts: [ { name: ' ', description: '' } ] } ] },
        usage,
      } )

      await draftForSubject( userId, id, T0 )

      expect( findSubject( userId, id ) ).toMatchObject( {
        syllabus_status: 'failed',
        syllabus_error: 'No usable syllabus came back',
      } )
      expect( names() ).toEqual( [ [ 'Kept concept' ] ] )
      expect( runs() ).toHaveLength( 1 )
      expect( findRun( userId, ( runs()[ 0 ] as { id: number } ).id ) )
        .toMatchObject( { outcome: 'failed', input_tokens: 2500 } )
    } )

    it( 'does not log the subject, the intent or any concept name', async () => {
      const id = await drafting()
      const warn = vi.spyOn( logger, 'warn' ).mockImplementation( () => undefined )
      const info = vi.spyOn( logger, 'info' ).mockImplementation( () => undefined )

      draft.mockRejectedValueOnce( new MeleteError( 'Declined', { usage } ) )
      await draftForSubject( userId, id, T0 )
      updateSubject( userId, id, { syllabus_status: 'drafting' } )
      await draftForSubject( userId, id, T0 )

      const logged = JSON.stringify( [ ...warn.mock.calls, ...info.mock.calls ] )

      expect( logged ).not.toContain( 'TypeScript' )
      expect( logged ).not.toContain( 'Pass the exam' )
      expect( logged ).not.toContain( 'Generics' )
    } )
  } )

  it( 'does nothing for a subject that is not drafting', async () => {
    const id = await drafting()

    updateSubject( userId, id, { syllabus_status: 'approved' } )
    await draftForSubject( userId, id, T0 )

    expect( draft ).not.toHaveBeenCalled()
    expect( findSubject( userId, id )?.syllabus_status ).toBe( 'approved' )
    expect( runs() ).toEqual( [] )
  } )

  it( 'fails a drafting subject that has no target level', async () => {
    await scanLearningRoot( userId, { force: true, now: T0 } )

    const id = subjectId()

    updateSubject( userId, id, { syllabus_status: 'drafting' } )
    await draftForSubject( userId, id, T0 )

    expect( draft ).not.toHaveBeenCalled()
    expect( findSubject( userId, id ) )
      .toMatchObject( { syllabus_status: 'failed', syllabus_error: 'Choose a target level first' } )
  } )

  it( 'does nothing for a subject that is gone', async () => {
    await drafting()

    await expect( draftForSubject( userId, crypto.randomUUID(), T0 ) ).resolves.toBeUndefined()
    expect( draft ).not.toHaveBeenCalled()
  } )

  it( 'sends at most 60 notes', async () => {
    await scanLearningRoot( userId, { force: true, now: T0 } )

    for( let index = 0; index < 70; index++ ) {
      const number = String( index ).padStart( 2, '0' )

      await vault.write( `Learning/TypeScript/Extra ${ number }.md`, `# Extra ${ number }\n` )
    }

    await scanLearningRoot( userId, { force: true, now: T0 } )

    const id = subjectId()

    updateSubject( userId, id, { target_level: 'expert', syllabus_status: 'drafting' } )
    await draftForSubject( userId, id, T0 )

    const lines = draft.mock.calls[ 0 ][ 0 ].user.split( '\n' ).filter( ( line ) => {
      return line.startsWith( '- ' )
    } )

    expect( lines ).toHaveLength( 60 )
  } )
} )
