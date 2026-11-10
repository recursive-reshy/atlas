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
import type { SourceDocument } from '@atlas/shared'
// App
import { ApiError } from '#src/lib/apiError'
import { getSource } from '../api/jobs.api'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { jobKeys } from '#src/lib/queryKeys'
import { useSource } from './useSource'

vi.mock( '../api/jobs.api' )

const mockedGetSource = vi.mocked( getSource )

const source: SourceDocument = {
  kind: 'video',
  meta: {
    title: 'A talk',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration_seconds: 60,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'large-v3-turbo',
  },
  text: 'Hello.',
}

const advance = async ( milliseconds: number ): Promise< void > => {
  await act( async () => {
    await vi.advanceTimersByTimeAsync( milliseconds )
  } )
}

beforeEach( () => {
  vi.useFakeTimers()
  mockedGetSource.mockReset()
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'useSource', () => {
  it( 'fetches the source once and never polls', async () => {
    mockedGetSource.mockResolvedValue( source )

    const { result } = renderHookWithClient( () => useSource( 'a' ) )
    expect( result.current ).toEqual( { source: null, error: null } )

    await advance( 0 )
    await advance( 60_000 )

    expect( result.current ).toEqual( { source, error: null } )
    expect( mockedGetSource ).toHaveBeenCalledExactlyOnceWith( 'a' )
  } )

  it( 'stores it under the source key', async () => {
    mockedGetSource.mockResolvedValue( source )

    const { queryClient } = renderHookWithClient( () => useSource( 'a' ) )
    await advance( 0 )

    expect( queryClient.getQueryData( jobKeys.source( 'a' ) ) ).toEqual( source )
  } )

  it( 'reports the error message', async () => {
    mockedGetSource.mockRejectedValue( new ApiError( 'Transcript not ready', 409 ) )

    const { result } = renderHookWithClient( () => useSource( 'a' ) )
    await advance( 0 )

    expect( result.current ).toEqual( { source: null, error: 'Transcript not ready' } )
  } )

  it( 'does nothing without an id', async () => {
    renderHookWithClient( () => useSource( null ) )
    await advance( 1000 )

    expect( mockedGetSource ).not.toHaveBeenCalled()
  } )
} )
