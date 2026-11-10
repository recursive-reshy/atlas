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
import { getStatus, refreshStatus } from '../api/status.api'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import {
  failingRowFixture,
  statusFixture,
  statusRowFixture,
} from '../fixtures/status.fixture'
import { statusKeys } from '#src/lib/queryKeys'
import { useRefreshStatus } from './useRefreshStatus'
import { useStatus } from './useStatus'

vi.mock( '../api/status.api' )

beforeEach( () => {
  vi.mocked( getStatus ).mockReset().mockResolvedValue( statusFixture( [ statusRowFixture() ] ) )
  vi.mocked( refreshStatus ).mockReset()
} )

describe( 'useRefreshStatus', () => {
  it( 'refreshes and puts the response into the useStatus cache', async () => {
    const refreshed = statusFixture( [ failingRowFixture() ] )

    vi.mocked( refreshStatus ).mockResolvedValue( refreshed )

    const { result, queryClient } = renderHookWithClient( () => ( {
      status: useStatus(),
      refresh: useRefreshStatus(),
    } ) )

    await vi.waitFor( () => expect( result.current.status.isLoading ).toBe( false ) )
    expect( result.current.status.failingCount ).toBe( 0 )

    await act( () => result.current.refresh.mutateAsync() )

    expect( refreshStatus ).toHaveBeenCalledOnce()
    expect( queryClient.getQueryData( statusKeys.all ) ).toEqual( refreshed )
    await vi.waitFor( () => expect( result.current.status.failingCount ).toBe( 1 ) )
  } )

  it( 'exposes a failed refresh on the mutation and keeps the cached status', async () => {
    vi.mocked( refreshStatus ).mockRejectedValue( new Error( 'Boom' ) )

    const { result } = renderHookWithClient( () => ( {
      status: useStatus(),
      refresh: useRefreshStatus(),
    } ) )

    await vi.waitFor( () => expect( result.current.status.isLoading ).toBe( false ) )
    await act( async () => {
      await result.current.refresh.mutateAsync().catch( () => undefined )
    } )

    await vi.waitFor( () => expect( result.current.refresh.error?.message ).toBe( 'Boom' ) )
    expect( result.current.status.rows ).toEqual( [ statusRowFixture() ] )
  } )
} )
