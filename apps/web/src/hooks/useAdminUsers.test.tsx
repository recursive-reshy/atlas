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
import {
  createUser,
  deleteUser,
  listUsers,
  resetVault,
  updateUser,
} from '../api/admin.api'
import { adminUserFixture } from '../test-support/me.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { adminKeys } from '../lib/queryKeys'
import { useAdminUsers } from './useAdminUsers'

vi.mock( '../api/admin.api' )

const ID = adminUserFixture().id

beforeEach( () => {
  vi.mocked( listUsers ).mockReset()
  vi.mocked( listUsers ).mockResolvedValue( [ adminUserFixture() ] )
} )

const setup = async () => {
  const rendered = renderHookWithClient( () => useAdminUsers() )
  await vi.waitFor( () => expect( rendered.result.current.isLoading ).toBe( false ) )
  const invalidate = vi.spyOn( rendered.queryClient, 'invalidateQueries' )

  return { ...rendered, invalidate }
}

describe( 'useAdminUsers', () => {
  it( 'lists the users', async () => {
    const { result } = await setup()

    expect( result.current.users ).toEqual( [ adminUserFixture() ] )
    expect( result.current.error ).toBeNull()
  } )

  it( 'reports a failed list', async () => {
    vi.mocked( listUsers ).mockRejectedValue( new Error( 'Boom' ) )
    const { result } = renderHookWithClient( () => useAdminUsers() )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Boom' ) )
    expect( result.current.users ).toEqual( [] )
  } )

  it( 'adds a user and refreshes users and usage', async () => {
    vi.mocked( createUser ).mockResolvedValue( adminUserFixture() )
    const { result, invalidate } = await setup()
    const body = { email: 'brother@example.com', name: 'Brother', modules: [ 'melete' as const ] }

    await act( () => result.current.createUser.mutateAsync( body ) )

    expect( createUser ).toHaveBeenCalledWith( body )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: adminKeys.all } )
  } )

  it( 'updates a user', async () => {
    vi.mocked( updateUser ).mockResolvedValue( adminUserFixture( { status: 'removed' } ) )
    const { result, invalidate } = await setup()

    await act( () => result.current.updateUser.mutateAsync(
      { id: ID, body: { status: 'removed' } },
    ) )

    expect( updateUser ).toHaveBeenCalledWith( ID, { status: 'removed' } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: adminKeys.all } )
  } )

  it( 'resets a vault', async () => {
    vi.mocked( resetVault ).mockResolvedValue( adminUserFixture( { vault_dir: null } ) )
    const { result, invalidate } = await setup()

    await act( () => result.current.resetVault.mutateAsync( ID ) )

    expect( resetVault ).toHaveBeenCalledWith( ID )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: adminKeys.all } )
  } )

  it( 'deletes a user with the confirmation', async () => {
    vi.mocked( deleteUser ).mockResolvedValue( undefined )
    const { result, invalidate } = await setup()

    await act( () => result.current.deleteUser.mutateAsync(
      { id: ID, confirm: 'brother@example.com' },
    ) )

    expect( deleteUser ).toHaveBeenCalledWith( ID, 'brother@example.com' )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: adminKeys.all } )
  } )
} )
