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
import { gradeAnswer as gradeWithClaude } from '../clients/claude.client.js'
// Shared
import {
  GetNextReviewResponse,
  GradeAnswerResponse,
  RecordReviewResponse,
} from '@atlas/shared'
// Errors
import {
  ConflictError,
  MeleteError,
  NotFoundError,
  ValidationError,
} from '../errors.js'
// Melete
import {
  LOCKED_INSTRUCTIONS_MELETE_GRADING,
  buildMeleteGradingUser,
  buildMeleteSystemPrompt,
} from '../melete/prompts.js'
import {
  createScheduler,
  fromRow,
  nextCard,
  toRow,
} from '../melete/scheduler.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { listConcepts, replaceSyllabus } from '../repositories/meleteConcepts.repository.js'
import { listNotesUnder } from '../repositories/meleteNotes.repository.js'
import { CardRow, findQuestion } from '../repositories/meleteQuestions.repository.js'
import { insertReview } from '../repositories/meleteReviews.repository.js'
import { insertRun } from '../repositories/meleteRuns.repository.js'
import { listSubjects } from '../repositories/meleteSubjects.repository.js'
import { getSetting, setSetting } from '../repositories/settings.repository.js'
// Services
import { setNoteEnrolled, setSubjectEnrolled, updateSubject } from './melete.service.js'
import {
  getNextReview,
  gradeAnswer,
  recordReview,
} from './meleteReview.service.js'
import { resetScanClock, scanLearningRoot } from './meleteScan.service.js'
import { resolveMeletePrompt } from './prompts.service.js'
// Logging
import { logger } from '../logger.js'
// Test support
import { addQuestion } from '../test-support/meleteData.fixture.js'
import { MeleteVault, createMeleteVault } from '../test-support/meleteVault.fixture.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const configMock = vi.hoisted( () => ( {
  logLevel: 'silent',
  sessionDays: 30,
  vaultsPath: '',
  timeZone: 'Asia/Singapore',
  melete: { requestRetention: 0.9, dayStartHour: 4, gradingTimeoutMs: 20_000 },
} ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( '../clients/claude.client.js' )

const grade = vi.mocked( gradeWithClaude )

// 18:00 in Singapore, so the day started at 2026-10-21T20:00Z
const NOW = new Date( '2026-10-22T10:00:00.000Z' )
const at = ( seconds: number ): Date => new Date( NOW.getTime() + seconds * 1000 )
const iso = ( seconds: number ): string => at( seconds ).toISOString()

const GENERICS = 'TypeScript/Generics.md'
const CONDITIONAL = 'TypeScript/Advanced/Conditional Types.md'
const OWNERSHIP = 'Rust/Ownership.md'

let vault: MeleteVault

const noteId = ( path: string ): string => {
  const found = listNotesUnder( userId, 'Learning' ).find( ( note ) => {
    return note.path === `Learning/${ path }` && note.missing_at === null
  } )

  if( found === undefined ) {
    throw new Error( `No note ${ path }` )
  }

  return found.id
}

const subjectId = ( name: string ): string => {
  const found = listSubjects( userId ).find( ( { folder } ) => folder === `Learning/${ name }` )

  if( found === undefined ) {
    throw new Error( `No subject ${ name }` )
  }

  return found.id
}

const reviewNew = ( questionId: string, atTime: string ): void => {
  insertReview( userId, {
    question_id: questionId,
    reviewed_at: atTime,
    mode: 'quick',
    rating: 'good',
    suggested_rating: null,
    answer: null,
    grade_run_id: null,
    was_new: true,
    before_state: '{}',
  } )
}

beforeEach( async () => {
  vault = await createMeleteVault()
  configMock.vaultsPath = vault.vaultsPath
  configMock.melete.dayStartHour = 4
  setSetting( userId, 'melete_learning_root', 'Learning' )
  setSetting( userId, 'melete_grading_model', 'claude-haiku-5-5' )
  grade.mockReset()
  resetScanClock()
  await scanLearningRoot( userId, { force: true, now: at( -60 ) } )
  await setSubjectEnrolled( userId, subjectId( 'TypeScript' ), true, at( -50 ) )
  await setSubjectEnrolled( userId, subjectId( 'Rust' ), true, at( -50 ) )
} )

afterEach( async () => {
  await vault.cleanup()
} )

