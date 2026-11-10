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
import { submitPastedText } from '../api/jobs.api'
import { jobFixture } from '../test-support/job.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { jobKeys } from '../lib/queryKeys'
import { useSubmitPastedText } from './useSubmitPastedText'

vi.mock( '../api/jobs.api' )

const mockedSubmit = vi.mocked( submitPastedText )
const failed = jobFixture( { status: 'failed', source_type: 'article', error: 'Paywalled' } )
const body = { text: 'x'.repeat( 300 ), title: 'T' }

beforeEach( () => {
  mockedSubmit.mockReset()
} )

describe( 'useSubmitPastedText', () => {
  it( 'sends the text for the job, stores the returned job and refreshes the list', async () => {
    const summarizing = jobFixture( { status: 'summarizing', source_type: 'article', error: null } )
    mockedSubmit.mockResolvedValue( summarizing )
    const { result, queryClient } = renderHookWithClient( () => useSubmitPastedText( failed.id ) )
    queryClient.setQueryData( jobKeys.detail( failed.id ), failed )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    act( () => result.current.mutate( body ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( mockedSubmit ).toHaveBeenCalledWith( failed.id, body )
    expect( queryClient.getQueryData( jobKeys.detail( failed.id ) ) ).toEqual( summarizing )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: jobKeys.all, exact: true } )
  } )

  it( 'keeps the failed job and reports the error', async () => {
    mockedSubmit.mockRejectedValue( new ApiError( 'Invalid request', 400 ) )
    const { result, queryClient } = renderHookWithClient( () => useSubmitPastedText( failed.id ) )
    queryClient.setQueryData( jobKeys.detail( failed.id ), failed )

    act( () => result.current.mutate( body ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Invalid request' )
    expect( queryClient.getQueryData( jobKeys.detail( failed.id ) ) ).toEqual( failed )
  } )
} )
