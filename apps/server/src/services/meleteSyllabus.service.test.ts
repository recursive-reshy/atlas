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
import {
  insertConcept,
  listConcepts,
  replaceSyllabus,
} from '../repositories/meleteConcepts.repository.js'
import { listNoteConcepts, setNoteConcepts } from '../repositories/meleteNoteConcepts.repository.js'
import { findNote, listNotesBySubject, updateNote } from '../repositories/meleteNotes.repository.js'
import { findQuestion, setQuestionConcept } from '../repositories/meleteQuestions.repository.js'
import { findRun } from '../repositories/meleteRuns.repository.js'
import { insertSection, listSections } from '../repositories/meleteSections.repository.js'
import {
  findSubject,
  listSubjects,
  updateSubject,
} from '../repositories/meleteSubjects.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import {
  approveSyllabus,
  draftForSubject,
  getSyllabus,
  remapSyllabus,
  requestSyllabusDraft,
  saveSyllabus,
} from './meleteSyllabus.service.js'
import { resetScanClock, scanLearningRoot } from './meleteScan.service.js'
import { resolveMeletePrompt } from './prompts.service.js'
// Logging
import { logger } from '../logger.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'
import { addQuestion, addSubject } from '../test-support/meleteData.fixture.js'
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

// Two sections: Basics (SQL, Joins, Indexes) and Advanced (Windows, CTEs)
const stored = async (
  status: 'draft' | 'approved' | 'none' | 'drafting' | 'failed' = 'draft',
): Promise< string > => {
  await scanLearningRoot( userId, { force: true, now: T0 } )

  const id = subjectId()

  replaceSyllabus( userId, id, [
    {
      name: 'Basics',
      concepts: [
        { name: 'SQL', description: 'Queries' },
        { name: 'Joins', description: 'Combining tables' },
        { name: 'Indexes', description: 'Speed' },
      ],
    },
    {
      name: 'Advanced',
      concepts: [
        { name: 'Windows', description: 'Frames' },
        { name: 'CTEs', description: 'WITH' },
      ],
    },
  ] )
  updateSubject( userId, id, { target_level: 'working', syllabus_status: status } )

  return id
}

describe( 'getSyllabus', () => {
  it( 'returns the sections and their concepts in order, with ids', async () => {
    const id = await stored()
    const { sections } = getSyllabus( userId, id )

    expect( sections.map( ( { name, concepts } ) => [ name, concepts.map( ( c ) => c.name ) ] ) )
      .toEqual( [
        [ 'Basics', [ 'SQL', 'Joins', 'Indexes' ] ],
        [ 'Advanced', [ 'Windows', 'CTEs' ] ],
      ] )
    expect( sections[ 0 ].concepts[ 1 ] ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      name: 'Joins',
      description: 'Combining tables',
    } )
  } )

  it( 'returns no sections for a subject with no syllabus', async () => {
    await scanLearningRoot( userId, { force: true, now: T0 } )

    expect( getSyllabus( userId, subjectId() ) ).toEqual( { sections: [] } )
  } )

  it( 'answers not found for an unknown subject and for another user\'s', async () => {
    const id = await stored()
    const other = createTestUser( { modules: [ 'melete' ] } ).id

    expect( () => getSyllabus( userId, crypto.randomUUID() ) ).toThrow( NotFoundError )
    expect( () => getSyllabus( other, id ) ).toThrow( NotFoundError )
  } )
} )