describe( 'getNextReview', () => {
  it( 'asks for a learning root first', async () => {
    setSetting( userId, 'melete_learning_root', null )

    await expect( getNextReview( userId, { now: at( 0 ) } ) ).rejects.toThrow( ConflictError )
  } )

  it( 'has nothing to show when there are no questions', async () => {
    expect( await getNextReview( userId, { now: at( 0 ) } ) ).toEqual( {
      item: null,
      counts: { due: 0, new_remaining: 0, learning_soon: 0 },
    } )
  } )

  it( 'serves a due question before a new one', async () => {
    const generics = noteId( GENERICS )
    addQuestion( userId, generics, { position: 1 } )
    const due = addQuestion(
      userId,
      generics,
      { position: 2, fsrsState: 'review', due: iso( -60 ) },
    )

    const { item } = await getNextReview( userId, { now: at( 0 ) } )

    expect( item?.question.id ).toBe( due )
  } )

  it( 'serves learning and relearning questions before review ones', async () => {
    const generics = noteId( GENERICS )
    addQuestion( userId, generics, { position: 1, fsrsState: 'review', due: iso( -3600 ) } )
    const relearning = addQuestion( userId, generics, {
      position: 2,
      fsrsState: 'relearning',
      due: iso( -60 ),
    } )

    const { item } = await getNextReview( userId, { now: at( 0 ) } )

    expect( item?.question.id ).toBe( relearning )
  } )

  it( 'serves the earliest due question first among those of the same kind', async () => {
    const generics = noteId( GENERICS )
    addQuestion( userId, generics, { position: 1, fsrsState: 'review', due: iso( -60 ) } )
    const earlier = addQuestion(
      userId,
      generics,
      { position: 2, fsrsState: 'review', due: iso( -600 ) },
    )

    expect( ( await getNextReview( userId, { now: at( 0 ) } ) ).item?.question.id ).toBe( earlier )
  } )

  it( 'serves new questions by note path then position, stamping the first', async () => {
    const conditional = noteId( CONDITIONAL )
    const generics = noteId( GENERICS )
    addQuestion( userId, generics, { position: 1 } )
    const first = addQuestion( userId, conditional, { position: 1 } )
    addQuestion( userId, conditional, { position: 2 } )

    const { item, counts } = await getNextReview( userId, { now: at( 0 ) } )

    expect( item?.question.id ).toBe( first )
    expect( item?.question ).toMatchObject( { fsrs_state: 'new', due: iso( 0 ) } )
    expect( findQuestion( userId, first ) ).toMatchObject( { fsrs_state: 'new', due: iso( 0 ) } )
    expect( counts ).toEqual( { due: 1, new_remaining: 2, learning_soon: 0 } )
  } )

  it( 'serves the same new question again until it is rated', async () => {
    const generics = noteId( GENERICS )
    const first = addQuestion( userId, generics, { position: 1 } )
    addQuestion( userId, generics, { position: 2 } )

    await getNextReview( userId, { now: at( 0 ) } )
    const again = await getNextReview( userId, { now: at( 30 ) } )

    expect( again.item?.question.id ).toBe( first )
    expect( findQuestion( userId, first )?.due ).toBe( iso( 0 ) )
  } )

  it( 'stops serving new questions once the subject\'s limit for the day is used', async () => {
    const generics = noteId( GENERICS )
    updateSubject( userId, subjectId( 'TypeScript' ), { new_per_day: 2 } )
    const reviewed = [ 1, 2 ].map( ( position ) => {
      return addQuestion( userId, generics, { position, fsrsState: 'review', due: iso( 86_400 ) } )
    } )
    addQuestion( userId, generics, { position: 3 } )
    reviewed.forEach( ( id ) => reviewNew( id, '2026-10-21T21:00:00.000Z' ) )

    expect( await getNextReview( userId, { now: at( 0 ) } ) ).toEqual( {
      item: null,
      counts: { due: 0, new_remaining: 0, learning_soon: 0 },
    } )
  } )

  it( 'does not count new questions reviewed before the day started', async () => {
    const generics = noteId( GENERICS )
    updateSubject( userId, subjectId( 'TypeScript' ), { new_per_day: 1 } )
    const old = addQuestion(
      userId,
      generics,
      { position: 1, fsrsState: 'review', due: iso( 86_400 ) },
    )
    const next = addQuestion( userId, generics, { position: 2 } )
    reviewNew( old, '2026-10-21T19:59:00.000Z' )

    const { item } = await getNextReview( userId, { now: at( 0 ) } )

    expect( item?.question.id ).toBe( next )
  } )

  it( 'starts the day at midnight when the start hour is 0', async () => {
    const generics = noteId( GENERICS )
    configMock.melete.dayStartHour = 0
    updateSubject( userId, subjectId( 'TypeScript' ), { new_per_day: 1 } )
    const old = addQuestion(
      userId,
      generics,
      { position: 1, fsrsState: 'review', due: iso( 86_400 ) },
    )
    addQuestion( userId, generics, { position: 2 } )
    reviewNew( old, '2026-10-21T19:59:00.000Z' )

    expect( ( await getNextReview( userId, { now: at( 0 ) } ) ).item ).toBeNull()
  } )

  it( 'serves no new questions when the limit is 0', async () => {
    updateSubject( userId, subjectId( 'TypeScript' ), { new_per_day: 0 } )
    addQuestion( userId, noteId( GENERICS ) )

    const { item, counts } = await getNextReview( userId, { now: at( 0 ) } )

    expect( item ).toBeNull()
    expect( counts.new_remaining ).toBe( 0 )
  } )

  it( 'leaves out unenrolled and missing notes and dropped and retired questions', async () => {
    const generics = noteId( GENERICS )
    const conditional = noteId( CONDITIONAL )
    const ownership = noteId( OWNERSHIP )
    addQuestion(
      userId,
      generics,
      { position: 1, state: 'dropped', fsrsState: 'review', due: iso( -60 ) },
    )
    addQuestion(
      userId,
      generics,
      { position: 2, state: 'retired', fsrsState: 'review', due: iso( -60 ) },
    )
    addQuestion( userId, conditional, { fsrsState: 'review', due: iso( -60 ) } )
    addQuestion( userId, ownership, { fsrsState: 'review', due: iso( -60 ) } )
    setNoteEnrolled( userId, conditional, false, at( 0 ) )
    await vault.remove( 'Learning/Rust/Ownership.md' )
    resetScanClock()

    expect( ( await getNextReview( userId, { now: at( 0 ) } ) ).item ).toBeNull()
  } )

  it( 'brings a learning question back a few minutes early, and not a distant one', async () => {
    const generics = noteId( GENERICS )
    const soon = addQuestion( userId, generics, { fsrsState: 'learning', due: iso( 10 * 60 ) } )

    const found = await getNextReview( userId, { now: at( 0 ) } )

    expect( found.item?.question.id ).toBe( soon )
    expect( found.counts ).toEqual( { due: 0, new_remaining: 0, learning_soon: 1 } )
    expect( ( await getNextReview( userId, { now: at( -15 * 60 ) } ) ).item ).toBeNull()
  } )

  it( 'serves a new question before a learning one that is only coming up', async () => {
    const generics = noteId( GENERICS )
    addQuestion( userId, generics, { position: 1, fsrsState: 'learning', due: iso( 5 * 60 ) } )
    const fresh = addQuestion( userId, generics, { position: 2 } )

    expect( ( await getNextReview( userId, { now: at( 0 ) } ) ).item?.question.id ).toBe( fresh )
  } )

  it( 'limits everything to one subject when asked', async () => {
    const typescript = subjectId( 'TypeScript' )
    const rust = subjectId( 'Rust' )
    addQuestion( userId, noteId( GENERICS ), { fsrsState: 'review', due: iso( -600 ) } )
    const ownership = addQuestion(
      userId,
      noteId( OWNERSHIP ),
      { fsrsState: 'review', due: iso( -60 ) },
    )

    const scoped = await getNextReview( userId, { subjectId: rust, now: at( 0 ) } )

    expect( scoped.item?.question.id ).toBe( ownership )
    expect( scoped.counts.due ).toBe( 1 )
    const other = await getNextReview( userId, { subjectId: typescript, now: at( 0 ) } )

    expect( other.counts.due ).toBe( 1 )
    expect( ( await getNextReview( userId, { now: at( 0 ) } ) ).counts.due ).toBe( 2 )
  } )

  it( 'refuses an unknown subject', async () => {
    await expect( getNextReview( userId, { subjectId: crypto.randomUUID(), now: at( 0 ) } ) )
      .rejects.toThrow( NotFoundError )
  } )

  it( 'refuses a subject that is no longer in the learning root', async () => {
    const rust = subjectId( 'Rust' )

    setSetting( userId, 'melete_learning_root', 'Inbox' )
    resetScanClock()

    await expect( getNextReview( userId, { subjectId: rust, now: at( 0 ) } ) )
      .rejects.toThrow( NotFoundError )
  } )

  it( 'describes the note and links to it in the user\'s own Obsidian vault', async () => {
    addQuestion( userId, noteId( GENERICS ), { fsrsState: 'review', due: iso( -60 ) } )

    const response = GetNextReviewResponse.parse( await getNextReview( userId, { now: at( 0 ) } ) )

    expect( response.item?.note ).toMatchObject( {
      title: 'Generics in TypeScript',
      path: 'Learning/TypeScript/Generics.md',
      subject_name: 'TypeScript',
    } )
    expect( response.item?.obsidian_url )
      .toBe( 'obsidian://open?vault=vault&file=Learning%2FTypeScript%2FGenerics' )
  } )

  it( 'links to the other user\'s vault for the same note path', async () => {
    await vault.clone( 'Brain' )
    const other = createTestUser( { vault_dir: 'Brain' } ).id
    setSetting( other, 'melete_learning_root', 'Learning' )
    await scanLearningRoot( other, { force: true, now: at( -60 ) } )
    const theirSubject = listSubjects( other )
      .find( ( { folder } ) => folder === 'Learning/TypeScript' )
    await setSubjectEnrolled( other, theirSubject?.id ?? '', true, at( -50 ) )
    const theirs = listNotesUnder( other, 'Learning' ).find( ( found ) => {
      return found.path === `Learning/${ GENERICS }`
    } )
    addQuestion( other, theirs?.id ?? '', { fsrsState: 'review', due: iso( -60 ) } )

    const response = await getNextReview( other, { now: at( 0 ) } )

    expect( response.item?.obsidian_url )
      .toBe( 'obsidian://open?vault=Brain&file=Learning%2FTypeScript%2FGenerics' )
  } )

  it( 'notices a note edited in the vault before building the queue', async () => {
    const generics = noteId( GENERICS )
    addQuestion( userId, generics, { fsrsState: 'review', due: iso( -60 ), hash: 'old' } )
    await vault.write( 'Learning/TypeScript/Generics.md', '# Generics\n\nChanged.\n' )
    resetScanClock()

    await getNextReview( userId, { now: at( 60 ) } )

    expect( listNotesUnder( userId, 'Learning' ).find( ( { id } ) => id === generics )?.generation )
      .toBe( 'queued' )
  } )
} )

