// Packages
import { focusManager } from '@tanstack/react-query'
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
// App
import { ApiError } from '#src/lib/apiError'
import { listInbox } from '../api/inbox.api'
import { feedItemFixture } from '#src/features/feeds/fixtures/feed.fixture'
import { gmailItemFixture } from '#src/test-support/gmail.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { INBOX_POLL_MS, useInbox } from './useInbox'

vi.mock( '../api/inbox.api' )

const mockedList = vi.mocked( listInbox )

const advance = async ( milliseconds: number ): Promise< void > => {
  await act( async () => {
    await vi.advanceTimersByTimeAsync( milliseconds )
  } )
}

beforeEach( () => {
  vi.useFakeTimers()
  mockedList.mockReset()
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'useInbox', () => {
  it( 'starts loading, then returns the items', async () => {
    mockedList.mockResolvedValue( [ gmailItemFixture(), feedItemFixture() ] )
    const { result } = renderHookWithClient( () => useInbox() )

    expect( result.current ).toEqual( { items: [], isLoading: true, error: null } )

    await advance( 0 )

    expect( result.current ).toEqual( {
      items: [ gmailItemFixture(), feedItemFixture() ],
      isLoading: false,
      error: null,
    } )
  } )

  it( 'reports an error', async () => {
    mockedList.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useInbox() )

    await advance( 0 )

    expect( result.current.error ).toBe( 'Could not reach the server' )
  } )

  it( 'refetches every 60 seconds', async () => {
    expect( INBOX_POLL_MS ).toBe( 60_000 )
    mockedList.mockResolvedValue( [] )
    renderHookWithClient( () => useInbox() )
    await advance( 0 )
    expect( mockedList ).toHaveBeenCalledTimes( 1 )

    await advance( INBOX_POLL_MS - 1 )
    expect( mockedList ).toHaveBeenCalledTimes( 1 )

    await advance( 1 )
    expect( mockedList ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'refetches when the window regains focus, whatever the app default', async () => {
    mockedList.mockResolvedValue( [] )
    renderHookWithClient( () => useInbox() )
    await advance( 0 )
    expect( mockedList ).toHaveBeenCalledTimes( 1 )

    await act( async () => {
      focusManager.setFocused( false )
      focusManager.setFocused( true )
      await vi.advanceTimersByTimeAsync( 0 )
    } )

    expect( mockedList ).toHaveBeenCalledTimes( 2 )
  } )
} )
