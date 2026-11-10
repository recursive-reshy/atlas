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
import { regenerateSummary } from '../api/jobs.api'
import { jobFixture } from '../fixtures/job.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { jobKeys } from '#src/lib/queryKeys'
import { useRegenerateSummary } from './useRegenerateSummary'

vi.mock( '../api/jobs.api' )

const mockedRegenerate = vi.mocked( regenerateSummary )
const reviewing = jobFixture( { status: 'ready_for_review' } )

beforeEach( () => {
  mockedRegenerate.mockReset()
} )

describe( 'useRegenerateSummary', () => {
  it( 'puts the summarizing job in the cache and refreshes the list', async () => {
    const summarizing = jobFixture( { status: 'summarizing', expires_at: null } )
    mockedRegenerate.mockResolvedValue( summarizing )
    const { result, queryClient } = renderHookWithClient(
      () => useRegenerateSummary( reviewing.id ),
    )
    queryClient.setQueryData( jobKeys.detail( reviewing.id ), reviewing )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    act( () => result.current.mutate( { model: 'claude-opus-5-5' } ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( mockedRegenerate ).toHaveBeenCalledWith( reviewing.id, { model: 'claude-opus-5-5' } )
    expect( queryClient.getQueryData( jobKeys.detail( reviewing.id ) ) ).toEqual( summarizing )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: jobKeys.all, exact: true } )
  } )

  it( 'keeps the job and reports the error', async () => {
    mockedRegenerate.mockRejectedValue( new ApiError( 'Unknown model: x', 400 ) )
    const { result, queryClient } = renderHookWithClient(
      () => useRegenerateSummary( reviewing.id ),
    )
    queryClient.setQueryData( jobKeys.detail( reviewing.id ), reviewing )

    act( () => result.current.mutate( { model: 'x' } ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Unknown model: x' )
    expect( queryClient.getQueryData( jobKeys.detail( reviewing.id ) ) ).toEqual( reviewing )
  } )
} )
