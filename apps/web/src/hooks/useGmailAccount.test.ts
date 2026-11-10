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
import { disconnectGmail, getGmailAccount } from '../api/gmail.api'
import { gmailAccountFixture } from '../test-support/gmail.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { gmailKeys } from '../lib/queryKeys'
import { useGmailAccount } from './useGmailAccount'

vi.mock( '../api/gmail.api' )

const mockedGet = vi.mocked( getGmailAccount )
const mockedDisconnect = vi.mocked( disconnectGmail )

beforeEach( () => {
  mockedGet.mockReset()
  mockedDisconnect.mockReset()
  mockedGet.mockResolvedValue( gmailAccountFixture() )
} )

describe( 'useGmailAccount', () => {
  it( 'starts loading, then returns the account', async () => {
    const { result } = renderHookWithClient( () => useGmailAccount() )

    expect( result.current.isLoading ).toBe( true )
    expect( result.current.account ).toBeNull()

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.account ).toEqual( gmailAccountFixture() )
    expect( result.current.error ).toBeNull()
  } )

  it( 'asks again every five minutes', async () => {
    vi.useFakeTimers()

    try {
      const { result } = renderHookWithClient( () => useGmailAccount() )

      await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )

      const loaded = mockedGet.mock.calls.length

      await act( () => vi.advanceTimersByTimeAsync( 4 * 60 * 1000 ) )
      expect( mockedGet ).toHaveBeenCalledTimes( loaded )
      await act( () => vi.advanceTimersByTimeAsync( 61 * 1000 ) )
      expect( mockedGet ).toHaveBeenCalledTimes( loaded + 1 )
    } finally {
      vi.useRealTimers()
    }
  } )

  it( 'returns the error message when loading fails', async () => {
    mockedGet.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useGmailAccount() )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.account ).toBeNull()
    expect( result.current.error ).toBe( 'Could not reach the server' )
  } )

  it( 'disconnects, then reloads the account', async () => {
    mockedDisconnect.mockResolvedValue( undefined )
    const { result, queryClient } = renderHookWithClient( () => useGmailAccount() )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )

    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    mockedGet.mockResolvedValue( gmailAccountFixture( { status: 'not_connected', email: null } ) )
    await act( () => result.current.disconnect.mutateAsync() )

    expect( mockedDisconnect ).toHaveBeenCalledOnce()
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: gmailKeys.account } )
    await vi.waitFor( () => expect( result.current.account?.status ).toBe( 'not_connected' ) )
  } )

  it( 'exposes a failed disconnect on the mutation', async () => {
    mockedDisconnect.mockRejectedValue( new Error( 'Boom' ) )
    const { result } = renderHookWithClient( () => useGmailAccount() )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    await act( async () => {
      await result.current.disconnect.mutateAsync().catch( () => undefined )
    } )

    await vi.waitFor( () => expect( result.current.disconnect.error?.message ).toBe( 'Boom' ) )
  } )
} )
