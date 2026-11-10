// Packages
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import {
  GetMeleteNoteResponse,
  GetMeleteSubjectResponse,
  GetMeleteTodayResponse,
} from '@atlas/shared'
// Errors
import { ConflictError, NotFoundError } from '../errors.js'
// Repositories
import {
  findNote,
  listNotesUnder,
  updateNote,
} from '../repositories/meleteNotes.repository.js'
import { findQuestion } from '../repositories/meleteQuestions.repository.js'
import { getDatabase } from '../repositories/database.js'
import { listConcepts, replaceSyllabus } from '../repositories/meleteConcepts.repository.js'
import { setNoteConcepts } from '../repositories/meleteNoteConcepts.repository.js'
import { insertReview } from '../repositories/meleteReviews.repository.js'
import {
  listSubjects,
  updateSubject as updateStoredSubject,
} from '../repositories/meleteSubjects.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
import { clearVaultDir } from '../repositories/users.repository.js'
// Services
import {
  dropQuestion,
  getNote,
  getSubject,
  getToday,
  regenerateNote,
  retryGeneration,
  setNoteEnrolled,
  setSubjectEnrolled,
  updateSubject,
} from './melete.service.js'
import { rememberSkipped, resetScanOutcome } from '../melete/scanOutcome.js'
import { resetScanClock, scanLearningRoot } from './meleteScan.service.js'
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
  melete: { requestRetention: 0.9, dayStartHour: 4 },
} ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )

const T0 = new Date( '2026-10-22T10:00:00.000Z' )
const at = ( seconds: number ): Date => new Date( T0.getTime() + seconds * 1000 )

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

const GENERICS = 'TypeScript/Generics.md'
const CONDITIONAL = 'TypeScript/Advanced/Conditional Types.md'
const OWNERSHIP = 'Rust/Ownership.md'

const hashOf = ( id: string ): string => findNote( userId, id )?.body_hash ?? ''

beforeEach( async () => {
  vault = await createMeleteVault()
  configMock.vaultsPath = vault.vaultsPath
  setSetting( userId, 'melete_learning_root', 'Learning' )
  resetScanClock()
  resetScanOutcome()
  await scanLearningRoot( userId, { force: true, now: at( 0 ) } )
} )

afterEach( async () => {
  await vault.cleanup()
} )