const usage = { input_tokens: 800, output_tokens: 120 }
const graded = {
  verdict: 'partial' as const,
  right: [ 'Named the idea' ],
  missed: [ 'The detail' ],
  feedback: 'Close; add the detail.',
  suggested_rating: 'hard' as const,
}

const runs = () => getDatabase().prepare( 'SELECT * FROM melete_runs ORDER BY id' ).all()
const reviews = () => getDatabase().prepare( 'SELECT * FROM melete_reviews ORDER BY id' ).all()

const reviewable = ( options: Parameters< typeof addQuestion >[ 2 ] = {} ): string => {
  return addQuestion(
    userId,
    noteId( GENERICS ),
    { fsrsState: 'review', due: iso( -60 ), ...options },
  )
}

describe( 'getNextReview for one concept', () => {
  // TypeScript with concepts A and B; Rust with one
  const concepts = () => {
    replaceSyllabus( userId, subjectId( 'TypeScript' ), [ {
      name: 'S',
      concepts: [ { name: 'A', description: '' }, { name: 'B', description: '' } ],
    } ] )
    replaceSyllabus( userId, subjectId( 'Rust' ), [ {
      name: 'R',
      concepts: [ { name: 'C', description: '' } ],
    } ] )

    const [ a, b ] = listConcepts( userId, subjectId( 'TypeScript' ) )
    const [ c ] = listConcepts( userId, subjectId( 'Rust' ) )

    return { a: a?.id ?? '', b: b?.id ?? '', c: c?.id ?? '' }
  }

  it( 'serves the concept\'s questions only, overdue first and then not due yet', async () => {
    const { a, b } = concepts()
    const generics = noteId( GENERICS )
    const later = addQuestion( userId, generics, {
      position: 1,
      conceptId: a,
      fsrsState: 'review',
      due: iso( 86_400 ),
      lastReview: iso( -86_400 * 3 ),
    } )
    const overdue = addQuestion( userId, generics, {
      position: 2,
      conceptId: a,
      fsrsState: 'review',
      due: iso( -60 ),
      lastReview: iso( -86_400 * 3 ),
    } )

    addQuestion( userId, generics, {
      position: 3,
      conceptId: b,
      fsrsState: 'review',
      due: iso( -600 ),
    } )

    expect( ( await getNextReview( userId, { conceptId: a, now: at( 0 ) } ) ).item?.question.id )
      .toBe( overdue )

    getDatabase().prepare( 'UPDATE melete_questions SET due = ? WHERE id = ?' )
      .run( iso( 3600 ), overdue )
    getDatabase().prepare( 'UPDATE melete_questions SET last_review = ? WHERE id = ?' )
      .run( iso( -60 ), overdue )

    expect( ( await getNextReview( userId, { conceptId: a, now: at( 0 ) } ) ).item?.question.id )
      .toBe( later )
  } )

  it( 'serves a question not yet due even though the subject has nothing due', async () => {
    const { a } = concepts()
    const early = addQuestion( userId, noteId( GENERICS ), {
      conceptId: a,
      fsrsState: 'review',
      due: iso( 5 * 86_400 ),
      lastReview: iso( -86_400 * 2 ),
    } )

    expect( ( await getNextReview( userId, { now: at( 0 ) } ) ).item ).toBeNull()
    expect( ( await getNextReview( userId, { conceptId: a, now: at( 0 ) } ) ).item?.question.id )
      .toBe( early )
  } )

  it( 'serves a new question despite the day\'s new-question limit, and stamps it', async () => {
    const { a } = concepts()
    const fresh = addQuestion( userId, noteId( GENERICS ), { conceptId: a } )

    updateSubject( userId, subjectId( 'TypeScript' ), { new_per_day: 0 } )

    const { item } = await getNextReview( userId, { conceptId: a, now: at( 0 ) } )

    expect( item?.question.id ).toBe( fresh )
    expect( findQuestion( userId, fresh )?.due ).toBe( iso( 0 ) )
  } )

  it( 'ends once the concept has been gone through, with the subject\'s counts', async () => {
    const { a } = concepts()

    addQuestion( userId, noteId( GENERICS ), {
      conceptId: a,
      fsrsState: 'review',
      due: iso( 86_400 ),
      lastReview: iso( -60 ),
    } )
    addQuestion( userId, noteId( GENERICS ), {
      position: 2,
      fsrsState: 'review',
      due: iso( -60 ),
    } )

    expect( await getNextReview( userId, { conceptId: a, now: at( 0 ) } ) )
      .toEqual( { item: null, counts: { due: 1, new_remaining: 0, learning_soon: 0 } } )
  } )

  it( 'asks for the concept\'s subject when the subject is given too', async () => {
    const { a, c } = concepts()
    const mine = addQuestion( userId, noteId( GENERICS ), {
      conceptId: a,
      fsrsState: 'review',
      due: iso( -60 ),
    } )

    addQuestion( userId, noteId( OWNERSHIP ), {
      conceptId: c,
      fsrsState: 'review',
      due: iso( -60 ),
    } )

    const { item } = await getNextReview( userId, {
      conceptId: a,
      subjectId: subjectId( 'Rust' ),
      now: at( 0 ),
    } )

    expect( item?.question.id ).toBe( mine )
    expect( item?.note.subject_name ).toBe( 'TypeScript' )
  } )

  it( 'answers not found for an unknown concept and for another user\'s', async () => {
    const { a } = concepts()
    await vault.clone( 'other' )

    const other = createTestUser( { vault_dir: 'other' } ).id

    setSetting( other, 'melete_learning_root', 'Learning' )

    await expect( getNextReview( userId, { conceptId: crypto.randomUUID(), now: at( 0 ) } ) )
      .rejects.toThrow( NotFoundError )
    await expect( getNextReview( other, { conceptId: a, now: at( 0 ) } ) )
      .rejects.toThrow( NotFoundError )
  } )
} )

