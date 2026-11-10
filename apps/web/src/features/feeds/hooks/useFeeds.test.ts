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
import {
  checkAllFeeds,
  checkFeed,
  createFeed,
  deleteFeed,
  listFeeds,
  updateFeed,
} from '../api/feeds.api'
import { FEED_ID, feedFixture } from '../fixtures/feed.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { feedKeys, inboxKeys } from '#src/lib/queryKeys'
import { useFeeds } from './useFeeds'

vi.mock( '../api/feeds.api' )

const mocks = {
  list: vi.mocked( listFeeds ),
  create: vi.mocked( createFeed ),
  update: vi.mocked( updateFeed ),
  remove: vi.mocked( deleteFeed ),
  check: vi.mocked( checkFeed ),
  checkAll: vi.mocked( checkAllFeeds ),
}

const setup = async () => {
  const rendered = renderHookWithClient( () => useFeeds() )
  await vi.waitFor( () => expect( rendered.result.current.isLoading ).toBe( false ) )
  const invalidate = vi.spyOn( rendered.queryClient, 'invalidateQueries' )

  return { ...rendered, invalidate }
}

beforeEach( () => {
  Object.values( mocks ).forEach( ( mock ) => mock.mockReset() )
  mocks.list.mockResolvedValue( [ feedFixture() ] )
} )

describe( 'useFeeds', () => {
  it( 'starts loading, then returns the feeds', async () => {
    const { result } = renderHookWithClient( () => useFeeds() )

    expect( result.current.isLoading ).toBe( true )
    expect( result.current.feeds ).toEqual( [] )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.feeds ).toEqual( [ feedFixture() ] )
    expect( result.current.error ).toBeNull()
    expect( result.current.updatedAt ).toBeGreaterThan( 0 )
  } )

  it( 'reports a load error', async () => {
    mocks.list.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useFeeds() )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Could not reach the server' ) )
  } )

  it( 'creates a feed and refreshes the feeds and the inbox', async () => {
    mocks.create.mockResolvedValue( feedFixture() )
    const { result, invalidate } = await setup()
    const body = { url: 'https://blog.example.com' }

    act( () => result.current.createFeed.mutate( body ) )

    await vi.waitFor( () => expect( result.current.createFeed.isSuccess ).toBe( true ) )
    expect( mocks.create ).toHaveBeenCalledWith( body )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: feedKeys.all } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: inboxKeys.all } )
  } )

  it( 'updates a feed and refreshes', async () => {
    mocks.update.mockResolvedValue( feedFixture( { enabled: false } ) )
    const { result, invalidate } = await setup()

    act( () => result.current.updateFeed.mutate( { id: FEED_ID, body: { enabled: false } } ) )

    await vi.waitFor( () => expect( result.current.updateFeed.isSuccess ).toBe( true ) )
    expect( mocks.update ).toHaveBeenCalledWith( FEED_ID, { enabled: false } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: feedKeys.all } )
  } )

  it( 'deletes a feed with the remove-items choice and refreshes', async () => {
    mocks.remove.mockResolvedValue( undefined )
    const { result, invalidate } = await setup()

    act( () => result.current.deleteFeed.mutate( { id: FEED_ID, removeItems: true } ) )

    await vi.waitFor( () => expect( result.current.deleteFeed.isSuccess ).toBe( true ) )
    expect( mocks.remove ).toHaveBeenCalledWith( FEED_ID, true )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: feedKeys.all } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: inboxKeys.all } )
  } )

  it( 'checks one feed and refreshes, since a check can add inbox items', async () => {
    mocks.check.mockResolvedValue( feedFixture( { inbox_count: 2 } ) )
    const { result, invalidate } = await setup()

    act( () => result.current.checkFeed.mutate( FEED_ID ) )

    await vi.waitFor( () => expect( result.current.checkFeed.isSuccess ).toBe( true ) )
    expect( mocks.check ).toHaveBeenCalledWith( FEED_ID )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: feedKeys.all } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: inboxKeys.all } )
  } )

  it( 'checks every feed and refreshes', async () => {
    mocks.checkAll.mockResolvedValue( [ feedFixture() ] )
    const { result, invalidate } = await setup()

    act( () => result.current.checkAllFeeds.mutate() )

    await vi.waitFor( () => expect( result.current.checkAllFeeds.isSuccess ).toBe( true ) )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: inboxKeys.all } )
  } )

  it( 'keeps the feeds and exposes the error when a change fails', async () => {
    mocks.update.mockRejectedValue( new ApiError( 'Feed not found', 404 ) )
    const { result } = await setup()

    act( () => result.current.updateFeed.mutate( { id: FEED_ID, body: { enabled: false } } ) )

    await vi.waitFor( () => expect( result.current.updateFeed.isError ).toBe( true ) )
    expect( result.current.updateFeed.error?.message ).toBe( 'Feed not found' )
    expect( result.current.feeds ).toEqual( [ feedFixture() ] )
  } )
} )