describe( 'saveSyllabus', () => {
  const edit = ( id: string ) => {
    const { sections } = getSyllabus( userId, id )

    return { sections: structuredClone( sections ) }
  }

  it( 'applies a rename, an addition, a removal and a move, and returns the counts', async () => {
    const id = await stored()
    const next = edit( id )
    const [ basics, advanced ] = next.sections
    const [ windows ] = advanced.concepts.splice( 0, 1 )

    basics.concepts[ 0 ].name = 'SQL basics'
    basics.concepts.splice( 2, 1 )
    basics.concepts.push( windows )
    advanced.concepts.push( { name: 'Recursion', description: 'Self-reference' } as never )

    const saved = saveSyllabus( userId, id, next )

    expect( saved.diff ).toEqual( { renamed: 1, added: 1, removed: 1, moved: 1 } )
    expect( saved.syllabus.sections.map( ( { concepts } ) => concepts.map( ( c ) => c.name ) ) )
      .toEqual( [ [ 'SQL basics', 'Joins', 'Windows' ], [ 'CTEs', 'Recursion' ] ] )
    expect( names() ).toEqual( [ [ 'SQL basics', 'Joins', 'Windows' ], [ 'CTEs', 'Recursion' ] ] )
    expect( getSyllabus( userId, id ) ).toEqual( saved.syllabus )
  } )

  it( 'keeps the ids of concepts that were renamed or moved, and gives new ones ids', async () => {
    const id = await stored()
    const before = getSyllabus( userId, id ).sections.flatMap( ( { concepts } ) => concepts )
    const next = edit( id )

    next.sections[ 0 ].concepts[ 0 ].name = 'Renamed'
    next.sections[ 1 ].concepts.reverse()
    next.sections[ 1 ].concepts.push( { name: 'New', description: '' } as never )

    const after = saveSyllabus( userId, id, next ).syllabus.sections
      .flatMap( ( { concepts } ) => concepts )

    expect( after.filter( ( { name } ) => name !== 'New' ).map( ( c ) => c.id ).sort() )
      .toEqual( before.map( ( c ) => c.id ).sort() )
    expect( after.find( ( { name } ) => name === 'New' )?.id ).toMatch( /^[0-9a-f-]{36}$/ )
  } )

  it( 'keeps the mappings and labels of a renamed or moved concept', async () => {
    const id = await stored()
    const next = edit( id )
    const sql = next.sections[ 0 ].concepts[ 0 ]
    const noteId = listNotesBySubject( userId, id )[ 0 ].id
    const questionId = addQuestion( userId, noteId )

    setNoteConcepts( userId, noteId, [ sql.id ], 'claude' )
    setQuestionConcept( userId, questionId, sql.id )
    sql.name = 'SQL basics'
    next.sections[ 1 ].concepts.push( ...next.sections[ 0 ].concepts.splice( 0, 1 ) )
    saveSyllabus( userId, id, next )

    expect( listNoteConcepts( userId, noteId ).map( ( c ) => c.concept_id ) ).toEqual( [ sql.id ] )
    expect( findQuestion( userId, questionId )?.concept_id ).toBe( sql.id )
  } )

  it( 'removes the mappings and labels of a removed concept', async () => {
    const id = await stored()
    const next = edit( id )
    const [ sql ] = next.sections[ 0 ].concepts.splice( 0, 1 )
    const noteId = listNotesBySubject( userId, id )[ 0 ].id
    const questionId = addQuestion( userId, noteId )

    setNoteConcepts( userId, noteId, [ sql.id ], 'hand' )
    setQuestionConcept( userId, questionId, sql.id )
    saveSyllabus( userId, id, next )

    expect( listNoteConcepts( userId, noteId ) ).toEqual( [] )
    expect( findQuestion( userId, questionId )?.concept_id ).toBeNull()
  } )

  it( 'adds a section, moves a concept into it and drops an emptied section', async () => {
    const id = await stored()
    const next = edit( id )
    const [ indexes ] = next.sections[ 0 ].concepts.splice( 2, 1 )

    next.sections.splice( 1, 1 )
    next.sections.push( { name: 'Performance', concepts: [ indexes ] } as never )

    const saved = saveSyllabus( userId, id, next )

    expect( saved.syllabus.sections.map( ( { name } ) => name ) )
      .toEqual( [ 'Basics', 'Performance' ] )
    expect( names() ).toEqual( [ [ 'SQL', 'Joins' ], [ 'Indexes' ] ] )
    expect( saved.diff ).toEqual( { renamed: 0, added: 0, removed: 2, moved: 1 } )
  } )

  it.each( [ 'draft', 'approved' ] as const )( 'saves while the status is %s', async ( status ) => {
    const id = await stored( status )
    const next = edit( id )

    next.sections[ 0 ].name = 'Fundamentals'

    expect( saveSyllabus( userId, id, next ).syllabus.sections[ 0 ].name ).toBe( 'Fundamentals' )
    expect( findSubject( userId, id )?.syllabus_status ).toBe( status )
  } )

  it.each( [ 'none', 'drafting', 'failed' ] as const )( 'refuses while %s', async ( status ) => {
    const id = await stored( status )

    expect( () => saveSyllabus( userId, id, edit( id ) ) ).toThrow( ConflictError )
  } )

  it( 'refuses an unknown id and changes nothing, not even the valid parts', async () => {
    const id = await stored()
    const next = edit( id )

    next.sections[ 0 ].name = 'Renamed'
    next.sections[ 1 ].concepts[ 0 ].id = crypto.randomUUID()

    expect( () => saveSyllabus( userId, id, next ) ).toThrow( ValidationError )
    expect( names() ).toEqual( [ [ 'SQL', 'Joins', 'Indexes' ], [ 'Windows', 'CTEs' ] ] )
    expect( listSections( userId, id )[ 0 ].name ).toBe( 'Basics' )
  } )

  it( 'refuses ids from another subject or another user', async () => {
    const id = await stored()
    const next = edit( id )
    const foreign = addSubject( userId, 'Learning/Foreign' )

    replaceSyllabus( userId, foreign, [
      { name: 'X', concepts: [ { name: 'Y', description: '' } ] },
    ] )
    next.sections[ 0 ].concepts[ 0 ].id = listConcepts( userId, foreign )[ 0 ].id

    expect( () => saveSyllabus( userId, id, next ) ).toThrow( ValidationError )

    const other = createTestUser( { modules: [ 'melete' ] } ).id

    expect( () => saveSyllabus( other, id, edit( id ) ) ).toThrow( NotFoundError )
  } )

  it( 'accepts an empty syllabus while still a draft', async () => {
    const id = await stored()

    expect( saveSyllabus( userId, id, { sections: [] } ).diff )
      .toEqual( { renamed: 0, added: 0, removed: 5, moved: 0 } )
    expect( getSyllabus( userId, id ) ).toEqual( { sections: [] } )
  } )
} )

