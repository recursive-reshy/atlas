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
import { gradeAnswer } from '../clients/claude.client.js'
// Shared
import {
  GetMeleteNoteResponse,
  GetMeleteSubjectResponse,
  GetMeleteTodayResponse,
  GetNextReviewResponse,
  GradeAnswerResponse,
  MeleteQuestion,
  RecordReviewResponse,
} from '@atlas/shared'
// App
import { app } from '../app.js'
// Test support
import { createTestUser, signedInRequest as request } from '../test-support/auth.js'
import { config } from '../config.js'
// Errors
import { MeleteError } from '../errors.js'
// Melete
import { resetScanClock } from '../melete/scanClock.js'
import { rememberSkipped, resetScanOutcome } from '../melete/scanOutcome.js'
// Repositories
import { listNotesUnder, updateNote } from '../repositories/meleteNotes.repository.js'
import { findQuestion } from '../repositories/meleteQuestions.repository.js'
import { listSubjects } from '../repositories/meleteSubjects.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Test support
import { addQuestion } from '../test-support/meleteData.fixture.js'
import { MeleteVault, createMeleteVault } from '../test-support/meleteVault.fixture.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../clients/claude.client.js' )

const grade = vi.mocked( gradeAnswer )

let vault: MeleteVault
let originalVaultsPath: string

const scanned = async (): Promise< void > => {
  await request( app ).get( '/api/melete/today' )
}

const subject = ( name: string ) => {
  const found = listSubjects( userId ).find( ( { folder } ) => folder === `Learning/${ name }` )

  if( found === undefined ) {
    throw new Error( `No subject ${ name }` )
  }

  return found
}

const note = ( path: string ) => {
  const found = listNotesUnder( userId, 'Learning' ).find( ( candidate ) => {
    return candidate.path === `Learning/${ path }`
  } )

  if( found === undefined ) {
    throw new Error( `No note ${ path }` )
  }

  return found
}

const GENERICS = 'TypeScript/Generics.md'

beforeEach( async () => {
  vault = await createMeleteVault()
  originalVaultsPath = config.vaultsPath
  config.vaultsPath = vault.vaultsPath
  setSetting( userId, 'melete_learning_root', 'Learning' )
  setSetting( userId, 'melete_grading_model', 'claude-haiku-5-5' )
  grade.mockReset()
  resetScanClock()
  resetScanOutcome()
} )

afterEach( async () => {
  config.vaultsPath = originalVaultsPath
  await vault.cleanup()
} )

