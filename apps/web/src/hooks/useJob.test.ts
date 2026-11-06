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
// Shared
import type { Job } from '@atlas/shared'
// App
import { ApiError } from '../api/apiError'
import { getJob } from '../api/jobs.api'
import { jobFixture } from '../test-support/job.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { POLL_INTERVAL_MS, useJob } from './useJob'

vi.mock( '../api/jobs.api' )

const mockedGetJob = vi.mocked( getJob )
const noJob = { job: null, error: null }

interface Deferred {
  promise: Promise< Job >
  resolve: ( job: Job ) => void
}

const deferred = (): Deferred => {
  let resolve: ( job: Job ) => void = () => undefined
  const promise = new Promise< Job >( ( resolver ) => {
    resolve = resolver
  } )

  return { promise, resolve }
}

const advance = async ( milliseconds: number ): Promise< void > => {
  await act( async () => {
    await vi.advanceTimersByTimeAsync( milliseconds )
  } )
}

beforeEach( () => {
  vi.useFakeTimers()
  mockedGetJob.mockReset()
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'useJob', () => {
  it( 'does nothing without a job id', async () => {
    const { result } = renderHookWithClient( () => useJob( null ) )

    await advance( 10_000 )

    expect( result.current ).toEqual( noJob )
    expect( mockedGetJob ).not.toHaveBeenCalled()
  } )

  it( 'fetches the job at once', async () => {
    mockedGetJob.mockResolvedValue( jobFixture( { status: 'queued' } ) )

    const { result } = renderHookWithClient( () => useJob( 'a' ) )
    await advance( 0 )

    expect( mockedGetJob ).toHaveBeenCalledTimes( 1 )
    expect( mockedGetJob ).toHaveBeenCalledWith( 'a' )
    expect( result.current.job?.status ).toBe( 'queued' )
  } )

  it( 'polls every interval while the job is unfinished', async () => {
    mockedGetJob
      .mockResolvedValueOnce( jobFixture( { status: 'queued' } ) )
      .mockResolvedValueOnce( jobFixture( { status: 'transcribing' } ) )
      .mockResolvedValueOnce( jobFixture( { status: 'transcribing' } ) )

    const { result } = renderHookWithClient( () => useJob( 'a' ) )
    await advance( 0 )
    expect( result.current.job?.status ).toBe( 'queued' )

    await advance( POLL_INTERVAL_MS )
    expect( result.current.job?.status ).toBe( 'transcribing' )

    await advance( POLL_INTERVAL_MS )
    expect( result.current.job?.status ).toBe( 'transcribing' )
    expect( mockedGetJob ).toHaveBeenCalledTimes( 3 )
  } )

  it.each< Job[ 'status' ] >( [
    'ready_for_review',
    'summary_failed',
    'saved',
    'failed',
  ] )( 'stops polling at %s', async ( status ) => {
    mockedGetJob.mockResolvedValue( jobFixture( { status } ) )

    renderHookWithClient( () => useJob( 'a' ) )
    await advance( 10_000 )

    expect( mockedGetJob ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'keeps polling while summarizing', async () => {
    mockedGetJob.mockResolvedValue( jobFixture( { status: 'summarizing' } ) )

    renderHookWithClient( () => useJob( 'a' ) )
    await advance( POLL_INTERVAL_MS * 2 )

    expect( mockedGetJob ).toHaveBeenCalledTimes( 3 )
  } )

  it( 'keeps polling while linking', async () => {
    mockedGetJob.mockResolvedValue( jobFixture( { status: 'linking', link_state: 'pending' } ) )

    renderHookWithClient( () => useJob( 'a' ) )
    await advance( POLL_INTERVAL_MS * 2 )

    expect( mockedGetJob ).toHaveBeenCalledTimes( 3 )
  } )

  it( 'never overlaps requests', async () => {
    const first = deferred()
    mockedGetJob.mockReturnValueOnce( first.promise )
    mockedGetJob.mockResolvedValue( jobFixture( { status: 'transcribing' } ) )

    renderHookWithClient( () => useJob( 'a' ) )
    await advance( 10_000 )
    expect( mockedGetJob ).toHaveBeenCalledTimes( 1 )

    first.resolve( jobFixture( { status: 'queued' } ) )
    await advance( POLL_INTERVAL_MS - 1 )
    expect( mockedGetJob ).toHaveBeenCalledTimes( 1 )

    await advance( 1 )
    expect( mockedGetJob ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'keeps the last job on a transient error and recovers', async () => {
    mockedGetJob
      .mockResolvedValueOnce( jobFixture( { status: 'queued' } ) )
      .mockRejectedValueOnce( new ApiError( 'Could not reach the server', null ) )
      .mockResolvedValueOnce( jobFixture( { status: 'transcribing' } ) )

    const { result } = renderHookWithClient( () => useJob( 'a' ) )
    await advance( 0 )
    await advance( POLL_INTERVAL_MS )

    expect( result.current.job?.status ).toBe( 'queued' )
    expect( result.current.error ).toBe( 'Could not reach the server' )

    await advance( POLL_INTERVAL_MS )

    expect( result.current.job?.status ).toBe( 'transcribing' )
    expect( result.current.error ).toBeNull()
  } )

  it( 'uses a fallback message for a non-Error rejection and keeps polling', async () => {
    mockedGetJob
      .mockResolvedValueOnce( jobFixture( { status: 'queued' } ) )
      .mockRejectedValueOnce( 'boom' )
      .mockResolvedValueOnce( jobFixture( { status: 'transcribing' } ) )

    const { result } = renderHookWithClient( () => useJob( 'a' ) )
    await advance( 0 )
    await advance( POLL_INTERVAL_MS )

    expect( result.current.job?.status ).toBe( 'queued' )
    expect( result.current.error ).toBe( 'Unexpected error' )

    await advance( POLL_INTERVAL_MS )

    expect( result.current.job?.status ).toBe( 'transcribing' )
    expect( result.current.error ).toBeNull()
  } )

  it( 'stops on a 404', async () => {
    mockedGetJob.mockRejectedValue( new ApiError( 'Job not found', 404 ) )

    const { result } = renderHookWithClient( () => useJob( 'a' ) )
    await advance( 10_000 )

    expect( result.current ).toEqual( {
      job: null,
      error: 'This job no longer exists. The server may have restarted.',
    } )
    expect( mockedGetJob ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'ignores a late response for an old id', async () => {
    const jobA = deferred()
    mockedGetJob.mockReturnValueOnce( jobA.promise )
    mockedGetJob.mockResolvedValue( jobFixture( { id: 'b', status: 'ready_for_review' } ) )

    const { result, rerender } = renderHookWithClient( ( { id } ) => useJob( id ), {
      initialProps: { id: 'a' },
    } )
    rerender( { id: 'b' } )
    expect( result.current ).toEqual( noJob )

    await advance( 0 )
    expect( result.current.job?.id ).toBe( 'b' )

    jobA.resolve( jobFixture( { id: 'a', status: 'ready_for_review' } ) )
    await advance( 10_000 )

    expect( result.current.job?.id ).toBe( 'b' )
    expect( mockedGetJob ).toHaveBeenCalledTimes( 2 )
    expect( mockedGetJob.mock.calls.filter( ( [ id ] ) => id === 'a' ) ).toHaveLength( 1 )
  } )

  it( 'stops when the id becomes null', async () => {
    mockedGetJob.mockResolvedValue( jobFixture( { status: 'queued' } ) )

    const initialProps: { id: string | null } = { id: 'a' }
    const { result, rerender } = renderHookWithClient(
      ( { id } ) => useJob( id ),
      { initialProps },
    )
    await advance( 0 )
    rerender( { id: null } )
    await advance( 10_000 )

    expect( result.current ).toEqual( noJob )
    expect( mockedGetJob ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'stops on unmount without warnings', async () => {
    const consoleError = vi.spyOn( console, 'error' ).mockImplementation( () => undefined )
    const pending = deferred()
    mockedGetJob.mockReturnValueOnce( pending.promise )

    const { unmount } = renderHookWithClient( () => useJob( 'a' ) )
    unmount()
    pending.resolve( jobFixture( { status: 'queued' } ) )
    await advance( 10_000 )

    expect( mockedGetJob ).toHaveBeenCalledTimes( 1 )
    expect( consoleError ).not.toHaveBeenCalled()
  } )

  it( 'shares one request between components watching the same job', async () => {
    mockedGetJob.mockResolvedValue( jobFixture( { status: 'queued' } ) )

    const { result } = renderHookWithClient( () => ( {
      first: useJob( 'a' ),
      second: useJob( 'a' ),
    } ) )
    await advance( 0 )

    expect( mockedGetJob ).toHaveBeenCalledTimes( 1 )
    expect( result.current.first.job?.status ).toBe( 'queued' )
    expect( result.current.second.job?.status ).toBe( 'queued' )
  } )

  it( 'gives a new observer the cached job straight away', async () => {
    mockedGetJob.mockResolvedValue( jobFixture( { status: 'transcribing' } ) )
    const first = renderHookWithClient( () => useJob( 'a' ) )
    await advance( 0 )

    const second = renderHookWithClient( () => useJob( 'a' ), {
      queryClient: first.queryClient,
    } )

    expect( second.result.current.job?.status ).toBe( 'transcribing' )
  } )
} )
