// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import {
  meleteNoteResponseFixture,
  meleteQuestionFixture,
  meleteSubjectFixture,
  meleteSubjectResponseFixture,
  meleteTodayFixture,
  NOTE_ID,
  QUESTION_ID,
  SUBJECT_ID,
} from '../test-support/melete.fixture'
import {
  dropQuestion,
  enrollSubject,
  getMeleteNote,
  getMeleteSubject,
  getMeleteToday,
  getNextReview,
  gradeAnswer,
  recordReview,
  applyOffSyllabusAction,
  regenerateNote,
  retryGeneration,
  setNoteConcepts,
  setNoteEnrolled,
  updateMeleteSubject,
} from './melete.api'

const fetchMock = vi.fn()
const EMPTY_JSON = { headers: { 'Content-Type': 'application/json' }, body: '{}' }

const json = ( body: unknown, status = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

const jsonInit = ( method: string, body: unknown ): RequestInit => {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  }
}

const counts = { due: 3, new_remaining: 2, learning_soon: 0 }

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'melete api reads', () => {
  it( 'gets Today', async () => {
    fetchMock.mockResolvedValue( json( meleteTodayFixture() ) )

    await expect( getMeleteToday() ).resolves.toEqual( meleteTodayFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/melete/today', undefined )
  } )

  it( 'gets a subject, a note and rejects a response of the wrong shape', async () => {
    fetchMock.mockResolvedValueOnce( json( meleteSubjectResponseFixture() ) )
    await expect( getMeleteSubject( SUBJECT_ID ) ).resolves.toEqual(
      meleteSubjectResponseFixture(),
    )
    expect( fetchMock ).toHaveBeenCalledWith( `/api/melete/subjects/${ SUBJECT_ID }`, undefined )

    fetchMock.mockResolvedValueOnce( json( meleteNoteResponseFixture() ) )
    await expect( getMeleteNote( NOTE_ID ) ).resolves.toEqual( meleteNoteResponseFixture() )
    expect( fetchMock ).toHaveBeenLastCalledWith( `/api/melete/notes/${ NOTE_ID }`, undefined )

    fetchMock.mockResolvedValueOnce( json( { subject: 1 } ) )
    await expect( getMeleteSubject( SUBJECT_ID ) ).rejects.toThrow(
      'Unexpected response from the server',
    )
  } )

  it( 'throws the server message on an error', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Choose a learning root first' }, 409 ) )

    await expect( getMeleteSubject( SUBJECT_ID ) ).rejects.toThrow( 'Choose a learning root first' )
  } )

  it( 'gets the next review for everything or one subject', async () => {
    fetchMock.mockImplementation( () => Promise.resolve( json( { item: null, counts } ) ) )

    await expect( getNextReview( null ) ).resolves.toEqual( { item: null, counts } )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/melete/review/next', undefined )

    await getNextReview( SUBJECT_ID )
    expect( fetchMock ).toHaveBeenLastCalledWith(
      `/api/melete/review/next?subject=${ SUBJECT_ID }`,
      undefined,
    )
  } )
} )

describe( 'melete api changes', () => {
  it( 'updates a subject and returns it', async () => {
    const subject = meleteSubjectFixture( { auto_enroll: true } )
    fetchMock.mockResolvedValue( json( { subject } ) )

    await expect( updateMeleteSubject( SUBJECT_ID, { auto_enroll: true } ) ).resolves.toEqual(
      subject,
    )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/melete/subjects/${ SUBJECT_ID }`,
      jsonInit( 'PATCH', { auto_enroll: true } ),
    )
  } )

  it( 'enrolls a subject and a note', async () => {
    fetchMock.mockResolvedValueOnce( json( meleteSubjectResponseFixture() ) )
    await enrollSubject( SUBJECT_ID, true )
    expect( fetchMock ).toHaveBeenLastCalledWith(
      `/api/melete/subjects/${ SUBJECT_ID }/enrollment`,
      jsonInit( 'POST', { enrolled: true } ),
    )

    fetchMock.mockResolvedValueOnce( json( meleteNoteResponseFixture() ) )
    await setNoteEnrolled( NOTE_ID, false )
    expect( fetchMock ).toHaveBeenLastCalledWith(
      `/api/melete/notes/${ NOTE_ID }`,
      jsonInit( 'PATCH', { enrolled: false } ),
    )
  } )

  it( 'regenerates and retries a note', async () => {
    fetchMock.mockImplementation(
      () => Promise.resolve( json( meleteNoteResponseFixture(), 202 ) ),
    )

    await regenerateNote( NOTE_ID )
    expect( fetchMock ).toHaveBeenLastCalledWith(
      `/api/melete/notes/${ NOTE_ID }/regenerate`,
      { method: 'POST', ...EMPTY_JSON },
    )

    await retryGeneration( NOTE_ID )
    expect( fetchMock ).toHaveBeenLastCalledWith(
      `/api/melete/notes/${ NOTE_ID }/retry`,
      { method: 'POST', ...EMPTY_JSON },
    )
  } )

  it( 'puts a hand mapping and returns the note', async () => {
    fetchMock.mockResolvedValue( json( meleteNoteResponseFixture() ) )

    await expect( setNoteConcepts( NOTE_ID, [ SUBJECT_ID ] ) ).resolves
      .toEqual( meleteNoteResponseFixture() )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/melete/notes/${ NOTE_ID }/concepts`,
      jsonInit( 'PUT', { concept_ids: [ SUBJECT_ID ] } ),
    )
  } )

  it( 'posts an off-syllabus action and returns the note', async () => {
    fetchMock.mockImplementation( () => Promise.resolve( json( meleteNoteResponseFixture() ) ) )

    await applyOffSyllabusAction( NOTE_ID, { action: 'dismiss' } )
    expect( fetchMock ).toHaveBeenLastCalledWith(
      `/api/melete/notes/${ NOTE_ID }/off-syllabus`,
      jsonInit( 'POST', { action: 'dismiss' } ),
    )

    await applyOffSyllabusAction( NOTE_ID, { action: 'add_concept', section_id: SUBJECT_ID } )
    expect( fetchMock ).toHaveBeenLastCalledWith(
      `/api/melete/notes/${ NOTE_ID }/off-syllabus`,
      jsonInit( 'POST', { action: 'add_concept', section_id: SUBJECT_ID } ),
    )
  } )

  it( 'drops a question and returns it', async () => {
    const question = meleteQuestionFixture( { state: 'dropped' } )
    fetchMock.mockResolvedValue( json( { question } ) )

    await expect( dropQuestion( QUESTION_ID ) ).resolves.toEqual( question )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/melete/questions/${ QUESTION_ID }/drop`,
      { method: 'POST', ...EMPTY_JSON },
    )
  } )

  it( 'grades an answer', async () => {
    fetchMock.mockResolvedValue( json( { outcome: 'skipped', reason: 'blank' } ) )

    await expect( gradeAnswer( QUESTION_ID, { answer: '' } ) ).resolves.toEqual(
      { outcome: 'skipped', reason: 'blank' },
    )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/melete/questions/${ QUESTION_ID }/grade`,
      jsonInit( 'POST', { answer: '' } ),
    )
  } )

  it( 'records a review', async () => {
    const response = { question: meleteQuestionFixture(), counts }
    fetchMock.mockResolvedValue( json( response ) )
    const body = { rating: 'good', mode: 'quick' } as const

    await expect( recordReview( QUESTION_ID, body ) ).resolves.toEqual( response )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/melete/questions/${ QUESTION_ID }/review`,
      jsonInit( 'POST', body ),
    )
  } )
} )