describe( 'GET /api/melete/today', () => {
  it( 'scans the learning root and lists its subjects', async () => {
    const response = await request( app ).get( '/api/melete/today' )
    const today = GetMeleteTodayResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( today.learning_root ).toBe( 'Learning' )
    expect( today.subjects.map( ( { name, note_count } ) => [ name, note_count ] ) )
      .toEqual( [ [ 'Rust', 1 ], [ 'TypeScript', 2 ] ] )
  } )

  it( 'is 409 for a user who has not chosen a vault', async () => {
    const member = createTestUser( { modules: [ 'melete' ] } )

    setSetting( member.id, 'melete_learning_root', 'Learning' )
    const response = await request( app, member ).get( '/api/melete/today' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Choose your vault first' } )
  } )

  it( 'lists the paths the last scan could not read', async () => {
    await scanned()
    rememberSkipped( userId, [ 'Learning/Locked' ] )

    const response = await request( app ).get( '/api/melete/today' )

    expect( GetMeleteTodayResponse.parse( response.body ).skipped_paths )
      .toEqual( [ 'Learning/Locked' ] )
  } )

  it( 'answers 200 with a null learning root when none is set', async () => {
    setSetting( userId, 'melete_learning_root', null )

    const response = await request( app ).get( '/api/melete/today' )

    expect( response.status ).toBe( 200 )
    expect( GetMeleteTodayResponse.parse( response.body ) ).toEqual( {
      learning_root: null,
      subjects: [],
      totals: { due: 0, new_remaining: 0, learning_soon: 0 },
      skipped_paths: [],
    } )
  } )
} )

describe( 'GET /api/melete/subjects/:id', () => {
  it( 'returns the subject and its notes', async () => {
    await scanned()

    const response = await request( app ).get( `/api/melete/subjects/${ subject( 'Rust' ).id }` )
    const body = GetMeleteSubjectResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( body.subject.name ).toBe( 'Rust' )
    expect( body.notes.map( ( { title } ) => title ) ).toEqual( [ 'Ownership' ] )
  } )

  it( 'returns 400 for an id that is not a uuid', async () => {
    expect( ( await request( app ).get( '/api/melete/subjects/nope' ) ).status ).toBe( 400 )
  } )

  it( 'returns 404 for an unknown subject', async () => {
    const response = await request( app ).get( `/api/melete/subjects/${ crypto.randomUUID() }` )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Subject not found' } )
  } )

  it( 'returns 409 when there is no learning root', async () => {
    await scanned()
    const { id } = subject( 'Rust' )
    setSetting( userId, 'melete_learning_root', null )

    const response = await request( app ).get( `/api/melete/subjects/${ id }` )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Choose a learning root first' } )
  } )
} )

describe( 'PATCH /api/melete/subjects/:id', () => {
  it( 'changes auto-enrol and new questions per day', async () => {
    await scanned()
    const { id } = subject( 'Rust' )

    const response = await request( app )
      .patch( `/api/melete/subjects/${ id }` )
      .send( { auto_enroll: true, new_per_day: 4 } )

    expect( response.status ).toBe( 200 )
    expect( response.body ).toMatchObject( {
      subject: { id, auto_enroll: true, new_per_day: 4 },
    } )
  } )

  it.each( [ {}, { new_per_day: 101 }, { new_per_day: -1 }, { auto_enroll: 'yes' } ] )(
    'returns 400 for the body %j',
    async ( body ) => {
      await scanned()

      const response = await request( app )
        .patch( `/api/melete/subjects/${ subject( 'Rust' ).id }` )
        .send( body )

      expect( response.status ).toBe( 400 )
    },
  )

  it( 'returns 404 for an unknown subject', async () => {
    const response = await request( app )
      .patch( `/api/melete/subjects/${ crypto.randomUUID() }` )
      .send( { auto_enroll: true } )

    expect( response.status ).toBe( 404 )
  } )
} )

describe( 'POST /api/melete/subjects/:id/enrollment', () => {
  it( 'enrols every note of the subject and queues generation', async () => {
    await scanned()

    const response = await request( app )
      .post( `/api/melete/subjects/${ subject( 'TypeScript' ).id }/enrollment` )
      .send( { enrolled: true } )
    const body = GetMeleteSubjectResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( body.notes.map( ( { enrolled, generation } ) => [ enrolled, generation ] ) )
      .toEqual( [ [ true, 'queued' ], [ true, 'queued' ] ] )
    expect( body.subject.enrolled_count ).toBe( 2 )
  } )

  it( 'unenrols them again', async () => {
    await scanned()
    const url = `/api/melete/subjects/${ subject( 'TypeScript' ).id }/enrollment`
    await request( app ).post( url ).send( { enrolled: true } )

    const response = await request( app ).post( url ).send( { enrolled: false } )

    expect( GetMeleteSubjectResponse.parse( response.body ).subject.enrolled_count ).toBe( 0 )
  } )

  it( 'returns 400 without a boolean and 404 for an unknown subject', async () => {
    await scanned()

    expect( ( await request( app )
      .post( `/api/melete/subjects/${ subject( 'Rust' ).id }/enrollment` )
      .send( {} ) ).status ).toBe( 400 )
    expect( ( await request( app )
      .post( `/api/melete/subjects/${ crypto.randomUUID() }/enrollment` )
      .send( { enrolled: true } ) ).status ).toBe( 404 )
  } )
} )

describe( 'the note routes', () => {
  it( 'GET returns the note and its questions', async () => {
    await scanned()
    const { id } = note( GENERICS )
    addQuestion( userId, id )

    const response = await request( app ).get( `/api/melete/notes/${ id }` )
    const body = GetMeleteNoteResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( body.note ).toMatchObject( { id, title: 'Generics in TypeScript', question_count: 1 } )
    expect( body.questions ).toHaveLength( 1 )
    expect( body.obsidian_url )
      .toBe( 'obsidian://open?vault=vault&file=Learning%2FTypeScript%2FGenerics' )
  } )

  it( 'PATCH enrols and unenrols a note', async () => {
    await scanned()
    const url = `/api/melete/notes/${ note( GENERICS ).id }`

    const enrolled = await request( app ).patch( url ).send( { enrolled: true } )
    const unenrolled = await request( app ).patch( url ).send( { enrolled: false } )

    expect( enrolled.status ).toBe( 200 )
    expect( GetMeleteNoteResponse.parse( enrolled.body ).note )
      .toMatchObject( { enrolled: true, generation: 'queued' } )
    expect( GetMeleteNoteResponse.parse( unenrolled.body ).note )
      .toMatchObject( { enrolled: false, generation: 'idle' } )
  } )

  it( 'PATCH returns 400 for a body without enrolled', async () => {
    await scanned()

    const response = await request( app )
      .patch( `/api/melete/notes/${ note( GENERICS ).id }` )
      .send( {} )

    expect( response.status ).toBe( 400 )
  } )

  it( 'POST regenerate answers 202 with the note queued', async () => {
    await scanned()
    const { id } = note( GENERICS )
    await request( app ).patch( `/api/melete/notes/${ id }` ).send( { enrolled: true } )
    updateNote( userId, id, { generation: 'idle' } )
    const questionId = addQuestion( userId, id )

    const response = await request( app ).post( `/api/melete/notes/${ id }/regenerate` )

    expect( response.status ).toBe( 202 )
    expect( GetMeleteNoteResponse.parse( response.body ).note.generation ).toBe( 'queued' )
    expect( findQuestion( userId, questionId )?.state ).toBe( 'retired' )
  } )

  it( 'POST regenerate returns 409 for a note that is not enrolled or already queued', async () => {
    await scanned()
    const { id } = note( GENERICS )

    const notEnrolled = await request( app ).post( `/api/melete/notes/${ id }/regenerate` )
    await request( app ).patch( `/api/melete/notes/${ id }` ).send( { enrolled: true } )
    const queued = await request( app ).post( `/api/melete/notes/${ id }/regenerate` )

    expect( notEnrolled.status ).toBe( 409 )
    expect( queued.status ).toBe( 409 )
  } )

  it( 'POST retry answers 202 for a failed note and 409 for any other', async () => {
    await scanned()
    const { id } = note( GENERICS )

    const idle = await request( app ).post( `/api/melete/notes/${ id }/retry` )
    updateNote( userId, id, { generation: 'failed', generation_error: 'Too long' } )
    const failed = await request( app ).post( `/api/melete/notes/${ id }/retry` )

    expect( idle.status ).toBe( 409 )
    expect( failed.status ).toBe( 202 )
    expect( GetMeleteNoteResponse.parse( failed.body ).note )
      .toMatchObject( { generation: 'queued', generation_error: null } )
  } )

  it.each( [ 'get', 'patch', 'post' ] as const )(
    'returns 404 for an unknown note (%s)',
    async ( method ) => {
      const id = crypto.randomUUID()
      const response = method === 'post'
        ? await request( app ).post( `/api/melete/notes/${ id }/regenerate` )
        : await request( app )[ method ]( `/api/melete/notes/${ id }` ).send( { enrolled: true } )

      expect( response.status ).toBe( 404 )
    },
  )

  it( 'returns 400 for an id that is not a uuid', async () => {
    expect( ( await request( app ).get( '/api/melete/notes/nope' ) ).status ).toBe( 400 )
    expect( ( await request( app ).post( '/api/melete/notes/nope/retry' ) ).status ).toBe( 400 )
  } )
} )

describe( 'POST /api/melete/questions/:id/drop', () => {
  it( 'drops an active question', async () => {
    await scanned()
    const questionId = addQuestion( userId, note( GENERICS ).id )

    const response = await request( app ).post( `/api/melete/questions/${ questionId }/drop` )

    expect( response.status ).toBe( 200 )
    expect( MeleteQuestion.parse( ( response.body as { question: unknown } ).question ) )
      .toMatchObject( { id: questionId, state: 'dropped' } )
  } )

  it( 'returns 409 for a question that is already dropped', async () => {
    await scanned()
    const questionId = addQuestion( userId, note( GENERICS ).id, { state: 'dropped' } )

    expect( ( await request( app ).post( `/api/melete/questions/${ questionId }/drop` ) ).status )
      .toBe( 409 )
  } )

  it( 'returns 404 for an unknown question and 400 for a bad id', async () => {
    expect( ( await request( app ).post( `/api/melete/questions/${ crypto.randomUUID() }/drop` ) )
      .status ).toBe( 404 )
    expect( ( await request( app ).post( '/api/melete/questions/nope/drop' ) ).status )
      .toBe( 400 )
  } )
} )

const treeOf = async ( root: string ): Promise< string[] > => {
  const names = await readdir( root, { recursive: true } )
  const lines = await Promise.all( names.map( async ( name ) => {
    const { mtimeMs, size } = await stat( join( root, name ) )

    return `${ name }:${ mtimeMs }:${ size }`
  } ) )

  return lines.sort()
}

const PAST = '2026-01-01T00:00:00.000Z'

// A question in an enrolled note that is already due
const dueQuestion = async (): Promise< string > => {
  await scanned()
  await request( app )
    .post( `/api/melete/subjects/${ subject( 'TypeScript' ).id }/enrollment` )
    .send( { enrolled: true } )

  return addQuestion( userId, note( GENERICS ).id, { fsrsState: 'review', due: PAST } )
}

describe( 'GET /api/melete/review/next', () => {
  it( 'answers 409 until a learning root is chosen', async () => {
    setSetting( userId, 'melete_learning_root', null )

    const response = await request( app ).get( '/api/melete/review/next' )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Choose a learning root first' } )
  } )

  it( 'returns the next due question with the counts', async () => {
    const id = await dueQuestion()

    const response = await request( app ).get( '/api/melete/review/next' )
    const body = GetNextReviewResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( body.item?.question.id ).toBe( id )
    expect( body.item?.note ).toMatchObject( { path: 'Learning/TypeScript/Generics.md' } )
    expect( body.counts ).toEqual( { due: 1, new_remaining: 0, learning_soon: 0 } )
  } )

  it( 'returns a null item when nothing is due', async () => {
    await scanned()

    const response = await request( app ).get( '/api/melete/review/next' )

    expect( response.status ).toBe( 200 )
    expect( GetNextReviewResponse.parse( response.body ).item ).toBeNull()
  } )

  it( 'limits the queue to one subject', async () => {
    await dueQuestion()

    const next = ( name: string ) => {
      return request( app ).get( `/api/melete/review/next?subject=${ subject( name ).id }` )
    }
    const rust = await next( 'Rust' )
    const typescript = await next( 'TypeScript' )

    expect( GetNextReviewResponse.parse( rust.body ).item ).toBeNull()
    expect( GetNextReviewResponse.parse( typescript.body ).item ).not.toBeNull()
  } )

  it( 'links to the note in the user\'s own Obsidian vault', async () => {
    await dueQuestion()

    const response = await request( app ).get( '/api/melete/review/next' )

    expect( GetNextReviewResponse.parse( response.body ).item?.obsidian_url )
      .toBe( 'obsidian://open?vault=vault&file=Learning%2FTypeScript%2FGenerics' )
  } )

  it( 'answers 400 for a subject that is not a uuid and 404 for an unknown one', async () => {
    await scanned()

    expect( ( await request( app ).get( '/api/melete/review/next?subject=nope' ) ).status )
      .toBe( 400 )
    expect( ( await request( app )
      .get( `/api/melete/review/next?subject=${ crypto.randomUUID() }` ) ).status ).toBe( 404 )
  } )

  it( 'leaves the vault untouched', async () => {
    await dueQuestion()
    const before = await treeOf( vault.vaultPath )

    await request( app ).get( '/api/melete/review/next' )

    expect( await treeOf( vault.vaultPath ) ).toEqual( before )
  } )
} )

describe( 'POST /api/melete/questions/:id/grade', () => {
  const usage = { input_tokens: 10, output_tokens: 5 }
  const output = {
    verdict: 'partial' as const,
    right: [ 'The idea' ],
    missed: [ 'The detail' ],
    feedback: 'Close.',
    suggested_rating: 'hard' as const,
  }

  it( 'grades an answer', async () => {
    const id = await dueQuestion()
    grade.mockResolvedValue( { output, usage } )

    const response = await request( app )
      .post( `/api/melete/questions/${ id }/grade` )
      .send( { answer: 'Some answer' } )
    const body = GradeAnswerResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( body ).toMatchObject( { outcome: 'graded', grade: output } )
  } )

  it( 'skips a blank answer', async () => {
    const id = await dueQuestion()

    const response = await request( app )
      .post( `/api/melete/questions/${ id }/grade` )
      .send( { answer: '  ' } )

    expect( response.status ).toBe( 200 )
    expect( response.body ).toEqual( { outcome: 'skipped', reason: 'blank' } )
    expect( grade ).not.toHaveBeenCalled()
  } )

  it( 'still answers 200 when Claude fails', async () => {
    const id = await dueQuestion()
    grade.mockRejectedValue( new MeleteError( 'Grading failed: Rate limited' ) )

    const response = await request( app )
      .post( `/api/melete/questions/${ id }/grade` )
      .send( { answer: 'Some answer' } )

    expect( response.status ).toBe( 200 )
    expect( response.body ).toMatchObject( {
      outcome: 'failed',
      reason: 'Grading failed: Rate limited',
    } )
  } )

  it( 'answers 400 for a missing, non-text or too long answer and for a bad id', async () => {
    const id = await dueQuestion()
    const post = ( target: string, body: object ) => {
      return request( app ).post( `/api/melete/questions/${ target }/grade` ).send( body )
    }

    expect( ( await post( id, {} ) ).status ).toBe( 400 )
    expect( ( await post( id, { answer: 5 } ) ).status ).toBe( 400 )
    expect( ( await post( id, { answer: 'x'.repeat( 4001 ) } ) ).status ).toBe( 400 )
    expect( ( await post( 'nope', { answer: 'x' } ) ).status ).toBe( 400 )
  } )

  it( 'answers 404 for an unknown question and 409 for a dropped one', async () => {
    const id = await dueQuestion()

    expect( ( await request( app )
      .post( `/api/melete/questions/${ crypto.randomUUID() }/grade` )
      .send( { answer: 'x' } ) ).status ).toBe( 404 )

    await request( app ).post( `/api/melete/questions/${ id }/drop` )

    expect( ( await request( app )
      .post( `/api/melete/questions/${ id }/grade` )
      .send( { answer: 'x' } ) ).status ).toBe( 409 )
  } )
} )

describe( 'POST /api/melete/questions/:id/review', () => {
  const rate = ( id: string, body: object ) => {
    return request( app ).post( `/api/melete/questions/${ id }/review` ).send( body )
  }

  it( 'records the rating, moves the question on and returns fresh counts', async () => {
    const id = await dueQuestion()

    const response = await rate( id, { rating: 'good', mode: 'quick' } )
    const body = RecordReviewResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( body.question ).toMatchObject( { id, reps: 1 } )
    expect( body.question.due !== PAST ).toBe( true )
    expect( body.counts.due ).toBe( 0 )
    expect( findQuestion( userId, id )?.reps ).toBe( 1 )
  } )

  it( 'answers 400 for a bad rating, mode, grade run or id, changing nothing', async () => {
    const id = await dueQuestion()

    expect( ( await rate( id, { rating: 'perfect', mode: 'quick' } ) ).status ).toBe( 400 )
    expect( ( await rate( id, { rating: 'good', mode: 'slow' } ) ).status ).toBe( 400 )
    expect( ( await rate( id, { rating: 'good' } ) ).status ).toBe( 400 )
    expect( ( await rate( id, { rating: 'good', mode: 'typed', grade_run_id: 9999 } ) ).status )
      .toBe( 400 )
    expect( ( await rate( 'nope', { rating: 'good', mode: 'quick' } ) ).status ).toBe( 400 )
    expect( findQuestion( userId, id )?.reps ).toBe( 0 )
  } )

  it( 'answers 404 for an unknown question and 409 for a dropped one', async () => {
    const id = await dueQuestion()

    expect( ( await rate( crypto.randomUUID(), { rating: 'good', mode: 'quick' } ) ).status )
      .toBe( 404 )

    await request( app ).post( `/api/melete/questions/${ id }/drop` )

    expect( ( await rate( id, { rating: 'good', mode: 'quick' } ) ).status ).toBe( 409 )
  } )

  it( 'leaves the vault untouched', async () => {
    const id = await dueQuestion()
    const before = await treeOf( vault.vaultPath )

    await rate( id, { rating: 'easy', mode: 'quick' } )

    expect( await treeOf( vault.vaultPath ) ).toEqual( before )
  } )
} )