describe( 'setNoteEnrolled', () => {
  it( 'enrols a note with no questions and queues generation', () => {
    const id = noteId( GENERICS )

    const result = setNoteEnrolled( userId, id, true, at( 5 ) )

    expect( findNote( userId, id ) ).toMatchObject( {
      enrolled: true,
      enrolled_at: at( 5 ).toISOString(),
      generation: 'queued',
      generation_error: null,
    } )
    expect( GetMeleteNoteResponse.parse( result ).note ).toMatchObject( {
      enrolled: true,
      generation: 'queued',
    } )
  } )

  it( 'does not queue generation when the active questions match the current body', () => {
    const id = noteId( GENERICS )
    const questionId = addQuestion( userId, id, { hash: hashOf( id ) } )

    setNoteEnrolled( userId, id, true, at( 5 ) )

    expect( findNote( userId, id )?.generation ).toBe( 'idle' )
    expect( findQuestion( userId, questionId )?.state ).toBe( 'active' )
  } )

  it( 'retires questions made from an older body and queues generation', () => {
    const id = noteId( GENERICS )
    const old = addQuestion( userId, id, { hash: 'older' } )
    const dropped = addQuestion( userId, id, { hash: 'older', state: 'dropped', position: 2 } )

    setNoteEnrolled( userId, id, true, at( 5 ) )

    expect( findNote( userId, id )?.generation ).toBe( 'queued' )
    expect( findQuestion( userId, old )?.state ).toBe( 'retired' )
    expect( findQuestion( userId, dropped )?.state ).toBe( 'dropped' )
  } )

  it( 'leaves a note that is already generating alone', () => {
    const id = noteId( GENERICS )
    updateNote( userId, id, { generation: 'generating' } )

    setNoteEnrolled( userId, id, true, at( 5 ) )

    expect( findNote( userId, id )?.generation ).toBe( 'generating' )
  } )

  it( 'does nothing when the note is already enrolled', () => {
    const id = noteId( GENERICS )
    setNoteEnrolled( userId, id, true, at( 5 ) )

    setNoteEnrolled( userId, id, true, at( 60 ) )

    expect( findNote( userId, id )?.enrolled_at ).toBe( at( 5 ).toISOString() )
  } )

  it( 'keeps questions and the enrolment time when unenrolling', () => {
    const id = noteId( GENERICS )
    setNoteEnrolled( userId, id, true, at( 5 ) )
    updateNote( userId, id, { generation: 'idle' } )
    const questionId = addQuestion( userId, id, { hash: hashOf( id ) } )

    const { note } = setNoteEnrolled( userId, id, false, at( 10 ) )

    expect( note.enrolled ).toBe( false )
    expect( findNote( userId, id )?.enrolled_at ).toBe( at( 5 ).toISOString() )
    expect( findQuestion( userId, questionId )?.state ).toBe( 'active' )
  } )

  it( 'takes a queued note out of the queue when unenrolling', () => {
    const id = noteId( GENERICS )
    setNoteEnrolled( userId, id, true, at( 5 ) )

    setNoteEnrolled( userId, id, false, at( 10 ) )

    expect( findNote( userId, id )?.generation ).toBe( 'idle' )
  } )

  it( 'refuses an unknown note and a note missing from the vault', async () => {
    expect( () => setNoteEnrolled( userId, crypto.randomUUID(), true, at( 5 ) ) )
      .toThrow( NotFoundError )

    const id = noteId( OWNERSHIP )
    await vault.remove( 'Learning/Rust/Ownership.md' )
    await scanLearningRoot( userId, { force: true, now: at( 1 ) } )

    expect( () => setNoteEnrolled( userId, id, true, at( 5 ) ) ).toThrow( ConflictError )
  } )
} )

describe( 'setSubjectEnrolled', () => {
  it( 'enrols every live note of the subject and no others', async () => {
    const result = await setSubjectEnrolled( userId, subjectId( 'TypeScript' ), true, at( 5 ) )

    expect( GetMeleteSubjectResponse.parse( result ).notes.map( ( { enrolled } ) => enrolled ) )
      .toEqual( [ true, true ] )
    expect( findNote( userId, noteId( CONDITIONAL ) ) )
      .toMatchObject( { enrolled: true, generation: 'queued' } )
    expect( findNote( userId, noteId( OWNERSHIP ) )?.enrolled ).toBe( false )
    expect( result.subject.enrolled_count ).toBe( 2 )
  } )

  it( 'scans first, so a note added a moment ago is included', async () => {
    await vault.write( 'Learning/TypeScript/Fresh.md', '# Fresh\n' )

    await setSubjectEnrolled( userId, subjectId( 'TypeScript' ), true, at( 5 ) )

    expect( findNote( userId, noteId( 'TypeScript/Fresh.md' ) )?.enrolled ).toBe( true )
  } )

  it( 'skips notes that are missing from the vault', async () => {
    const id = noteId( GENERICS )
    await vault.remove( 'Learning/TypeScript/Generics.md' )

    await setSubjectEnrolled( userId, subjectId( 'TypeScript' ), true, at( 5 ) )

    expect( findNote( userId, id ) ).toMatchObject( { enrolled: false, generation: 'idle' } )
  } )

  it( 'unenrols every note', async () => {
    await setSubjectEnrolled( userId, subjectId( 'TypeScript' ), true, at( 5 ) )

    const result = await setSubjectEnrolled( userId, subjectId( 'TypeScript' ), false, at( 10 ) )

    expect( result.notes.every( ( { enrolled } ) => !enrolled ) ).toBe( true )
  } )

  it( 'refuses an unknown subject', async () => {
    await expect( setSubjectEnrolled( userId, crypto.randomUUID(), true, at( 5 ) ) )
      .rejects.toThrow( NotFoundError )
  } )
} )

