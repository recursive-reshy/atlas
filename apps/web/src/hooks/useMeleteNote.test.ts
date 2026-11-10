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
import { getMeleteNote } from '../api/melete.api'
import {
  meleteNoteFixture,
  meleteNoteResponseFixture,
  NOTE_ID,
} from '../test-support/melete.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { POLL_INTERVAL_MS } from '../features/jobs/hooks/useJob'
import { useMeleteNote } from './useMeleteNote'

vi.mock( '../api/melete.api' )

const mockedGet = vi.mocked( getMeleteNote )

const advance = async ( milliseconds: number ): Promise< void > => {
  await act( async () => {
    await vi.advanceTimersByTimeAsync( milliseconds )
  } )
}

const withGeneration = ( generation: 'idle' | 'queued' | 'generating' | 'failed' ) => {
  return meleteNoteResponseFixture( { note: meleteNoteFixture( { generation } ) } )
}

beforeEach( () => {
  vi.useFakeTimers()
  mockedGet.mockReset()
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'useMeleteNote', () => {
  it( 'returns the note and its questions', async () => {
    const response = meleteNoteResponseFixture( { obsidian_url: 'obsidian://open?vault=B&file=N' } )
    mockedGet.mockResolvedValue( response )
    const { result } = renderHookWithClient( () => useMeleteNote( NOTE_ID ) )

    expect( result.current ).toMatchObject( {
      note: null,
      questions: [],
      obsidianUrl: null,
      isLoading: true,
    } )

    await advance( 0 )
    expect( mockedGet ).toHaveBeenCalledWith( NOTE_ID )
    expect( result.current ).toMatchObject( {
      note: response.note,
      questions: response.questions,
      obsidianUrl: 'obsidian://open?vault=B&file=N',
      isLoading: false,
      error: null,
    } )
  } )

  it( 'polls while the note is generating and stops afterwards', async () => {
    mockedGet
      .mockResolvedValueOnce( withGeneration( 'queued' ) )
      .mockResolvedValueOnce( withGeneration( 'generating' ) )
      .mockResolvedValue( withGeneration( 'idle' ) )
    renderHookWithClient( () => useMeleteNote( NOTE_ID ) )

    await advance( 0 )
    await advance( POLL_INTERVAL_MS )
    await advance( POLL_INTERVAL_MS )
    await advance( 10_000 )

    expect( mockedGet ).toHaveBeenCalledTimes( 3 )
  } )

  it( 'reports an error', async () => {
    mockedGet.mockRejectedValue( new ApiError( 'Note not found', 404 ) )
    const { result } = renderHookWithClient( () => useMeleteNote( NOTE_ID ) )

    await advance( 0 )

    expect( result.current.error ).toBe( 'Note not found' )
  } )
} )