describe( 'gradeAnswer', () => {
  it( 'grades the answer against the reference and records the run', async () => {
    const id = reviewable()
    getDatabase().prepare( 'UPDATE melete_questions SET passage = ? WHERE id = ?' )
      .run( 'The passage.', id )
    setSetting( userId, 'melete_grading_model', 'claude-sonnet-5-5' )
    grade.mockResolvedValue( { output: graded, usage } )

    const response = await gradeAnswer( userId, id, { answer: 'My answer' }, at( 0 ) )

    const { version } = resolveMeletePrompt( userId, 'melete_grading' )
    const [ run ] = runs()

    expect( GradeAnswerResponse.parse( response ) ).toEqual( {
      outcome: 'graded',
      grade: graded,
      run_id: ( run as { id: number } ).id,
    } )
    expect( grade ).toHaveBeenCalledWith( {
      model: 'claude-sonnet-5-5',
      system: buildMeleteSystemPrompt( LOCKED_INSTRUCTIONS_MELETE_GRADING, version.guidance ),
      user: buildMeleteGradingUser( {
        question: 'Prompt',
        answer: 'Answer',
        passage: 'The passage.',
        learnerAnswer: 'My answer',
      } ),
    } )
    expect( run ).toMatchObject( {
      kind: 'grade',
      note_id: null,
      question_id: id,
      model: 'claude-sonnet-5-5',
      prompt_version_id: version.id,
      input_tokens: 800,
      output_tokens: 120,
      outcome: 'succeeded',
      error: null,
      created_at: iso( 0 ),
    } )
    expect( ( run as { cost_usd: number } ).cost_usd ).toBeGreaterThan( 0 )
  } )

  it.each( [ '', '   ', 'idk', 'I don\'t know.', '???' ] )(
    'skips grading a blank answer (%j) without a call or a run',
    async ( answer ) => {
      const id = reviewable()

      expect( await gradeAnswer( userId, id, { answer }, at( 0 ) ) )
        .toEqual( { outcome: 'skipped', reason: 'blank' } )
      expect( grade ).not.toHaveBeenCalled()
      expect( runs() ).toHaveLength( 0 )
    },
  )

  it( 'answers failed, with the run, when Claude gives nothing usable', async () => {
    const id = reviewable()
    grade.mockRejectedValue(
      new MeleteError( 'Grading was cut off before it finished', { usage } ),
    )

    const response = await gradeAnswer( userId, id, { answer: 'Something' }, at( 0 ) )
    const [ run ] = runs()

    expect( response ).toEqual( {
      outcome: 'failed',
      reason: 'Grading was cut off before it finished',
      run_id: ( run as { id: number } ).id,
    } )
    expect( run ).toMatchObject( {
      outcome: 'failed',
      error: 'Grading was cut off before it finished',
      input_tokens: 800,
      output_tokens: 120,
    } )
  } )

  it( 'records a failed run with no tokens when the call never produced any', async () => {
    const id = reviewable()
    grade.mockRejectedValue( new MeleteError( 'Grading failed: Rate limited' ) )

    await gradeAnswer( userId, id, { answer: 'Something' }, at( 0 ) )

    expect( runs()[ 0 ] ).toMatchObject( {
      outcome: 'failed',
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    } )
  } )

  it( 'answers failed with no run for an unexpected error, and does not throw', async () => {
    const id = reviewable()
    grade.mockRejectedValue( new TypeError( 'boom' ) )

    expect( await gradeAnswer( userId, id, { answer: 'Something' }, at( 0 ) ) )
      .toEqual( { outcome: 'failed', reason: 'Grading failed', run_id: null } )
    expect( runs() ).toHaveLength( 0 )
  } )

  it( 'refuses an unknown question', async () => {
    await expect( gradeAnswer( userId, crypto.randomUUID(), { answer: 'x' }, at( 0 ) ) )
      .rejects.toThrow( NotFoundError )
  } )

  it.each( [ 'dropped', 'retired' ] )( 'refuses a %s question', async ( state ) => {
    const id = reviewable( { state } )

    await expect( gradeAnswer( userId, id, { answer: 'x' }, at( 0 ) ) )
      .rejects.toThrow( ConflictError )
    expect( grade ).not.toHaveBeenCalled()
  } )

  it( 'refuses a question in an unenrolled note', async () => {
    const id = reviewable()

    setNoteEnrolled( userId, noteId( GENERICS ), false, at( 0 ) )

    await expect( gradeAnswer( userId, id, { answer: 'x' }, at( 0 ) ) )
      .rejects.toThrow( ConflictError )
  } )

  it( 'does not log the answer', async () => {
    const id = reviewable()
    const spies = [ 'info', 'warn', 'error', 'debug' ].map( ( level ) => {
      return vi.spyOn( logger, level as 'info' )
    } )
    grade.mockRejectedValue( new TypeError( 'boom' ) )

    await gradeAnswer( userId, id, { answer: 'a very private answer' }, at( 0 ) )

    expect( JSON.stringify( spies.flatMap( ( spy ) => spy.mock.calls ) ) )
      .not.toContain( 'a very private answer' )
  } )
} )

describe( 'recordReview', () => {
  const exact = createScheduler( { fuzz: false } )
  const body = { rating: 'good', mode: 'quick' } as const

  const cardOf = ( id: string ): CardRow => CardRow.parse( findQuestion( userId, id ) )

  it( 'moves the card on and stores the review with the card as it was', async () => {
    const id = reviewable()
    const before = cardOf( id )

    const response = await recordReview(
      userId,
      id,
      { ...body, answer: 'mine', suggested_rating: 'hard' },
      at( 0 ),
      exact,
    )

    const expected = toRow( nextCard( fromRow( before ), 'good', at( 0 ), exact ) )

    expect( cardOf( id ) ).toEqual( expected )
    expect( RecordReviewResponse.parse( response ).question ).toMatchObject( {
      id,
      fsrs_state: expected.fsrs_state,
      due: expected.due,
      reps: expected.reps,
    } )
    expect( reviews() ).toEqual( [ {
      id: 1,
      user_id: userId,
      question_id: id,
      reviewed_at: iso( 0 ),
      mode: 'quick',
      rating: 'good',
      suggested_rating: 'hard',
      answer: 'mine',
      grade_run_id: null,
      was_new: 0,
      before_state: JSON.stringify( before ),
    } ] )
  } )

  it( 'marks a review of a new question as new', async () => {
    const id = addQuestion( userId, noteId( GENERICS ) )

    await recordReview( userId, id, body, at( 0 ), exact )

    expect( reviews()[ 0 ] ).toMatchObject( { was_new: 1 } )
    expect( findQuestion( userId, id )?.fsrs_state ).toBe( 'learning' )
  } )

  it( 'counts a new question served and then rated against the day\'s limit', async () => {
    updateSubject( userId, subjectId( 'TypeScript' ), { new_per_day: 1 } )
    addQuestion( userId, noteId( GENERICS ), { position: 1 } )
    addQuestion( userId, noteId( GENERICS ), { position: 2 } )

    const served = await getNextReview( userId, { now: at( 0 ) } )
    const { counts } = await recordReview(
      userId,
      served.item?.question.id ?? '',
      { rating: 'easy', mode: 'quick' },
      at( 5 ),
      exact,
    )

    expect( counts ).toEqual( { due: 0, new_remaining: 0, learning_soon: 0 } )
    expect( ( await getNextReview( userId, { now: at( 10 ) } ) ).item ).toBeNull()
  } )

  it( 'brings an Again on a new question back within the session', async () => {
    const id = addQuestion( userId, noteId( GENERICS ) )

    const { counts } = await recordReview(
      userId,
      id,
      { rating: 'again', mode: 'quick' },
      at( 0 ),
      exact,
    )

    expect( counts.learning_soon ).toBe( 1 )
    expect( ( await getNextReview( userId, { now: at( 120 ) } ) ).item?.question.id ).toBe( id )
  } )

  it( 'remembers the mode only when it changes', async () => {
    const id = reviewable()
    setSetting( userId, 'melete_review_mode', 'typed' )

    await recordReview( userId, id, { ...body, mode: 'typed' }, at( 0 ), exact )
    expect( getSetting( userId, 'melete_review_mode' ) ).toBe( 'typed' )

    await recordReview( userId, id, { ...body, mode: 'quick' }, at( 1 ), exact )
    expect( getSetting( userId, 'melete_review_mode' ) ).toBe( 'quick' )
  } )

  it( 'accepts the grading run for this question', async () => {
    const id = reviewable()
    grade.mockResolvedValue( { output: graded, usage } )
    const response = await gradeAnswer( userId, id, { answer: 'My answer' }, at( 0 ) )
    const runId = response.outcome === 'graded' ? response.run_id : -1

    await recordReview( userId, id, { ...body, grade_run_id: runId }, at( 1 ), exact )

    expect( reviews()[ 0 ] ).toMatchObject( { grade_run_id: runId } )
  } )

  it.each( [ 'another question', 'a generation run', 'no run' ] )(
    'refuses a grade run id that is %s, changing nothing',
    async ( which ) => {
      const id = reviewable()
      const other = reviewable( { position: 2 } )
      const { version } = resolveMeletePrompt( userId, 'melete_grading' )
      const run = ( kind: 'grade' | 'generate', questionId: string | null ) => insertRun( userId, {
        kind,
        note_id: null,
        question_id: questionId,
        subject_id: null,
        model: 'm',
        prompt_version_id: version.id,
        input_tokens: null,
        output_tokens: null,
        cost_usd: null,
        outcome: 'succeeded',
        error: null,
        created_at: iso( 0 ),
      } )
      const runIds: Record< string, number > = {
        'another question': run( 'grade', other ),
        'a generation run': run( 'generate', id ),
        'no run': 9999,
      }
      const runId = runIds[ which ] ?? 0
      const before = cardOf( id )

      await expect( recordReview( userId, id, { ...body, grade_run_id: runId }, at( 1 ), exact ) )
        .rejects.toThrow( ValidationError )
      expect( cardOf( id ) ).toEqual( before )
      expect( reviews() ).toHaveLength( 0 )
    },
  )

  it( 'rolls the card back when the review cannot be stored', async () => {
    const id = reviewable()
    const before = cardOf( id )
    getDatabase().exec( `CREATE TRIGGER refuse_review BEFORE INSERT ON melete_reviews
      BEGIN SELECT RAISE( ABORT, 'refused' ); END` )

    await expect( recordReview( userId, id, body, at( 0 ), exact ) ).rejects.toThrow( 'refused' )

    expect( cardOf( id ) ).toEqual( before )
  } )

  it( 'refuses an unknown, dropped or unenrolled question', async () => {
    const dropped = reviewable( { state: 'dropped' } )
    const live = reviewable( { position: 2 } )

    await expect( recordReview( userId, crypto.randomUUID(), body, at( 0 ), exact ) )
      .rejects.toThrow( NotFoundError )
    await expect( recordReview( userId, dropped, body, at( 0 ), exact ) )
      .rejects.toThrow( ConflictError )

    setNoteEnrolled( userId, noteId( GENERICS ), false, at( 0 ) )

    await expect( recordReview( userId, live, body, at( 0 ), exact ) )
      .rejects.toThrow( ConflictError )
    expect( reviews() ).toHaveLength( 0 )
  } )
} )

