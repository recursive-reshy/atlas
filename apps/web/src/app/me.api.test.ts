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
import { meFixture } from '../test-support/me.fixture'
import {
  claimVault,
  createVault,
  getMe,
  listVaults,
} from './me.api'

const fetchMock = vi.fn()

const json = ( body: unknown, status = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'getMe', () => {
  it( 'returns the signed-in user', async () => {
    fetchMock.mockResolvedValue( json( meFixture() ) )

    await expect( getMe() ).resolves.toEqual( meFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/me', undefined )
  } )

  it( 'returns null on a 401', async () => {
    fetchMock.mockResolvedValue( json( { error: 'unauthenticated' }, 401 ) )

    await expect( getMe() ).resolves.toBeNull()
  } )

  it( 'throws on any other error', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Boom' }, 500 ) )

    await expect( getMe() ).rejects.toThrow( 'Boom' )
  } )
} )

describe( 'listVaults', () => {
  it( 'gets the unclaimed folders', async () => {
    fetchMock.mockResolvedValue( json( { folders: [ 'a', 'b' ], can_create: true } ) )

    await expect( listVaults() ).resolves.toEqual( { folders: [ 'a', 'b' ], can_create: true } )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/me/vaults', undefined )
  } )
} )

describe( 'claimVault and createVault', () => {
  it( 'claims a folder', async () => {
    fetchMock.mockResolvedValue( json( meFixture() ) )

    await claimVault( 'brother' )

    expect( fetchMock ).toHaveBeenCalledWith( '/api/me/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { vault_dir: 'brother' } ),
    } )
  } )

  it( 'creates a folder', async () => {
    fetchMock.mockResolvedValue( json( meFixture() ) )

    await createVault( 'brother' )

    expect( fetchMock ).toHaveBeenCalledWith( '/api/me/vault/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { vault_dir: 'brother' } ),
    } )
  } )
} )