describe( 'approveSyllabus', () => {
  it( 'approves a draft and queues every enrolled note in the vault for mapping', async () => {
    const id = await stored()
    const [ first, second ] = listNotesBySubject( userId, id )

    getDatabase().prepare( 'UPDATE melete_notes SET enrolled = 1' ).run()
    updateNote( userId, first.id, {
      mapping: 'failed',
      mapping_error: 'Bad',
      mapping_pinned: true,
    } )

    const subject = approveSyllabus( userId, id, T0 )

    expect( subject ).toMatchObject( { id, syllabus_status: 'approved' } )
    expect( findSubject( userId, id )?.syllabus_status ).toBe( 'approved' )

    for( const note of [ first, second ] ) {
      expect( findNote( userId, note.id ) )
        .toMatchObject( { mapping: 'queued', mapping_error: null } )
    }

    expect( findNote( userId, first.id )?.mapping_pinned ).toBe( true )
  } )

  it( 'leaves notes that are not enrolled alone', async () => {
    const id = await stored()

    approveSyllabus( userId, id, T0 )

    expect( listNotesBySubject( userId, id ).map( ( { mapping } ) => mapping ) )
      .toEqual( listNotesBySubject( userId, id ).map( () => 'idle' ) )
  } )

  it.each( [ 'none', 'drafting', 'failed', 'approved' ] as const )(
    'refuses while %s',
    async ( status ) => {
      const id = await stored( status )

      expect( () => approveSyllabus( userId, id, T0 ) ).toThrow( ConflictError )
      expect( findSubject( userId, id )?.syllabus_status ).toBe( status )
    },
  )

  it( 'refuses a draft with no concepts', async () => {
    const id = await stored()

    saveSyllabus( userId, id, { sections: [] } )

    expect( () => approveSyllabus( userId, id, T0 ) )
      .toThrow( new ConflictError( 'The syllabus has no concepts' ) )
    expect( findSubject( userId, id )?.syllabus_status ).toBe( 'draft' )
  } )

  it( 'answers not found for an unknown subject and for another user\'s', async () => {
    const id = await stored()
    const other = createTestUser( { modules: [ 'melete' ] } ).id

    expect( () => approveSyllabus( userId, crypto.randomUUID(), T0 ) ).toThrow( NotFoundError )
    expect( () => approveSyllabus( other, id, T0 ) ).toThrow( NotFoundError )
  } )
} )

