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
import { acceptLinkSuggestions } from '../api/linkSuggestions.api'
import { jobFixture } from '../test-support/job.fixture'
import { linkSuggestionFixture, SUGGESTION_ID } from '../test-support/linkSuggestion.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { jobKeys, linkSuggestionKeys } from '../lib/queryKeys'
import { useAcceptLinkSuggestions } from './useAcceptLinkSuggestions'

vi.mock( '../api/linkSuggestions.api' )

const mockedAccept = vi.mocked( acceptLinkSuggestions )
const before = jobFixture( { status: 'ready_for_review', note_markdown: 'Old\n' } )
const pending = [ linkSuggestionFixture() ]
const body = { ids: [ SUGGESTION_ID ], note_markdown: 'New\n' }

beforeEach( () => {
  mockedAccept.mockReset()
} )

describe( 'useAcceptLinkSuggestions', () => {
  it( 'puts the returned job and suggestions in the cache without refetching', async () => {
    const job = jobFixture( { status: 'ready_for_review', note_markdown: 'New\n' } )
    const accepted = [ linkSuggestionFixture( { status: 'accepted' } ) ]
    mockedAccept.mockResolvedValue( { job, suggestions: accepted } )
    const { result, queryClient } = renderHookWithClient(
      () => useAcceptLinkSuggestions( before.id ),
    )
    queryClient.setQueryData( jobKeys.detail( before.id ), before )
    queryClient.setQueryData( linkSuggestionKeys.list( before.id ), pending )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    act( () => result.current.mutate( body ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( mockedAccept ).toHaveBeenCalledWith( before.id, body )
    expect( queryClient.getQueryData( jobKeys.detail( before.id ) ) ).toEqual( job )
    expect( queryClient.getQueryData( linkSuggestionKeys.list( before.id ) ) ).toEqual( accepted )
    expect( invalidate ).not.toHaveBeenCalledWith( {
      queryKey: linkSuggestionKeys.list( before.id ),
    } )
  } )

  it( 'keeps both caches and reports the error', async () => {
    mockedAccept.mockRejectedValue( new ApiError( 'Link suggestion x is not pending', 409 ) )
    const { result, queryClient } = renderHookWithClient(
      () => useAcceptLinkSuggestions( before.id ),
    )
    queryClient.setQueryData( jobKeys.detail( before.id ), before )
    queryClient.setQueryData( linkSuggestionKeys.list( before.id ), pending )

    act( () => result.current.mutate( body ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Link suggestion x is not pending' )
    expect( queryClient.getQueryData( jobKeys.detail( before.id ) ) ).toEqual( before )
    expect( queryClient.getQueryData( linkSuggestionKeys.list( before.id ) ) ).toEqual( pending )
  } )
} )
