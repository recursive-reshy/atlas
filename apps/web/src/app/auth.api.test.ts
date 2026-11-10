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
import { signOut } from './auth.api'

const fetchMock = vi.fn()

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'signOut', () => {
  it( 'posts to the sign-out route', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await signOut()

    expect( fetchMock ).toHaveBeenCalledWith( '/api/auth/signout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    } )
  } )
} )