describe( 'remaps after a save and Remap all', () => {
  // Two enrolled notes on the SQL and Joins concepts, as an approved subject has them
  const approved = async () => {
    const id = await stored( 'approved' )

    getDatabase().prepare( 'UPDATE melete_notes SET enrolled = 1' ).run()

    const [ first, second ] = listNotesBySubject( userId, id )
    const [ sql, joins ] = getSyllabus( userId, id ).sections[ 0 ].concepts

    return { id, first, second, sql, joins }
  }

  const edit = ( id: string ) => {
    return { sections: structuredClone( getSyllabus( userId, id ).sections ) }
  }
  const mappingOf = ( noteId: string ) => findNote( userId, noteId )?.mapping

  it( 'queues the unpinned flagged notes when a concept is added', async () => {
    const { id, first, second } = await approved()
    const next = edit( id )

    updateNote( userId, first.id, { off_syllabus: 'flagged' } )
    next.sections[ 1 ].concepts.push( { name: 'Triggers', description: '' } as never )
    saveSyllabus( userId, id, next )

    expect( [ mappingOf( first.id ), mappingOf( second.id ) ] ).toEqual( [ 'queued', 'idle' ] )
  } )

  it( 'leaves a pinned flagged note, and all notes while the syllabus is a draft', async () => {
    const { id, first } = await approved()

    updateNote( userId, first.id, { off_syllabus: 'flagged', mapping_pinned: true } )

    const next = edit( id )

    next.sections[ 1 ].concepts.push( { name: 'Triggers', description: '' } as never )
    saveSyllabus( userId, id, next )
    expect( mappingOf( first.id ) ).toBe( 'idle' )

    updateNote( userId, first.id, { mapping_pinned: false } )
    updateSubject( userId, id, { syllabus_status: 'draft' } )

    const again = edit( id )

    again.sections[ 1 ].concepts.push( { name: 'Views', description: '' } as never )
    saveSyllabus( userId, id, again )
    expect( mappingOf( first.id ) ).toBe( 'idle' )
  } )

  it( 'queues a note left with no concept when its concept is removed', async () => {
    const { id, first, second, sql, joins } = await approved()
    const next = edit( id )

    setNoteConcepts( userId, first.id, [ sql.id ], 'claude' )
    setNoteConcepts( userId, second.id, [ sql.id, joins.id ], 'claude' )
    next.sections[ 0 ].concepts.splice( 0, 1 )
    saveSyllabus( userId, id, next )

    expect( [ mappingOf( first.id ), mappingOf( second.id ) ] ).toEqual( [ 'queued', 'idle' ] )
    expect( listNoteConcepts( userId, second.id ).map( ( c ) => c.concept_id ) )
      .toEqual( [ joins.id ] )
  } )

  it( 'does not queue a pinned note, or one that never had the concept', async () => {
    const { id, first, second, sql } = await approved()
    const next = edit( id )

    setNoteConcepts( userId, first.id, [ sql.id ], 'hand' )
    updateNote( userId, first.id, { mapping_pinned: true } )
    next.sections[ 0 ].concepts.splice( 0, 1 )
    saveSyllabus( userId, id, next )

    expect( [ mappingOf( first.id ), mappingOf( second.id ) ] ).toEqual( [ 'idle', 'idle' ] )
  } )

  it( 'queues nothing for a rename, a new description, a move or a reorder', async () => {
    const { id, first, second, sql } = await approved()
    const next = edit( id )

    setNoteConcepts( userId, first.id, [ sql.id ], 'claude' )
    updateNote( userId, second.id, { off_syllabus: 'flagged' } )
    next.sections[ 0 ].concepts[ 0 ].name = 'Renamed'
    next.sections[ 0 ].concepts[ 1 ].description = 'New words'
    next.sections[ 1 ].concepts.reverse()
    next.sections[ 1 ].concepts.push( ...next.sections[ 0 ].concepts.splice( 2, 1 ) )

    expect( saveSyllabus( userId, id, next ).diff.moved ).toBeGreaterThan( 0 )
    expect( [ mappingOf( first.id ), mappingOf( second.id ) ] ).toEqual( [ 'idle', 'idle' ] )
  } )

  describe( 'remapSyllabus', () => {
    it( 'queues every enrolled, unpinned note and says how many', async () => {
      const { id, first, second } = await approved()

      updateNote( userId, second.id, { mapping_pinned: true } )

      expect( remapSyllabus( userId, id ) ).toEqual( { queued: 1 } )
      expect( [ mappingOf( first.id ), mappingOf( second.id ) ] ).toEqual( [ 'queued', 'idle' ] )
    } )

    it.each( [ 'none', 'draft', 'drafting', 'failed' ] as const )(
      'refuses while %s',
      async ( status ) => {
        const id = await stored( status )

        expect( () => remapSyllabus( userId, id ) ).toThrow( ConflictError )
      },
    )

    it( 'answers not found for an unknown subject and for another user\'s', async () => {
      const { id } = await approved()
      const other = createTestUser( { modules: [ 'melete' ] } ).id

      expect( () => remapSyllabus( userId, crypto.randomUUID() ) ).toThrow( NotFoundError )
      expect( () => remapSyllabus( other, id ) ).toThrow( NotFoundError )
    } )
  } )
} )
