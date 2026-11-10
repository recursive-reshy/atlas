// Packages
import type { QueryClient } from '@tanstack/react-query'
// Testing Library
import { act } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ApiError } from '#src/lib/apiError'
import * as api from '../api/melete.api'
import {
  meleteNoteFixture,
  meleteNoteResponseFixture,
  meleteQuestionFixture,
  meleteSubjectFixture,
  meleteSubjectResponseFixture,
  NOTE_ID,
  QUESTION_ID,
  SUBJECT_ID,
} from '../fixtures/melete.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import {
  useDropQuestion,
  useEnrollSubject,
  useGradeAnswer,
  useRecordReview,
  useRegenerateNote,
  useRetryGeneration,
  useSetNoteEnrolled,
  useUpdateSubject,
} from './useMeleteMutations'
import { meleteKeys } from '#src/lib/queryKeys'

vi.mock( '../api/melete.api' )

const counts = { due: 1, new_remaining: 1, learning_soon: 0 }

const seed = ( queryClient: QueryClient ): void => {
  queryClient.setQueryData( meleteKeys.subject( SUBJECT_ID ), meleteSubjectResponseFixture() )
  queryClient.setQueryData( meleteKeys.note( NOTE_ID ), meleteNoteResponseFixture() )
}

const setup = < Result >( hook: () => Result ) => {
  const rendered = renderHookWithClient( hook )
  seed( rendered.queryClient )
  const invalidate = vi.spyOn( rendered.queryClient, 'invalidateQueries' )

  return { ...rendered, invalidate }
}

beforeEach( () => {
  vi.resetAllMocks()
} )

describe( 'subject mutations', () => {
  it( 'enrolls a subject, stores the response and refreshes Today', async () => {
    const response = meleteSubjectResponseFixture( {
      subject: meleteSubjectFixture( { enrolled_count: 8 } ),
    } )
    vi.mocked( api.enrollSubject ).mockResolvedValue( response )
    const { result, queryClient, invalidate } = setup( () => useEnrollSubject() )

    act( () => result.current.mutate( { id: SUBJECT_ID, enrolled: true } ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( api.enrollSubject ).toHaveBeenCalledWith( SUBJECT_ID, true )
    expect( queryClient.getQueryData( meleteKeys.subject( SUBJECT_ID ) ) ).toEqual( response )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.today } )
  } )

  it( 'updates a subject in place and refreshes Today', async () => {
    const subject = meleteSubjectFixture( { auto_enroll: true } )
    vi.mocked( api.updateMeleteSubject ).mockResolvedValue( subject )
    const { result, queryClient, invalidate } = setup( () => useUpdateSubject() )

    act( () => result.current.mutate( { id: SUBJECT_ID, body: { auto_enroll: true } } ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( api.updateMeleteSubject ).toHaveBeenCalledWith( SUBJECT_ID, { auto_enroll: true } )
    expect( queryClient.getQueryData( meleteKeys.subject( SUBJECT_ID ) ) ).toEqual(
      meleteSubjectResponseFixture( { subject } ),
    )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.today } )
  } )

  it( 'exposes the error of a failed change', async () => {
    vi.mocked( api.enrollSubject ).mockRejectedValue( new ApiError( 'Subject not found', 404 ) )
    const { result } = setup( () => useEnrollSubject() )

    act( () => result.current.mutate( { id: SUBJECT_ID, enrolled: true } ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Subject not found' )
  } )
} )

describe( 'note mutations', () => {
  const queued = meleteNoteResponseFixture( {
    note: meleteNoteFixture( { generation: 'queued' } ),
  } )

  const expectHandled = (
    queryClient: QueryClient,
    invalidate: ReturnType< typeof vi.spyOn >,
  ): void => {
    expect( queryClient.getQueryData( meleteKeys.note( NOTE_ID ) ) ).toEqual( queued )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.subject( SUBJECT_ID ) } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.today } )
  }

  it( 'enrolls a note, stores the response and refreshes its subject and Today', async () => {
    vi.mocked( api.setNoteEnrolled ).mockResolvedValue( queued )
    const { result, queryClient, invalidate } = setup( () => useSetNoteEnrolled() )

    act( () => result.current.mutate( { id: NOTE_ID, enrolled: true } ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( api.setNoteEnrolled ).toHaveBeenCalledWith( NOTE_ID, true )
    expectHandled( queryClient, invalidate )
  } )

  it( 'regenerates a note, stores the response and refreshes its subject and Today', async () => {
    vi.mocked( api.regenerateNote ).mockResolvedValue( queued )
    const { result, queryClient, invalidate } = setup( () => useRegenerateNote() )

    act( () => result.current.mutate( NOTE_ID ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( api.regenerateNote ).toHaveBeenCalledWith( NOTE_ID )
    expectHandled( queryClient, invalidate )
  } )

  it( 'retries a note, stores the response and refreshes its subject and Today', async () => {
    vi.mocked( api.retryGeneration ).mockResolvedValue( queued )
    const { result, queryClient, invalidate } = setup( () => useRetryGeneration() )

    act( () => result.current.mutate( NOTE_ID ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( api.retryGeneration ).toHaveBeenCalledWith( NOTE_ID )
    expectHandled( queryClient, invalidate )
  } )

  it( 'drops a question in the cached note and refreshes the module', async () => {
    const dropped = meleteQuestionFixture( { state: 'dropped' } )
    vi.mocked( api.dropQuestion ).mockResolvedValue( dropped )
    const { result, queryClient, invalidate } = setup( () => useDropQuestion() )

    act( () => result.current.mutate( QUESTION_ID ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( api.dropQuestion ).toHaveBeenCalledWith( QUESTION_ID )
    expect( queryClient.getQueryData( meleteKeys.note( NOTE_ID ) ) ).toEqual(
      meleteNoteResponseFixture( { questions: [ dropped ] } ),
    )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.all } )
  } )
} )

describe( 'review mutations', () => {
  it( 'grades an answer without touching the caches', async () => {
    const response = { outcome: 'skipped', reason: 'blank' } as const
    vi.mocked( api.gradeAnswer ).mockResolvedValue( response )
    const { result, invalidate } = setup( () => useGradeAnswer() )

    act( () => result.current.mutate( { questionId: QUESTION_ID, body: { answer: '' } } ) )

    await vi.waitFor( () => expect( result.current.data ).toEqual( response ) )
    expect( api.gradeAnswer ).toHaveBeenCalledWith( QUESTION_ID, { answer: '' } )
    expect( invalidate ).not.toHaveBeenCalled()
  } )

  it( 'records a review and refreshes the module', async () => {
    vi.mocked( api.recordReview ).mockResolvedValue( {
      question: meleteQuestionFixture( { reps: 1 } ),
      counts,
    } )
    const { result, invalidate } = setup( () => useRecordReview() )
    const body = { rating: 'good', mode: 'quick' } as const

    act( () => result.current.mutate( { questionId: QUESTION_ID, body } ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( api.recordReview ).toHaveBeenCalledWith( QUESTION_ID, body )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.all } )
  } )
} )
