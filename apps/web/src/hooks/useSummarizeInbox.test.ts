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
import { listInbox, summarizeInbox } from '../api/inbox.api'
import { feedItemFixture, ITEM_ID } from '../test-support/feed.fixture'
import { GMAIL_ITEM_ID, gmailItemFixture } from '../test-support/gmail.fixture'
import { jobFixture } from '../features/jobs/fixtures/job.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import {
  feedKeys,
  gmailKeys,
  inboxKeys,
  jobKeys,
} from '../lib/queryKeys'
import { useSummarizeInbox } from './useSummarizeInbox'

vi.mock( '../api/inbox.api' )

const mockedSummarize = vi.mocked( summarizeInbox )
const mockedList = vi.mocked( listInbox )
const feedRef = { kind: 'feed' as const, id: ITEM_ID }
const emailRef = { kind: 'gmail' as const, id: GMAIL_ITEM_ID }

beforeEach( () => {
  mockedSummarize.mockReset()
  mockedList.mockReset()
  mockedList.mockResolvedValue( [] )
} )

describe( 'useSummarizeInbox', () => {
  it( 'sends the choices, then refreshes jobs, inbox, feeds and sources', async () => {
    mockedSummarize.mockResolvedValue( [ jobFixture() ] )
    const { result, queryClient } = renderHookWithClient( () => useSummarizeInbox() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )
    const body = { items: [ feedRef ], profile_id: '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b' }

    act( () => result.current.mutate( body ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( mockedSummarize ).toHaveBeenCalledWith( body )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: jobKeys.all, exact: true } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: inboxKeys.all } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: feedKeys.all } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: gmailKeys.sources } )
  } )

  it( 'returns the jobs and no failed titles when everything was queued', async () => {
    mockedSummarize.mockResolvedValue( [ jobFixture() ] )
    const { result } = renderHookWithClient( () => useSummarizeInbox() )

    act( () => result.current.mutate( { items: [ feedRef ] } ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( result.current.data ).toEqual( { jobs: [ jobFixture() ], failedTitles: [] } )
  } )

  it( 'names the submitted items that are still in the inbox once it has refetched', async () => {
    mockedSummarize.mockResolvedValue( [ jobFixture() ] )
    mockedList.mockResolvedValue( [
      gmailItemFixture( { title: 'Too short' } ),
      feedItemFixture( { id: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f', title: 'Not asked about' } ),
    ] )
    const { result } = renderHookWithClient( () => useSummarizeInbox() )

    act( () => result.current.mutate( { items: [ feedRef, emailRef ] } ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( result.current.data?.failedTitles ).toEqual( [ 'Too short' ] )
  } )

  it( 'does not take a feed ref for an email with the same id', async () => {
    mockedSummarize.mockResolvedValue( [ jobFixture() ] )
    mockedList.mockResolvedValue( [ gmailItemFixture( { id: ITEM_ID, title: 'An email' } ) ] )
    const { result } = renderHookWithClient( () => useSummarizeInbox() )

    act( () => result.current.mutate( { items: [ feedRef ] } ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( result.current.data?.failedTitles ).toEqual( [] )
  } )

  it( 'reports the server\'s message and refreshes nothing', async () => {
    mockedSummarize.mockRejectedValue( new ApiError( 'Not in the inbox: abc', 409 ) )
    const { result, queryClient } = renderHookWithClient( () => useSummarizeInbox() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    act( () => result.current.mutate( { items: [ feedRef ] } ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Not in the inbox: abc' )
    expect( invalidate ).not.toHaveBeenCalled()
    expect( mockedList ).not.toHaveBeenCalled()
  } )
} )