describe( 'regenerateNote', () => {
  it( 'retires the active questions and queues generation', () => {
    const id = noteId( GENERICS )
    setNoteEnrolled( userId, id, true, at( 5 ) )
    updateNote( userId, id, { generation: 'idle' } )
    const questionId = addQuestion( userId, id, { hash: hashOf( id ) } )

    const result = regenerateNote( userId, id )

    expect( findQuestion( userId, questionId )?.state ).toBe( 'retired' )
    expect( result.note.generation ).toBe( 'queued' )
    expect( result.questions ).toEqual( [] )
  } )

  it.each( [ 'queued', 'generating' ] as const )( 'refuses a note that is %s', ( state ) => {
    const id = noteId( GENERICS )
    setNoteEnrolled( userId, id, true, at( 5 ) )
    updateNote( userId, id, { generation: state } )

    expect( () => regenerateNote( userId, id ) ).toThrow( ConflictError )
  } )

  it( 'refuses a note that is not enrolled and an unknown note', () => {
    expect( () => regenerateNote( userId, noteId( GENERICS ) ) ).toThrow( ConflictError )
    expect( () => regenerateNote( userId, crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )

describe( 'retryGeneration', () => {
  it( 'queues a failed note and clears the error', () => {
    const id = noteId( GENERICS )
    setNoteEnrolled( userId, id, true, at( 5 ) )
    updateNote( userId, id, { generation: 'failed', generation_error: 'Note is too long' } )

    const result = retryGeneration( userId, id )

    expect( result.note ).toMatchObject( { generation: 'queued', generation_error: null } )
  } )

  it( 'refuses a note that has not failed', () => {
    expect( () => retryGeneration( userId, noteId( GENERICS ) ) ).toThrow( ConflictError )
    expect( () => retryGeneration( userId, crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )

describe( 'dropQuestion', () => {
  it( 'drops an active question', () => {
    const questionId = addQuestion( userId, noteId( GENERICS ) )

    const question = dropQuestion( userId, questionId )

    expect( question ).toMatchObject( { id: questionId, state: 'dropped' } )
    expect( findQuestion( userId, questionId )?.state ).toBe( 'dropped' )
  } )

  it.each( [ 'dropped', 'retired' ] )( 'refuses a question that is %s', ( state ) => {
    const questionId = addQuestion( userId, noteId( GENERICS ), { state } )

    expect( () => dropQuestion( userId, questionId ) ).toThrow( ConflictError )
  } )

  it( 'refuses an unknown question', () => {
    expect( () => dropQuestion( userId, crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )

describe( 'updateSubject', () => {
  it( 'changes auto-enrol and new questions per day', () => {
    const id = subjectId( 'TypeScript' )

    const subject = updateSubject( userId, id, { auto_enroll: true, new_per_day: 3 } )

    expect( subject ).toMatchObject( { id, auto_enroll: true, new_per_day: 3 } )
    expect( updateSubject( userId, id, { new_per_day: 0 } ) )
      .toMatchObject( { auto_enroll: true, new_per_day: 0 } )
  } )

  it( 'refuses an unknown subject', () => {
    expect( () => updateSubject( userId, crypto.randomUUID(), { auto_enroll: true } ) )
      .toThrow( NotFoundError )
  } )
} )

describe( 'getToday', () => {
  it( 'says so when there is no learning root', async () => {
    setSetting( userId, 'melete_learning_root', null )

    expect( await getToday( userId, at( 1 ) ) ).toEqual( {
      learning_root: null,
      subjects: [],
      totals: { due: 0, new_remaining: 0, learning_soon: 0 },
      skipped_paths: [],
    } )
  } )

  it( 'returns the paths the last scan could not read, and none for another user', async () => {
    rememberSkipped( userId, [ 'Learning/Locked' ] )

    expect( ( await getToday( userId, at( 1 ) ) ).skipped_paths ).toEqual( [ 'Learning/Locked' ] )

    const other = createTestUser( { vault_dir: 'elsewhere' } )

    expect( ( await getToday( other.id, at( 1 ) ) ).skipped_paths ).toEqual( [] )
  } )

  it( 'has no skipped paths when there is no learning root', async () => {
    rememberSkipped( userId, [ 'Learning/Locked' ] )
    setSetting( userId, 'melete_learning_root', null )

    expect( ( await getToday( userId, at( 1 ) ) ).skipped_paths ).toEqual( [] )
  } )

  it( 'lists the subjects by name with their counts', async () => {
    const generics = noteId( GENERICS )
    const ownership = noteId( OWNERSHIP )
    await setSubjectEnrolled( userId, subjectId( 'TypeScript' ), true, at( 1 ) )
    setNoteEnrolled( userId, ownership, true, at( 1 ) )
    addQuestion( userId, generics, { fsrsState: 'review', due: at( -60 ).toISOString() } )
    addQuestion( userId, generics, { position: 2 } )
    addQuestion( userId, generics, { position: 3 } )
    addQuestion( userId, ownership, { fsrsState: 'review', due: at( 3600 ).toISOString() } )
    updateSubject( userId, subjectId( 'TypeScript' ), { new_per_day: 1 } )

    const today = GetMeleteTodayResponse.parse( await getToday( userId, at( 2 ) ) )

    expect( today.learning_root ).toBe( 'Learning' )
    expect( today.subjects.map( ( { name } ) => name ) ).toEqual( [ 'Rust', 'TypeScript' ] )
    expect( today.subjects[ 1 ] ).toMatchObject( {
      folder: 'Learning/TypeScript',
      note_count: 2,
      enrolled_count: 2,
      due_count: 1,
      new_available: 2,
      new_remaining_today: 1,
    } )
    expect( today.subjects[ 0 ] ).toMatchObject( {
      note_count: 1,
      enrolled_count: 1,
      due_count: 0,
      new_available: 0,
    } )
    expect( today.totals ).toEqual( { due: 1, new_remaining: 1, learning_soon: 0 } )
  } )

  it( 'counts what is due before the study day ends as due today', async () => {
    const generics = noteId( GENERICS )

    await setSubjectEnrolled( userId, subjectId( 'TypeScript' ), true, at( 1 ) )
    // 18:00 in Singapore: the study day ends at 04:00 tomorrow, 10 hours on
    addQuestion( userId, generics, { fsrsState: 'review', due: at( -60 ).toISOString() } )
    addQuestion( userId, generics, {
      position: 2,
      fsrsState: 'review',
      due: at( 3600 ).toISOString(),
    } )
    addQuestion( userId, generics, {
      position: 3,
      fsrsState: 'review',
      due: at( 10 * 3600 - 1 ).toISOString(),
    } )
    addQuestion( userId, generics, {
      position: 4,
      fsrsState: 'review',
      due: at( 10 * 3600 ).toISOString(),
    } )

    const { subjects } = await getToday( userId, at( 2 ) )
    const typescript = subjects.find( ( { name } ) => name === 'TypeScript' )
    const rust = subjects.find( ( { name } ) => name === 'Rust' )

    expect( typescript ).toMatchObject( { due_count: 1, due_today: 3, seconds_this_week: 0 } )
    expect( rust ).toMatchObject( { due_count: 0, due_today: 0, seconds_this_week: 0 } )
  } )

  it( 'adds up the subject\'s time in the current Monday to Sunday study week', async () => {
    const entry = ( subject: string, source: string, day: string, seconds: number ): void => {
      getDatabase().prepare( `INSERT INTO time_entries
        ( id, user_id, source, subject_id, day, seconds, created_at, updated_at )
        VALUES ( ?, ?, ?, ?, ?, ?, 'x', 'x' )` )
        .run( crypto.randomUUID(), userId, source, subject, day, seconds )
    }
    const typescript = subjectId( 'TypeScript' )

    // T0 is Thursday 2026-10-22; the week runs 10-19 to 10-25
    entry( typescript, 'measured', '2026-10-18', 100 )
    entry( typescript, 'measured', '2026-10-19', 200 )
    entry( typescript, 'logged', '2026-10-22', 1000 )
    entry( typescript, 'measured', '2026-10-25', 400 )
    entry( typescript, 'measured', '2026-10-26', 800 )
    entry( subjectId( 'Rust' ), 'measured', '2026-10-20', 50 )

    const { subjects } = await getToday( userId, at( 2 ) )

    expect( subjects.find( ( { name } ) => name === 'TypeScript' )?.seconds_this_week )
      .toBe( 1600 )
    expect( subjects.find( ( { name } ) => name === 'Rust' )?.seconds_this_week ).toBe( 50 )
  } )

  it( 'counts calendar time against the subject in the same study week (ADR 0108)', async () => {
    const typescript = subjectId( 'TypeScript' )

    getDatabase().prepare( `INSERT INTO time_entries
      ( id, user_id, source, subject_id, day, seconds, created_at, updated_at )
      VALUES ( ?, ?, 'calendar', ?, '2026-10-21', 2400, 'now', 'now' )` )
      .run( crypto.randomUUID(), userId, typescript )

    const { subjects } = await getToday( userId, at( 2 ) )

    expect( subjects.find( ( { name } ) => name === 'TypeScript' )?.seconds_this_week )
      .toBe( 2400 )
  } )

  it( 'takes the day\'s new questions already reviewed off what is remaining', async () => {
    const generics = noteId( GENERICS )
    await setSubjectEnrolled( userId, subjectId( 'TypeScript' ), true, at( 1 ) )
    const reviewed = addQuestion( userId, generics, {
      fsrsState: 'review',
      due: at( 86_400 ).toISOString(),
    } )
    addQuestion( userId, generics, { position: 2 } )
    addQuestion( userId, generics, { position: 3 } )
    insertReview( userId, {
      question_id: reviewed,
      reviewed_at: at( 1 ).toISOString(),
      mode: 'quick',
      rating: 'good',
      suggested_rating: null,
      answer: null,
      grade_run_id: null,
      was_new: true,
      before_state: '{}',
    } )
    updateSubject( userId, subjectId( 'TypeScript' ), { new_per_day: 2 } )

    const { subjects, totals } = await getToday( userId, at( 2 ) )

    expect( subjects[ 1 ] ).toMatchObject( { new_available: 2, new_remaining_today: 1 } )
    expect( totals.new_remaining ).toBe( 1 )
  } )

  it( 'counts learning questions coming up within 20 minutes', async () => {
    const generics = noteId( GENERICS )
    await setSubjectEnrolled( userId, subjectId( 'TypeScript' ), true, at( 1 ) )
    addQuestion( userId, generics, { fsrsState: 'learning', due: at( 10 * 60 ).toISOString() } )
    addQuestion( userId, generics, {
      position: 2,
      fsrsState: 'learning',
      due: at( 40 * 60 ).toISOString(),
    } )

    const { totals } = await getToday( userId, at( 2 ) )

    expect( totals ).toEqual( { due: 0, new_remaining: 0, learning_soon: 1 } )
  } )

  it( 'drops a subject whose folder is gone', async () => {
    await vault.move( 'Learning/Rust', 'Learning/Rustlang' )

    const { subjects } = await getToday( userId, at( 31 ) )

    expect( subjects.map( ( { name } ) => name ) ).toEqual( [ 'Rustlang', 'TypeScript' ] )
  } )

  it( 'counts only the notes still in the vault', async () => {
    await vault.remove( 'Learning/Rust/Ownership.md' )

    const { subjects } = await getToday( userId, at( 31 ) )

    expect( subjects.find( ( { name } ) => name === 'Rust' )?.note_count ).toBe( 0 )
  } )
} )

describe( 'getSubject', () => {
  it( 'returns the subject and its notes by path', async () => {
    const id = noteId( GENERICS )
    addQuestion( userId, id, { hash: hashOf( id ) } )
    addQuestion( userId, id, { hash: hashOf( id ), state: 'dropped', position: 2 } )

    const result = GetMeleteSubjectResponse.parse( await getSubject(
      userId,
      subjectId( 'TypeScript' ),
    ) )

    expect( result.subject.name ).toBe( 'TypeScript' )
    expect( result.notes.map( ( { path } ) => path ) ).toEqual( [
      'Learning/TypeScript/Advanced/Conditional Types.md',
      'Learning/TypeScript/Generics.md',
    ] )
    expect( result.notes[ 1 ] ).toMatchObject( {
      title: 'Generics in TypeScript',
      enrolled: false,
      generation: 'idle',
      generation_error: null,
      question_count: 1,
      stale: false,
      missing: false,
    } )
  } )

  it( 'carries each note\'s mapping state and mapped concepts', async () => {
    const id = noteId( GENERICS )
    const subject = subjectId( 'TypeScript' )

    replaceSyllabus( userId, subject, [ {
      name: 'Basics',
      concepts: [ { name: 'Generics', description: '' } ],
    } ] )

    const [ concept ] = listConcepts( userId, subject )

    setNoteConcepts( userId, id, [ concept?.id ?? '' ], 'hand' )
    updateNote( userId, id, {
      mapping: 'failed',
      mapping_error: 'Boom',
      mapping_pinned: true,
      off_syllabus: 'flagged',
      off_syllabus_suggestion: 'Decorators',
    } )

    const { notes } = await getSubject( userId, subject )

    expect( notes.find( ( note ) => note.id === id ) ).toMatchObject( {
      mapping: 'failed',
      mapping_error: 'Boom',
      mapping_pinned: true,
      off_syllabus: 'flagged',
      off_syllabus_suggestion: 'Decorators',
      concept_ids: [ concept?.id ],
    } )
    expect( notes.find( ( note ) => note.id !== id )?.concept_ids ).toEqual( [] )
  } )

  describe( 'coverage and mastery', () => {
    // Two concepts; the Generics note, enrolled, is mapped to the first, whose one question has
    // been reviewed with a stability of 10.5 days
    const mapped = () => {
      const id = subjectId( 'TypeScript' )
      const note = noteId( GENERICS )

      replaceSyllabus( userId, id, [ {
        name: 'Basics',
        concepts: [ { name: 'A', description: '' }, { name: 'B', description: '' } ],
      } ] )
      getDatabase().prepare( 'UPDATE melete_notes SET enrolled = 1 WHERE id = ?' ).run( note )

      const [ first ] = listConcepts( userId, id )

      setNoteConcepts( userId, note, [ first?.id ?? '' ], 'claude' )
      addQuestion( userId, note, { conceptId: first?.id, reps: 3, stability: 10.5 } )

      return id
    }
    it( 'is null while the syllabus is not approved', async () => {
      const id = mapped()
      const { subject } = await getSubject( userId, id )

      expect( subject ).toMatchObject( { coverage: null, mastery: null, concept_count: null } )
    } )

    it( 'is computed from the mapped notes and their questions once approved', async () => {
      const id = mapped()

      updateStoredSubject( userId, id, { syllabus_status: 'approved' } )

      const { subject } = await getSubject( userId, id )

      expect( subject.concept_count ).toBe( 2 )
      expect( subject.coverage ).toBeCloseTo( 0.5 )
      // (10.5 / 21 + 0) / 2
      expect( subject.mastery ).toBeCloseTo( 0.25 )
    } )

    it( 'follows the user\'s mastery days', async () => {
      const id = mapped()

      updateStoredSubject( userId, id, { syllabus_status: 'approved' } )
      setSetting( userId, 'melete_mastery_days', 14 )

      expect( ( await getSubject( userId, id ) ).subject.mastery ).toBeCloseTo( 0.375 )
    } )

    it( 'is null for an approved syllabus with no concepts, and shown on Today too', async () => {
      const id = subjectId( 'TypeScript' )

      updateStoredSubject( userId, id, { syllabus_status: 'approved' } )

      expect( ( await getSubject( userId, id ) ).subject )
        .toMatchObject( { coverage: null, mastery: null, concept_count: null } )

      const found = ( await getToday( userId ) ).subjects.find( ( { id: other } ) => other === id )

      expect( found ).toMatchObject( { coverage: null, mastery: null, concept_count: null } )
    } )
  } )

  it( 'marks a note stale when its questions were made from an older body', async () => {
    const id = noteId( GENERICS )
    addQuestion( userId, id, { hash: 'older' } )

    const { notes } = await getSubject( userId, subjectId( 'TypeScript' ) )

    expect( notes.find( ( note ) => note.id === id )?.stale ).toBe( true )
  } )

  it( 'marks a note missing and keeps listing it', async () => {
    const id = noteId( GENERICS )
    await vault.remove( 'Learning/TypeScript/Generics.md' )

    const { notes } = await getSubject( userId, subjectId( 'TypeScript' ), at( 31 ) )

    expect( notes.find( ( note ) => note.id === id )?.missing ).toBe( true )
  } )

  it( 'refuses an unknown subject, and a missing learning root', async () => {
    await expect( getSubject( userId, crypto.randomUUID() ) ).rejects.toThrow( NotFoundError )

    setSetting( userId, 'melete_learning_root', null )

    await expect( getSubject( userId, subjectId( 'TypeScript' ) ) )
      .rejects.toThrow( new ConflictError( 'Choose a learning root first' ) )
  } )

  it( 'refuses a subject outside the learning root', async () => {
    setSetting( userId, 'melete_learning_root', 'Inbox' )

    await expect( getSubject( userId, subjectId( 'TypeScript' ), at( 31 ) ) )
      .rejects.toThrow( NotFoundError )
  } )
} )

describe( 'getNote, Obsidian link', () => {
  it( 'opens the user\'s own vault at the note', () => {
    expect( getNote( userId, noteId( GENERICS ) ).obsidian_url ).toBe(
      'obsidian://open?vault=vault&file=Learning%2FTypeScript%2FGenerics',
    )
  } )

  it( 'gives two users with the same note path two different links', async () => {
    await vault.clone( 'My Brain' )
    const other = createTestUser( { vault_dir: 'My Brain' } ).id
    setSetting( other, 'melete_learning_root', 'Learning' )
    await scanLearningRoot( other, { force: true, now: at( 1 ) } )
    const theirs = listNotesUnder( other, 'Learning' ).find( ( note ) => {
      return note.path === `Learning/${ GENERICS }`
    } )

    expect( getNote( other, theirs?.id ?? '' ).obsidian_url ).toBe(
      'obsidian://open?vault=My%20Brain&file=Learning%2FTypeScript%2FGenerics',
    )
    expect( getNote( userId, noteId( GENERICS ) ).obsidian_url ).toBe(
      'obsidian://open?vault=vault&file=Learning%2FTypeScript%2FGenerics',
    )
  } )

  it( 'is null for a user without a vault', () => {
    const id = noteId( GENERICS )

    clearVaultDir( userId )

    expect( getNote( userId, id ).obsidian_url ).toBeNull()
  } )
} )

describe( 'getNote', () => {
  it( 'returns active and dropped questions by position, never retired ones', () => {
    const id = noteId( GENERICS )
    const second = addQuestion( userId, id, { position: 2 } )
    const first = addQuestion( userId, id, { position: 1, state: 'dropped' } )
    addQuestion( userId, id, { position: 3, state: 'retired' } )

    const result = GetMeleteNoteResponse.parse( getNote( userId, id ) )

    expect( result.questions.map( ( question ) => question.id ) ).toEqual( [ first, second ] )
    expect( result.questions[ 0 ] ).toMatchObject( {
      state: 'dropped',
      fsrs_state: 'new',
      due: null,
      reps: 0,
      lapses: 0,
      last_review: null,
    } )
    expect( result.note.question_count ).toBe( 1 )
  } )

  it( 'refuses an unknown note', () => {
    expect( () => getNote( userId, crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )
