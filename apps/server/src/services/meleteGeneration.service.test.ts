// Node
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
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
import { generateApprovedQuestions, generateQuestions } from '../clients/claude.client.js'
// Errors
import { MeleteError } from '../errors.js'
// Melete
import {
  DEFAULT_MELETE_QUESTIONS_GUIDANCE,
  LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
  LOCKED_INSTRUCTIONS_MELETE_QUESTIONS_APPROVED,
  buildMeleteSystemPrompt,
} from '../melete/prompts.js'
import { bodyHash, splitFrontMatter } from '../melete/scan.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import {
  findNote,
  listNotesUnder,
  setEnrolled,
  updateNote,
} from '../repositories/meleteNotes.repository.js'
import { listForNote } from '../repositories/meleteQuestions.repository.js'
import { listConcepts, replaceSyllabus } from '../repositories/meleteConcepts.repository.js'
import { listNoteConcepts, setNoteConcepts } from '../repositories/meleteNoteConcepts.repository.js'
import { listSubjects, updateSubject } from '../repositories/meleteSubjects.repository.js'
import { findRun } from '../repositories/meleteRuns.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import { generateForNote } from './meleteGeneration.service.js'
import { resetScanClock, scanLearningRoot } from './meleteScan.service.js'
import { listProfiles, resolveMeletePrompt, saveVersion } from './prompts.service.js'
// Logging
import { logger } from '../logger.js'
// Test support
import { addQuestion } from '../test-support/meleteData.fixture.js'
import {
  GENERICS_NOTE,
  MeleteVault,
  createMeleteVault,
} from '../test-support/meleteVault.fixture.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const configMock = vi.hoisted( () => ( { logLevel: 'silent', sessionDays: 30, vaultsPath: '' } ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( '../clients/claude.client.js' )

const generate = vi.mocked( generateQuestions )
const generateApproved = vi.mocked( generateApprovedQuestions )

const T0 = new Date( '2026-10-22T10:00:00.000Z' )
const GENERICS_PATH = 'Learning/TypeScript/Generics.md'
const GENERICS_BODY = splitFrontMatter( GENERICS_NOTE ).body
const PASSAGE = 'A generic type takes other types as parameters.'

let vault: MeleteVault

const usage = { input_tokens: 2000, output_tokens: 300 }

const reply = ( passage = PASSAGE ) => ( {
  output: {
    questions: [
      { prompt: 'What is a generic type?', answer: 'A type with type parameters.', passage },
      { prompt: 'Why use generics?', answer: 'To reuse code across types.', passage: '' },
    ],
  },
  usage,
} )

const noteAt = ( path: string ) => {
  const found = listNotesUnder( userId, 'Learning' ).find( ( note ) => {
    return note.path === path && note.missing_at === null
  } )

  if( found === undefined ) {
    throw new Error( `No live note at ${ path }` )
  }

  return found
}

// A scanned, enrolled note that the loop has just claimed
const claimed = async ( path = GENERICS_PATH ): Promise< string > => {
  await scanLearningRoot( userId, { force: true, now: T0 } )

  const { id } = noteAt( path )

  setEnrolled( userId, [ id ], true, T0.toISOString() )
  updateNote( userId, id, { generation: 'generating' } )

  return id
}

const runs = () => getDatabase().prepare( 'SELECT * FROM melete_runs ORDER BY id' ).all()

const snapshot = async ( root: string ): Promise< string[] > => {
  const names = await readdir( root, { recursive: true } )
  const lines = await Promise.all( names.map( async ( name ) => {
    const { mtimeMs, size } = await stat( join( root, name ) )

    return `${ name }:${ mtimeMs }:${ size }`
  } ) )

  return lines.sort()
}

beforeEach( async () => {
  vault = await createMeleteVault()
  configMock.vaultsPath = vault.vaultsPath
  setSetting( userId, 'melete_learning_root', 'Learning' )
  setSetting( userId, 'melete_question_model', 'claude-sonnet-5-5' )
  resetScanClock()
  generate.mockReset()
  generate.mockResolvedValue( reply() )
  generateApproved.mockReset()
} )

afterEach( async () => {
  await vault.cleanup()
  vi.restoreAllMocks()
} )

describe( 'generateForNote', () => {
  it( 'stores the questions and returns the note to idle', async () => {
    const id = await claimed()

    await generateForNote( userId, id, T0 )

    const note = findNote( userId, id )
    const questions = listForNote( userId, id )

    expect( note ).toMatchObject( { generation: 'idle', generation_error: null } )
    expect( questions.map( ( { position, prompt, passage, state } ) => {
      return { position, prompt, passage, state }
    } ) ).toEqual( [
      { position: 1, prompt: 'What is a generic type?', passage: PASSAGE, state: 'active' },
      { position: 2, prompt: 'Why use generics?', passage: '', state: 'active' },
    ] )
    expect( questions.every( ( { body_hash: hash } ) => hash === bodyHash( GENERICS_BODY ) ) )
      .toBe( true )
  } )

  it( 'sends the subject, the title and the body without front-matter', async () => {
    const id = await claimed()

    await generateForNote( userId, id, T0 )

    const { version } = resolveMeletePrompt( userId, 'melete_questions' )

    expect( generate ).toHaveBeenCalledWith( {
      model: 'claude-sonnet-5-5',
      system: buildMeleteSystemPrompt(
        LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
        DEFAULT_MELETE_QUESTIONS_GUIDANCE,
      ),
      user: 'Subject: TypeScript\n\n<source_content>\nTitle: Generics in TypeScript\n\n'
        + `${ GENERICS_BODY }\n</source_content>`,
    } )
    expect( version.guidance ).toBe( DEFAULT_MELETE_QUESTIONS_GUIDANCE )
  } )

  it( 'records the run with the model, prompt version, tokens and cost', async () => {
    const id = await claimed()

    await generateForNote( userId, id, T0 )

    const [ run ] = runs() as { id: number }[]
    const { version } = resolveMeletePrompt( userId, 'melete_questions' )

    expect( runs() ).toHaveLength( 1 )
    expect( findRun( userId, run?.id ?? 0 ) ).toMatchObject( {
      kind: 'generate',
      note_id: id,
      question_id: null,
      model: 'claude-sonnet-5-5',
      prompt_version_id: version.id,
      input_tokens: 2000,
      output_tokens: 300,
      outcome: 'succeeded',
      error: null,
      created_at: T0.toISOString(),
    } )
    expect( findRun( userId, run?.id ?? 0 )?.cost_usd ).toBeGreaterThan( 0 )
    expect( listForNote( userId, id )[ 0 ]?.run_id ).toBe( run?.id )
  } )

  it( 'empties a passage that is not in the note', async () => {
    const id = await claimed()

    generate.mockResolvedValue( reply( 'A line the note does not contain.' ) )
    await generateForNote( userId, id, T0 )

    expect( listForNote( userId, id )[ 0 ]?.passage ).toBe( '' )
  } )

  it( 'follows the edited question prompt', async () => {
    const id = await claimed()

    const { profile } = resolveMeletePrompt( userId, 'melete_questions' )

    saveVersion( userId, profile.id, 'Ask about edge cases.' )
    await generateForNote( userId, id, T0 )

    expect( generate.mock.calls[ 0 ]?.[ 0 ].system )
      .toContain( '## Guidance\nAsk about edge cases.' )
  } )

  it( 'fails a note over 60000 characters without calling Claude', async () => {
    await vault.write( GENERICS_PATH, `# Big\n\n${ 'a'.repeat( 60_000 ) }\n` )

    const id = await claimed()

    await generateForNote( userId, id, T0 )

    const note = findNote( userId, id )

    expect( generate ).not.toHaveBeenCalled()
    expect( note?.generation ).toBe( 'failed' )
    expect( note?.generation_error )
      .toMatch( /^Note is too long for question generation \(\d+ char/ )
    expect( note?.generation_error ).toMatch( /, limit 60000\)\. Split it into smaller notes\.$/ )
    expect( runs() ).toMatchObject( [ {
      outcome: 'failed',
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    } ] )
    expect( listForNote( userId, id ) ).toEqual( [] )
  } )

  it( 'stores a Claude failure on the note, with the billed tokens', async () => {
    const id = await claimed()
    const other = noteAt( 'Learning/Rust/Ownership.md' ).id

    setEnrolled( userId, [ other ], true, T0.toISOString() )
    updateNote( userId, other, { generation: 'queued' } )
    generate.mockRejectedValue( new MeleteError( 'Question generation was cut off', { usage } ) )

    await generateForNote( userId, id, T0 )

    expect( findNote( userId, id ) ).toMatchObject( {
      generation: 'failed',
      generation_error: 'Question generation was cut off',
    } )
    expect( runs() ).toMatchObject( [ {
      outcome: 'failed',
      error: 'Question generation was cut off',
      input_tokens: 2000,
      output_tokens: 300,
    } ] )
    expect( listForNote( userId, id ) ).toEqual( [] )
    expect( findNote( userId, other )?.generation ).toBe( 'queued' )
  } )

  it( 'stores a failure without usage as null tokens and cost', async () => {
    const id = await claimed()

    generate.mockRejectedValue( new MeleteError( 'Question generation failed: Overloaded' ) )
    await generateForNote( userId, id, T0 )

    expect( runs() ).toMatchObject( [ {
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    } ] )
  } )

  it( 'fails the note, not the loop, on an unexpected error', async () => {
    const id = await claimed()

    generate.mockRejectedValue( new TypeError( 'boom' ) )

    await expect( generateForNote( userId, id, T0 ) ).resolves.toBeUndefined()
    expect( findNote( userId, id ) )
      .toMatchObject( { generation: 'failed', generation_error: 'boom' } )
  } )

  it( 'fails the note when no usable question comes back', async () => {
    const id = await claimed()

    generate.mockResolvedValue( {
      output: { questions: [ { prompt: ' ', answer: 'x', passage: '' } ] },
      usage,
    } )
    await generateForNote( userId, id, T0 )

    expect( findNote( userId, id ) ).toMatchObject( {
      generation: 'failed',
      generation_error: 'No usable questions came back',
    } )
    expect( runs() ).toMatchObject( [ { outcome: 'failed', input_tokens: 2000 } ] )
    expect( listForNote( userId, id ) ).toEqual( [] )
  } )

  it( 'hands a note edited since it was queued back to the scan', async () => {
    const id = await claimed()

    await generateForNote( userId, id, T0 ) // first questions
    updateNote( userId, id, { generation: 'generating' } )
    generate.mockClear()
    await vault.write( GENERICS_PATH, '# Generics\n\nA different body.\n' )

    await generateForNote( userId, id, new Date( T0.getTime() + 60_000 ) )

    expect( generate ).not.toHaveBeenCalled()
    expect( findNote( userId, id ) )
      .toMatchObject( { generation: 'queued', generation_error: null } )
    expect( listForNote( userId, id ) ).toEqual( [] )
  } )

  it( 'marks a note whose file is gone as missing and idle', async () => {
    const id = await claimed()

    await vault.remove( GENERICS_PATH )
    await generateForNote( userId, id, T0 )

    expect( generate ).not.toHaveBeenCalled()
    expect( findNote( userId, id ) ).toMatchObject( { generation: 'idle' } )
    expect( findNote( userId, id )?.missing_at ).not.toBeNull()
    expect( runs() ).toEqual( [] )
  } )

  it( 'does nothing for a note that is no longer enrolled', async () => {
    const id = await claimed()

    setEnrolled( userId, [ id ], false, T0.toISOString() )
    await generateForNote( userId, id, T0 )

    expect( generate ).not.toHaveBeenCalled()
    expect( findNote( userId, id )?.generation ).toBe( 'idle' )
  } )

  it( 'does nothing for a note that already has questions for this body', async () => {
    const id = await claimed()

    addQuestion( userId, id, { hash: noteAt( GENERICS_PATH ).body_hash } )
    await generateForNote( userId, id, T0 )

    expect( generate ).not.toHaveBeenCalled()
    expect( findNote( userId, id )?.generation ).toBe( 'idle' )
    expect( listForNote( userId, id ) ).toHaveLength( 1 )
  } )

  it( 'keeps the queue entry when the note is edited during the call', async () => {
    const id = await claimed()

    generate.mockImplementation( async () => {
      await vault.write( GENERICS_PATH, '# Generics\n\nEdited while Claude was thinking.\n' )
      await scanLearningRoot( userId, { force: true, now: new Date( T0.getTime() + 60_000 ) } )

      return reply()
    } )
    await generateForNote( userId, id, T0 )

    expect( listForNote( userId, id ) ).toEqual( [] )
    expect( findNote( userId, id )?.generation ).toBe( 'queued' )
    expect( runs() ).toMatchObject( [ { outcome: 'succeeded' } ] )
  } )

  it( 'returns an unenrolled note edited during the call to idle', async () => {
    const id = await claimed()

    generate.mockImplementation( async () => {
      setEnrolled( userId, [ id ], false, T0.toISOString() )
      await vault.write( GENERICS_PATH, '# Generics\n\nEdited and unenrolled.\n' )
      await scanLearningRoot( userId, { force: true, now: new Date( T0.getTime() + 60_000 ) } )

      return reply()
    } )
    await generateForNote( userId, id, T0 )

    expect( listForNote( userId, id ) ).toEqual( [] )
    expect( findNote( userId, id )?.generation ).toBe( 'idle' )
  } )

  it( 'leaves the note not idle when storing the questions fails', async () => {
    const id = await claimed()

    generate.mockResolvedValue( {
      output: { questions: [ { prompt: 'Q?', answer: 'A.', passage: '' } ] },
      usage,
    } )
    getDatabase().exec( `CREATE TRIGGER stop_insert BEFORE INSERT ON melete_questions
      BEGIN SELECT RAISE( ABORT, 'disk full' ); END` )

    await generateForNote( userId, id, T0 )

    expect( findNote( userId, id ) ).toMatchObject( {
      generation: 'failed',
      generation_error: 'disk full',
    } )
    expect( listForNote( userId, id ) ).toEqual( [] )
  } )

  it( 'ignores an unknown note', async () => {
    const warn = vi.spyOn( logger, 'warn' )

    await expect( generateForNote( userId, crypto.randomUUID(), T0 ) ).resolves.toBeUndefined()
    expect( generate ).not.toHaveBeenCalled()
    expect( warn ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'logs no note text', async () => {
    const id = await claimed()
    const spies = [ 'info', 'warn', 'error', 'debug' ].map( ( level ) => {
      return vi.spyOn( logger, level as 'info' )
    } )

    generate.mockRejectedValue( new MeleteError( 'Question generation was cut off', { usage } ) )
    await generateForNote( userId, id, T0 )

    const logged = JSON.stringify( spies.flatMap( ( spy ) => spy.mock.calls ) )

    expect( logged ).not.toContain( 'generic type' )
    expect( logged ).not.toContain( 'Generics' )
  } )

  it( 'writes nothing to the vault', async () => {
    const id = await claimed()
    const before = await snapshot( vault.vaultPath )

    await generateForNote( userId, id, T0 )

    expect( await snapshot( vault.vaultPath ) ).toEqual( before )
  } )
} )

describe( 'generateForNote for two users', () => {
  it( 'uses the owner\'s model and prompt and records the run for the owner', async () => {
    await vault.clone( 'other' )
    const other = createTestUser( { vault_dir: 'other' } ).id

    setSetting( other, 'melete_learning_root', 'Learning' )
    setSetting( other, 'melete_question_model', 'claude-haiku-5-5' )

    const profile = listProfiles( other, 'melete_questions' )[ 0 ]

    await scanLearningRoot( other, { force: true, now: T0 } )

    const theirs = listNotesUnder( other, 'Learning' )
      .find( ( note ) => note.path === GENERICS_PATH )

    if( theirs === undefined ) {
      throw new Error( 'The other user did not scan the note' )
    }

    saveVersion( other, profile?.id ?? '', 'Their own guidance.' )
    setEnrolled( other, [ theirs.id ], true, T0.toISOString() )
    updateNote( other, theirs.id, { generation: 'generating' } )

    const mine = await claimed()

    await generateForNote( userId, mine, T0 )
    await generateForNote( other, theirs.id, T0 )

    expect( generate.mock.calls.map( ( [ call ] ) => call.model ) )
      .toEqual( [ 'claude-sonnet-5-5', 'claude-haiku-5-5' ] )
    expect( generate.mock.calls[ 1 ]?.[ 0 ].system ).toContain( 'Their own guidance.' )
    expect( generate.mock.calls[ 0 ]?.[ 0 ].system ).not.toContain( 'Their own guidance.' )
    expect( getDatabase().prepare( 'SELECT user_id FROM melete_runs ORDER BY id' ).all() )
      .toEqual( [ { user_id: userId }, { user_id: other } ] )
    expect( listForNote( other, theirs.id ) ).toHaveLength( 2 )
    expect( listForNote( userId, mine ) ).toHaveLength( 2 )
  } )

  it( 'does not generate for a note that belongs to someone else', async () => {
    await vault.clone( 'other' )
    const other = createTestUser( { vault_dir: 'other' } ).id
    const id = await claimed()

    await generateForNote( other, id, T0 )

    expect( generate ).not.toHaveBeenCalled()
    expect( findNote( userId, id )?.generation ).toBe( 'generating' )
  } )
} )

describe( 'generateForNote with an approved syllabus', () => {
  const approvedReply = ( overrides: Record< string, unknown > = {} ) => ( {
    output: {
      concepts: [ 'c2' ],
      off_syllabus: null,
      questions: [
        {
          prompt: 'What is a generic type?',
          answer: 'A type with parameters.',
          passage: PASSAGE,
          concept: 'c2',
        },
        { prompt: 'Why use generics?', answer: 'To reuse code.', passage: '', concept: 'c9' },
      ],
      ...overrides,
    },
    usage,
  } )

  // Approves the subject of the claimed note with a two-concept syllabus
  const approve = async (): Promise< { id: string, conceptIds: string[] } > => {
    const id = await claimed()
    const subject = listSubjects( userId ).find( ( { id: subjectId } ) => {
      return subjectId === findNote( userId, id )?.subject_id
    } )

    if( subject === undefined ) {
      throw new Error( 'No subject' )
    }

    replaceSyllabus( userId, subject.id, [ {
      name: 'Basics',
      concepts: [
        { name: 'Types', description: 'Type annotations' },
        { name: 'Generics', description: 'Types with parameters' },
      ],
    } ] )
    updateSubject( userId, subject.id, { syllabus_status: 'approved' } )

    const conceptIds = listConcepts( userId, subject.id ).map( ( { id: conceptId } ) => conceptId )

    return { id, conceptIds }
  }

  beforeEach( () => {
    generateApproved.mockResolvedValue( approvedReply() )
  } )

  it( 'sends the concept list and the approved instructions, and not the plain call', async () => {
    const { id } = await approve()

    await generateForNote( userId, id, T0 )

    const { version } = resolveMeletePrompt( userId, 'melete_questions' )

    expect( generate ).not.toHaveBeenCalled()
    expect( generateApproved ).toHaveBeenCalledWith( {
      model: 'claude-sonnet-5-5',
      system: buildMeleteSystemPrompt(
        LOCKED_INSTRUCTIONS_MELETE_QUESTIONS_APPROVED,
        version.guidance,
      ),
      user: [
        'Subject: TypeScript',
        '',
        '## Concepts',
        'c1: Types — Type annotations',
        'c2: Generics — Types with parameters',
        '',
        '## Note',
        '<source_content>',
        'Title: Generics in TypeScript',
        '',
        GENERICS_BODY,
        '</source_content>',
      ].join( '\n' ),
    } )
  } )

  it( 'maps the note to its concepts as Claude\'s, and labels each question', async () => {
    const { id, conceptIds } = await approve()

    updateNote( userId, id, { mapping_pinned: true } )
    await generateForNote( userId, id, T0 )

    expect( listNoteConcepts( userId, id ) ).toEqual( [
      { note_id: id, concept_id: conceptIds[ 1 ], source: 'claude' },
    ] )
    // c9 is not one of the note's concepts: it gets the note's first
    expect( listForNote( userId, id ).map( ( { concept_id: conceptId } ) => conceptId ) )
      .toEqual( [ conceptIds[ 1 ], conceptIds[ 1 ] ] )
    expect( findNote( userId, id ) ).toMatchObject( {
      generation: 'idle',
      mapping: 'idle',
      mapping_pinned: false,
      off_syllabus: null,
      off_syllabus_suggestion: null,
    } )
  } )

  it( 'replaces an earlier mapping, hand ones too, since the content changed', async () => {
    const { id, conceptIds } = await approve()

    setNoteConcepts( userId, id, [ conceptIds[ 0 ] ?? '' ], 'hand' )
    await generateForNote( userId, id, T0 )

    expect( listNoteConcepts( userId, id ).map( ( { concept_id: conceptId, source } ) => {
      return [ conceptId, source ]
    } ) ).toEqual( [ [ conceptIds[ 1 ], 'claude' ] ] )
  } )

  it( 'flags a note that fits no concept, with the suggestion, and labels nothing', async () => {
    const { id } = await approve()

    generateApproved.mockResolvedValue( approvedReply( {
      concepts: [],
      off_syllabus: { suggested_concept: 'Decorators' },
    } ) )
    await generateForNote( userId, id, T0 )

    expect( findNote( userId, id ) ).toMatchObject( {
      off_syllabus: 'flagged',
      off_syllabus_suggestion: 'Decorators',
    } )
    expect( listNoteConcepts( userId, id ) ).toEqual( [] )
    expect( listForNote( userId, id ) ).toHaveLength( 2 )
    expect( listForNote( userId, id ).every( ( { concept_id: conceptId } ) => conceptId === null ) )
      .toBe( true )
  } )

  it( 'uses the plain call and writes no mapping while the syllabus is not approved', async () => {
    const id = await claimed()

    await generateForNote( userId, id, T0 )

    expect( generateApproved ).not.toHaveBeenCalled()
    expect( generate ).toHaveBeenCalledTimes( 1 )
    expect( listNoteConcepts( userId, id ) ).toEqual( [] )
    expect( listForNote( userId, id ).every( ( { concept_id: conceptId } ) => conceptId === null ) )
      .toBe( true )
  } )

  it( 'records the run and fails the note when the approved call fails', async () => {
    const { id } = await approve()

    generateApproved.mockRejectedValue( new MeleteError( 'Overloaded', { usage } ) )
    await generateForNote( userId, id, T0 )

    expect( findNote( userId, id ) )
      .toMatchObject( { generation: 'failed', generation_error: 'Overloaded' } )
    expect( runs() ).toMatchObject( [ { kind: 'generate', outcome: 'failed' } ] )
  } )
} )
