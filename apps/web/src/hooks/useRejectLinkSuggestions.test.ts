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
import { rejectLinkSuggestions } from '../api/linkSuggestions.api'
import { jobFixture } from '../test-support/job.fixture'
import { linkSuggestionFixture, SUGGESTION_ID } from '../test-support/linkSuggestion.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { jobKeys, linkSuggestionKeys } from '../lib/queryKeys'
import { useRejectLinkSuggestions } from './useRejectLinkSuggestions'

vi.mock( '../api/linkSuggestions.api' )

const mockedReject = vi.mocked( rejectLinkSuggestions )
const before = jobFixture( { status: 'ready_for_review' } )
const pending = [ linkSuggestionFixture() ]
const body = { ids: [ SUGGESTION_ID ] }

beforeEach( () => {
  mockedReject.mockReset()
} )

describe( 'useRejectLinkSuggestions', () => {
  it( 'puts the returned job and suggestions in the cache', async () => {
    const rejected = [ linkSuggestionFixture( { status: 'rejected' } ) ]
    const job = jobFixture( { status: 'ready_for_review', updated_at: '2026-10-16T10:00:00.000Z' } )
    mockedReject.mockResolvedValue( { job, suggestions: rejected } )
    const { result, queryClient } = renderHookWithClient(
      () => useRejectLinkSuggestions( before.id ),
    )
    queryClient.setQueryData( jobKeys.detail( before.id ), before )
    queryClient.setQueryData( linkSuggestionKeys.list( before.id ), pending )

    act( () => result.current.mutate( body ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( mockedReject ).toHaveBeenCalledWith( before.id, body )
    expect( queryClient.getQueryData( jobKeys.detail( before.id ) ) ).toEqual( job )
    expect( queryClient.getQueryData( linkSuggestionKeys.list( before.id ) ) ).toEqual( rejected )
  } )

  it( 'keeps both caches and reports the error', async () => {
    mockedReject.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result, queryClient } = renderHookWithClient(
      () => useRejectLinkSuggestions( before.id ),
    )
    queryClient.setQueryData( jobKeys.detail( before.id ), before )
    queryClient.setQueryData( linkSuggestionKeys.list( before.id ), pending )

    act( () => result.current.mutate( body ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Could not reach the server' )
    expect( queryClient.getQueryData( jobKeys.detail( before.id ) ) ).toEqual( before )
    expect( queryClient.getQueryData( linkSuggestionKeys.list( before.id ) ) ).toEqual( pending )
  } )
} )
