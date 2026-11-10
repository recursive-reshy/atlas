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
import { adminUserFixture } from '#src/test-support/me.fixture'
import {
  createUser,
  deleteUser,
  getUsage,
  listUsers,
  resetVault,
  updateUser,
} from './admin.api'

const fetchMock = vi.fn()
const ID = '9b2d4f7a-1e63-4c1b-8d55-7a0e2c4b9f02'

const json = ( body: unknown, status = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'listUsers', () => {
  it( 'returns the users', async () => {
    fetchMock.mockResolvedValue( json( [ adminUserFixture() ] ) )

    await expect( listUsers() ).resolves.toEqual( [ adminUserFixture() ] )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/admin/users', undefined )
  } )

  it( 'rejects a response that does not match the schema', async () => {
    fetchMock.mockResolvedValue( json( [ { id: 1 } ] ) )

    await expect( listUsers() ).rejects.toThrow( 'Unexpected response from the server' )
  } )
} )

describe( 'createUser', () => {
  it( 'posts the body and returns the new user', async () => {
    const body = { email: 'brother@example.com', name: 'Brother', modules: [ 'melete' as const ] }
    fetchMock.mockResolvedValue( json( adminUserFixture(), 201 ) )

    await expect( createUser( body ) ).resolves.toEqual( adminUserFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/admin/users', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify( body ),
    } )
  } )
} )

describe( 'updateUser', () => {
  it( 'patches the user', async () => {
    fetchMock.mockResolvedValue( json( adminUserFixture( { status: 'removed' } ) ) )

    await updateUser( ID, { status: 'removed' } )

    expect( fetchMock ).toHaveBeenCalledWith( `/api/admin/users/${ ID }`, {
      method: 'PATCH',
      headers: JSON_HEADERS,
      body: JSON.stringify( { status: 'removed' } ),
    } )
  } )
} )

describe( 'resetVault and deleteUser', () => {
  it( 'posts to reset-vault', async () => {
    fetchMock.mockResolvedValue( json( adminUserFixture( { vault_dir: null } ) ) )

    await resetVault( ID )

    expect( fetchMock ).toHaveBeenCalledWith( `/api/admin/users/${ ID }/reset-vault`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: '{}',
    } )
  } )

  it( 'deletes with the confirmation email', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await deleteUser( ID, 'brother@example.com' )

    expect( fetchMock ).toHaveBeenCalledWith( `/api/admin/users/${ ID }`, {
      method: 'DELETE',
      headers: JSON_HEADERS,
      body: JSON.stringify( { confirm: 'brother@example.com' } ),
    } )
  } )
} )

describe( 'getUsage', () => {
  const usage = { month: '2026-10', time_zone: 'Asia/Singapore', users: [] }

  it( 'asks for the current month when none is given', async () => {
    fetchMock.mockResolvedValue( json( usage ) )

    await expect( getUsage() ).resolves.toEqual( usage )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/admin/usage', undefined )
  } )

  it( 'passes the month', async () => {
    fetchMock.mockResolvedValue( json( usage ) )

    await getUsage( '2026-09' )

    expect( fetchMock ).toHaveBeenCalledWith( '/api/admin/usage?month=2026-09', undefined )
  } )
} )
