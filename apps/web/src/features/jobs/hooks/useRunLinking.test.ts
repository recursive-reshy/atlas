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
import { runLinking } from '../api/linkSuggestions.api'
import { jobFixture } from '../fixtures/job.fixture'
import { linkSuggestionFixture } from '../fixtures/linkSuggestion.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { jobKeys, linkSuggestionKeys } from '#src/lib/queryKeys'
import { useRunLinking } from './useRunLinking'

vi.mock( '../api/linkSuggestions.api' )

const mockedRun = vi.mocked( runLinking )
const before = jobFixture( { status: 'ready_for_review', link_state: 'failed' } )

beforeEach( () => {
  mockedRun.mockReset()
} )

describe( 'useRunLinking', () => {
  it( 'puts the linking job in the cache and drops the suggestions', async () => {
    const linking = jobFixture( { status: 'linking', link_state: 'pending' } )
    mockedRun.mockResolvedValue( linking )
    const { result, queryClient } = renderHookWithClient( () => useRunLinking( before.id ) )
    queryClient.setQueryData( jobKeys.detail( before.id ), before )
    queryClient.setQueryData( linkSuggestionKeys.list( before.id ), [ linkSuggestionFixture() ] )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    act( () => result.current.mutate( { note_markdown: 'Note\n' } ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( mockedRun ).toHaveBeenCalledWith( before.id, { note_markdown: 'Note\n' } )
    expect( queryClient.getQueryData( jobKeys.detail( before.id ) ) ).toEqual( linking )
    expect( queryClient.getQueryData( linkSuggestionKeys.list( before.id ) ) ).toBeUndefined()
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: jobKeys.all, exact: true } )
  } )

  it( 'keeps the job and the suggestions and reports the error', async () => {
    mockedRun.mockRejectedValue( new ApiError( 'Linking isn\'t configured', 409 ) )
    const pending = [ linkSuggestionFixture() ]
    const { result, queryClient } = renderHookWithClient( () => useRunLinking( before.id ) )
    queryClient.setQueryData( jobKeys.detail( before.id ), before )
    queryClient.setQueryData( linkSuggestionKeys.list( before.id ), pending )

    act( () => result.current.mutate( {} ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Linking isn\'t configured' )
    expect( queryClient.getQueryData( jobKeys.detail( before.id ) ) ).toEqual( before )
    expect( queryClient.getQueryData( linkSuggestionKeys.list( before.id ) ) ).toEqual( pending )
  } )
} )
