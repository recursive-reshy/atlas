// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Testing Library
import { act } from '@testing-library/react'
// App
import { signOut } from './auth.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { meKeys } from '../lib/queryKeys'
import { useSignOut } from './useSignOut'

vi.mock( './auth.api' )

beforeEach( () => {
  vi.mocked( signOut ).mockReset()
} )

describe( 'useSignOut', () => {
  it( 'signs out, then asks for the user again', async () => {
    vi.mocked( signOut ).mockResolvedValue( undefined )
    const { result, queryClient } = renderHookWithClient( () => useSignOut() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    await act( () => result.current.mutateAsync() )

    expect( signOut ).toHaveBeenCalledTimes( 1 )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meKeys.all } )
  } )

  it( 'asks for the user again even when signing out fails', async () => {
    vi.mocked( signOut ).mockRejectedValue( new Error( 'Boom' ) )
    const { result, queryClient } = renderHookWithClient( () => useSignOut() )
    const invalidate = vi.spyOn( queryClient, 'invalidateQueries' )

    await act( () => result.current.mutateAsync().catch( () => null ) )

    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meKeys.all } )
  } )
} )
