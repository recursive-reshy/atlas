// Testing Library
import { act } from '@testing-library/react'
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
import { ApiError } from '../lib/apiError'
import { getMeleteSubject } from '../api/melete.api'
import {
  meleteNoteFixture,
  meleteSubjectFixture,
  meleteSubjectResponseFixture,
  SUBJECT_ID,
} from '../test-support/melete.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { POLL_INTERVAL_MS } from './useJob'
import { useMeleteSubject } from './useMeleteSubject'

vi.mock( '../api/melete.api' )

const mockedGet = vi.mocked( getMeleteSubject )

const advance = async ( milliseconds: number ): Promise< void > => {
  await act( async () => {
    await vi.advanceTimersByTimeAsync( milliseconds )
  } )
}

const withGeneration = ( generation: 'idle' | 'queued' | 'generating' | 'failed' ) => {
  return meleteSubjectResponseFixture( { notes: [ meleteNoteFixture( { generation } ) ] } )
}

beforeEach( () => {
  vi.useFakeTimers()
  mockedGet.mockReset()
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'useMeleteSubject', () => {
  it( 'returns the subject and its notes', async () => {
    mockedGet.mockResolvedValue( withGeneration( 'idle' ) )
    const { result } = renderHookWithClient( () => useMeleteSubject( SUBJECT_ID ) )

    expect( result.current ).toMatchObject( { subject: null, notes: [], isLoading: true } )

    await advance( 0 )
    expect( mockedGet ).toHaveBeenCalledWith( SUBJECT_ID )
    expect( result.current ).toMatchObject( {
      subject: withGeneration( 'idle' ).subject,
      notes: withGeneration( 'idle' ).notes,
      isLoading: false,
      error: null,
    } )
  } )

  it.each( [ 'queued', 'generating' ] as const )(
    'polls while a note is %s and stops once none is',
    async ( generation ) => {
      mockedGet
        .mockResolvedValueOnce( withGeneration( generation ) )
        .mockResolvedValueOnce( withGeneration( generation ) )
        .mockResolvedValue( withGeneration( 'idle' ) )
      renderHookWithClient( () => useMeleteSubject( SUBJECT_ID ) )

      await advance( 0 )
      await advance( POLL_INTERVAL_MS )
      await advance( POLL_INTERVAL_MS )
      expect( mockedGet ).toHaveBeenCalledTimes( 3 )

      await advance( 10_000 )
      expect( mockedGet ).toHaveBeenCalledTimes( 3 )
    },
  )

  it( 'does not poll when a note failed', async () => {
    mockedGet.mockResolvedValue( withGeneration( 'failed' ) )
    renderHookWithClient( () => useMeleteSubject( SUBJECT_ID ) )

    await advance( 10_000 )

    expect( mockedGet ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'reports an error', async () => {
    mockedGet.mockRejectedValue( new ApiError( 'Choose a learning root first', 409 ) )
    const { result } = renderHookWithClient( () => useMeleteSubject( SUBJECT_ID ) )

    await advance( 0 )

    expect( result.current.error ).toBe( 'Choose a learning root first' )
  } )

  it( 'polls while the syllabus is being drafted and stops once it is done', async () => {
    const drafting = meleteSubjectResponseFixture( {
      subject: meleteSubjectFixture( { syllabus_status: 'drafting' } ),
    } )
    const done = meleteSubjectResponseFixture( {
      subject: meleteSubjectFixture( { syllabus_status: 'draft' } ),
    } )

    mockedGet
      .mockResolvedValueOnce( drafting )
      .mockResolvedValueOnce( drafting )
      .mockResolvedValue( done )
    renderHookWithClient( () => useMeleteSubject( SUBJECT_ID ) )

    await advance( 0 )
    await advance( POLL_INTERVAL_MS )
    await advance( POLL_INTERVAL_MS )
    expect( mockedGet ).toHaveBeenCalledTimes( 3 )

    await advance( 10_000 )
    expect( mockedGet ).toHaveBeenCalledTimes( 3 )
  } )
} )