describe( 'measured time from recordReview (ADR 0091)', () => {
  const exact = createScheduler( { fuzz: false } )
  const body = { rating: 'good', mode: 'quick' } as const

  const sessions = () => getDatabase().prepare( `SELECT subject_id, source, day, started_at,
    ended_at, seconds FROM time_entries ORDER BY started_at, rowid` ).all()

  const review = ( id: string, seconds: number ) => recordReview(
    userId,
    id,
    body,
    at( seconds ),
    exact,
  )

  it( 'starts a measured session for the question\'s subject with the final card', async () => {
    await review( reviewable(), 0 )

    expect( sessions() ).toEqual( [ {
      subject_id: subjectId( 'TypeScript' ),
      source: 'measured',
      day: '2026-10-22',
      started_at: iso( 0 ),
      ended_at: iso( 0 ),
      seconds: 30,
    } ] )
  } )

  it( 'extends the session for an answer within the gap', async () => {
    await review( reviewable(), 0 )
    await review( reviewable( { position: 2 } ), 120 )

    expect( sessions() ).toEqual( [ expect.objectContaining( {
      started_at: iso( 0 ),
      ended_at: iso( 120 ),
      seconds: 150,
    } ) ] )
  } )

  it( 'starts another session after a gap of more than five minutes', async () => {
    await review( reviewable(), 0 )
    await review( reviewable( { position: 2 } ), 360 )

    expect( sessions() ).toEqual( [
      expect.objectContaining( { started_at: iso( 0 ), seconds: 30 } ),
      expect.objectContaining( { started_at: iso( 360 ), seconds: 30 } ),
    ] )
  } )

  it( 'keeps a session for each subject', async () => {
    await review( reviewable(), 0 )
    await review(
      addQuestion( userId, noteId( OWNERSHIP ), { fsrsState: 'review', due: iso( -60 ) } ),
      30,
    )

    expect( sessions().map( ( row ) => ( row as { subject_id: string } ).subject_id ).sort() )
      .toEqual( [ subjectId( 'TypeScript' ), subjectId( 'Rust' ) ].sort() )
  } )

  it( 'follows the user\'s gap and final card settings', async () => {
    setSetting( userId, 'melete_session_gap_minutes', 1 )
    setSetting( userId, 'melete_final_card_seconds', 10 )
    await review( reviewable(), 0 )
    await review( reviewable( { position: 2 } ), 90 )
    await review( reviewable( { position: 3 } ), 120 )

    expect( sessions() ).toEqual( [
      expect.objectContaining( { started_at: iso( 0 ), seconds: 10 } ),
      expect.objectContaining( { started_at: iso( 90 ), ended_at: iso( 120 ), seconds: 40 } ),
    ] )
  } )

  it( 'is one user\'s own', async () => {
    const other = createTestUser( { modules: [ 'melete' ] } ).id

    await review( reviewable(), 0 )

    expect( getDatabase().prepare( 'SELECT COUNT(*) AS count FROM time_entries WHERE user_id = ?' )
      .get( other ) ).toEqual( { count: 0 } )
  } )

  it( 'writes no time when the review is refused or cannot be stored', async () => {
    const id = reviewable()

    await expect( recordReview( userId, crypto.randomUUID(), body, at( 0 ), exact ) )
      .rejects.toThrow( NotFoundError )
    getDatabase().exec( `CREATE TRIGGER refuse_review BEFORE INSERT ON melete_reviews
      BEGIN SELECT RAISE( ABORT, 'refused' ); END` )
    await expect( recordReview( userId, id, body, at( 0 ), exact ) ).rejects.toThrow( 'refused' )

    expect( sessions() ).toEqual( [] )
  } )

  it( 'is not recorded by grading an answer', async () => {
    grade.mockResolvedValue( { output: graded, usage } )

    await gradeAnswer( userId, reviewable(), { answer: 'something' }, at( 0 ) )

    expect( sessions() ).toEqual( [] )
  } )
} )

