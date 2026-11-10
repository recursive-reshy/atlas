// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { getMe } from './me.api'
import { meFixture } from '../test-support/me.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { useMe } from './useMe'

vi.mock( './me.api' )

const mockedGetMe = vi.mocked( getMe )

beforeEach( () => {
  mockedGetMe.mockReset()
} )

describe( 'useMe', () => {
  it( 'starts loading, then returns the user', async () => {
    mockedGetMe.mockResolvedValue( meFixture() )

    const { result } = renderHookWithClient( () => useMe() )

    expect( result.current.isLoading ).toBe( true )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.me ).toEqual( meFixture() )
    expect( result.current.error ).toBeNull()
  } )

  it( 'treats a signed-out user as no user and no error', async () => {
    mockedGetMe.mockResolvedValue( null )

    const { result } = renderHookWithClient( () => useMe() )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.me ).toBeNull()
    expect( result.current.error ).toBeNull()
    expect( mockedGetMe ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'reports another failure', async () => {
    mockedGetMe.mockRejectedValue( new Error( 'Boom' ) )

    const { result } = renderHookWithClient( () => useMe() )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.me ).toBeNull()
    expect( result.current.error ).toBe( 'Boom' )
  } )
} )
