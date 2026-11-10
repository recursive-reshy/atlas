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
import { ApiError } from '../lib/apiError'
import { retrySummary } from '../api/jobs.api'
import { jobFixture } from '../test-support/job.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { jobKeys } from '../lib/queryKeys'
import { useRetrySummary } from './useRetrySummary'

vi.mock( '../api/jobs.api' )

const mockedRetrySummary = vi.mocked( retrySummary )
const failed = jobFixture( { status: 'summary_failed', error: 'Rate limited' } )

beforeEach( () => {
  mockedRetrySummary.mockReset()
} )

describe( 'useRetrySummary', () => {
  it( 'puts the returned summarizing job in the cache and refreshes the list', async () => {
    const summarizing = jobFixture( { status: 'summarizing', error: null } )
    mockedRetrySummary.mockResolvedValue( summarizing )
    const { result, queryClient } = renderHookWithClient( () => useRetrySummary( failed.id ) )
    queryClient.setQueryData( jobKeys.detail( failed.id ), failed )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    act( () => result.current.mutate() )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( mockedRetrySummary ).toHaveBeenCalledWith( failed.id )
    expect( queryClient.getQueryData( jobKeys.detail( failed.id ) ) ).toEqual( summarizing )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: jobKeys.all, exact: true } )
  } )

  it( 'keeps the failed job and reports the error', async () => {
    mockedRetrySummary.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result, queryClient } = renderHookWithClient( () => useRetrySummary( failed.id ) )
    queryClient.setQueryData( jobKeys.detail( failed.id ), failed )

    act( () => result.current.mutate() )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Could not reach the server' )
    expect( queryClient.getQueryData( jobKeys.detail( failed.id ) ) ).toEqual( failed )
  } )
} )