describe( 'reviews for two users', () => {
  const exact = createScheduler( { fuzz: false } )

  it( 'refuses a grading run that belongs to another user', async () => {
    await vault.clone( 'other' )
    const other = createTestUser( { vault_dir: 'other' } ).id
    const id = reviewable()
    const { version } = resolveMeletePrompt( other, 'melete_grading' )
    const theirRun = insertRun( other, {
      kind: 'grade',
      note_id: null,
      question_id: id,
      subject_id: null,
      model: 'm',
      prompt_version_id: version.id,
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      outcome: 'succeeded',
      error: null,
      created_at: iso( 0 ),
    } )

    await expect( recordReview(
      userId,
      id,
      { rating: 'good', mode: 'quick', grade_run_id: theirRun },
      at( 0 ),
      exact,
    ) ).rejects.toThrow( ValidationError )
    expect( reviews() ).toEqual( [] )
  } )

  it( 'refuses to grade or rate another user\'s question', async () => {
    await vault.clone( 'other' )
    const other = createTestUser( { vault_dir: 'other' } ).id
    const id = reviewable()

    await expect( gradeAnswer( other, id, { answer: 'mine' }, at( 0 ) ) )
      .rejects.toThrow( NotFoundError )
    await expect( recordReview( other, id, { rating: 'good', mode: 'quick' }, at( 0 ), exact ) )
      .rejects.toThrow( NotFoundError )
    expect( grade ).not.toHaveBeenCalled()
  } )

  it( 'counts and serves only the caller\'s questions', async () => {
    await vault.clone( 'other' )
    const other = createTestUser( { vault_dir: 'other' } ).id

    reviewable()
    setSetting( other, 'melete_learning_root', 'Learning' )

    const theirs = await getNextReview( other, { now: at( 0 ) } )

    expect( theirs ).toEqual( {
      item: null,
      counts: { due: 0, new_remaining: 0, learning_soon: 0 },
    } )
    expect( ( await getNextReview( userId, { now: at( 0 ) } ) ).counts.due ).toBe( 1 )
  } )

  it( 'keeps the daily limit of new questions per user', async () => {
    await vault.clone( 'other' )
    const other = createTestUser( { vault_dir: 'other' } ).id
    const id = addQuestion( userId, noteId( GENERICS ), { position: 1 } )

    setSetting( other, 'melete_learning_root', 'Learning' )
    reviewNew( id, iso( -10 ) )
    updateSubject( userId, subjectId( 'TypeScript' ), { new_per_day: 1 } )

    const mine = await getNextReview( userId, { now: at( 0 ) } )
    const theirs = await getNextReview( other, { now: at( 0 ) } )

    expect( mine.counts.new_remaining ).toBe( 0 )
    expect( theirs.counts.new_remaining ).toBe( 0 )
    expect( theirs.item ).toBeNull()
  } )
} )
