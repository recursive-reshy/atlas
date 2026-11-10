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
import { dismissInbox } from '../api/inbox.api'
import { ITEM_ID } from '#src/features/feeds/fixtures/feed.fixture'
import { GMAIL_ITEM_ID } from '#src/features/gmail/fixtures/gmail.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { feedKeys, gmailKeys, inboxKeys } from '#src/lib/queryKeys'
import { useDismissInbox } from './useDismissInbox'

vi.mock( '../api/inbox.api' )

const mockedDismiss = vi.mocked( dismissInbox )
const ref = { kind: 'feed' as const, id: ITEM_ID }
const emailRef = { kind: 'gmail' as const, id: GMAIL_ITEM_ID }

beforeEach( () => {
  mockedDismiss.mockReset()
} )

describe( 'useDismissInbox', () => {
  it( 'dismisses the items, then refreshes the inbox, the feeds and the sources', async () => {
    mockedDismiss.mockResolvedValue( undefined )
    const { result, queryClient } = renderHookWithClient( () => useDismissInbox() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    act( () => result.current.mutate( [ ref, emailRef ] ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( mockedDismiss ).toHaveBeenCalledWith( [ ref, emailRef ] )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: inboxKeys.all } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: feedKeys.all } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: gmailKeys.sources } )
  } )

  it( 'reports an error', async () => {
    mockedDismiss.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useDismissInbox() )

    act( () => result.current.mutate( [ ref ] ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Could not reach the server' )
  } )
} )
