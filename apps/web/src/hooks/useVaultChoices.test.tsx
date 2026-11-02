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
import { ApiError } from '../api/apiError'
import { claimVault, createVault, listVaults } from '../api/me.api'
import { meFixture } from '../test-support/me.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { meKeys } from './queryKeys'
import { useVaultChoices } from './useVaultChoices'

vi.mock( '../api/me.api' )

beforeEach( () => {
  vi.mocked( listVaults ).mockReset()
  vi.mocked( claimVault ).mockReset()
  vi.mocked( createVault ).mockReset()
  vi.mocked( listVaults ).mockResolvedValue( { folders: [ 'a', 'b' ], can_create: true } )
} )

describe( 'useVaultChoices', () => {
  it( 'passes on whether the server lets a vault be created', async () => {
    const { result } = renderHookWithClient( () => useVaultChoices() )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.canCreate ).toBe( true )
  } )

  it( 'reports canCreate false when the server says so', async () => {
    vi.mocked( listVaults ).mockResolvedValue( { folders: [ 'a' ], can_create: false } )
    const { result } = renderHookWithClient( () => useVaultChoices() )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.canCreate ).toBe( false )
  } )

  it( 'lists the unclaimed folders', async () => {
    const { result } = renderHookWithClient( () => useVaultChoices() )

    expect( result.current.isLoading ).toBe( true )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.folders ).toEqual( [ 'a', 'b' ] )
    expect( result.current.error ).toBeNull()
  } )

  it( 'reports a failed list', async () => {
    vi.mocked( listVaults ).mockRejectedValue( new Error( 'Boom' ) )
    const { result } = renderHookWithClient( () => useVaultChoices() )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Boom' ) )
    expect( result.current.folders ).toEqual( [] )
  } )

  it.each( [
    [ 'claim', claimVault ],
    [ 'create', createVault ],
  ] as const )( 'puts the user from a %s into the cache', async ( name, api ) => {
    const me = meFixture( { vault_dir: 'a' } )
    vi.mocked( api ).mockResolvedValue( me )
    const { result, queryClient } = renderHookWithClient( () => useVaultChoices() )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )

    await act( () => result.current[ name ].mutateAsync( 'a' ) )

    expect( api ).toHaveBeenCalledWith( 'a' )
    expect( queryClient.getQueryData( meKeys.all ) ).toEqual( me )
  } )

  it( 'refreshes the list when a claim is refused', async () => {
    vi.mocked( claimVault ).mockRejectedValue( new ApiError( 'That vault is already taken', 409 ) )
    const { result } = renderHookWithClient( () => useVaultChoices() )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    vi.mocked( listVaults ).mockResolvedValue( { folders: [ 'b' ], can_create: true } )

    await act( () => result.current.claim.mutateAsync( 'a' ).catch( () => null ) )

    await vi.waitFor( () => expect( result.current.folders ).toEqual( [ 'b' ] ) )
    expect( result.current.claim.error?.message ).toBe( 'That vault is already taken' )
  } )
} )
