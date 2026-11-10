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
import { listJobs } from '../api/jobs.api'
import { jobFixture } from '../test-support/job.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { jobKeys } from '../lib/queryKeys'
import { FAST_POLL_MS, SLOW_POLL_MS, useJobs } from './useJobs'

vi.mock( '../api/jobs.api' )

const mockedListJobs = vi.mocked( listJobs )

const advance = async ( milliseconds: number ): Promise< void > => {
  await act( async () => {
    await vi.advanceTimersByTimeAsync( milliseconds )
  } )
}

beforeEach( () => {
  vi.useFakeTimers()
  mockedListJobs.mockReset()
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'useJobs', () => {
  it( 'fetches the list and returns it', async () => {
    mockedListJobs.mockResolvedValue( [ jobFixture() ] )

    const { result } = renderHookWithClient( () => useJobs() )
    expect( result.current ).toEqual( { jobs: null, error: null, updatedAt: 0 } )

    await advance( 0 )

    expect( result.current ).toEqual( {
      jobs: [ jobFixture() ],
      error: null,
      updatedAt: expect.any( Number ) as number,
    } )
    expect( result.current.updatedAt ).toBeGreaterThan( 0 )
  } )

  it.each( [
    'queued',
    'transcribing',
    'summarizing',
  ] as const )( 'polls fast while a job is %s', async ( status ) => {
    mockedListJobs.mockResolvedValue( [ jobFixture( { status } ) ] )

    renderHookWithClient( () => useJobs() )
    await advance( 0 )
    await advance( FAST_POLL_MS * 2 )

    expect( mockedListJobs ).toHaveBeenCalledTimes( 3 )
  } )

  it( 'polls slowly when every job is waiting for review', async () => {
    mockedListJobs.mockResolvedValue( [
      jobFixture( { status: 'ready_for_review' } ),
      jobFixture( { status: 'summary_failed' } ),
    ] )

    renderHookWithClient( () => useJobs() )
    await advance( 0 )
    await advance( FAST_POLL_MS * 5 )
    expect( mockedListJobs ).toHaveBeenCalledTimes( 1 )

    await advance( SLOW_POLL_MS - FAST_POLL_MS * 5 )
    expect( mockedListJobs ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'keeps the last list on a transient error and reports it', async () => {
    mockedListJobs
      .mockResolvedValueOnce( [ jobFixture( { status: 'queued' } ) ] )
      .mockRejectedValueOnce( new ApiError( 'Could not reach the server', null ) )

    const { result } = renderHookWithClient( () => useJobs() )
    await advance( 0 )
    await advance( FAST_POLL_MS )

    expect( result.current.jobs ).toHaveLength( 1 )
    expect( result.current.error ).toBe( 'Could not reach the server' )
  } )

  it( 'uses the shared jobs cache entry', async () => {
    mockedListJobs.mockResolvedValue( [ jobFixture() ] )

    const { queryClient } = renderHookWithClient( () => useJobs() )
    await advance( 0 )

    expect( queryClient.getQueryData( jobKeys.all ) ).toEqual( [ jobFixture() ] )
  } )
} )
