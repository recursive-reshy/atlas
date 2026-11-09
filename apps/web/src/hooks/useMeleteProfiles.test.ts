// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { listProfiles } from '../api/prompts.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import {
  LINKER_ID,
  meleteProfilesFixture,
  profileFixture,
  profilesFixture,
} from '../test-support/summarizer.fixture'
import { promptKeys } from './queryKeys'
import { useMeleteProfiles } from './useMeleteProfiles'

vi.mock( '../api/prompts.api' )

beforeEach( () => {
  vi.mocked( listProfiles ).mockReset()
} )

describe( 'useMeleteProfiles', () => {
  it( 'asks for every purpose and keeps only the five Melete prompts', async () => {
    const linker = profileFixture( { id: LINKER_ID, name: 'Linker', purpose: 'linker' } )
    vi.mocked( listProfiles ).mockResolvedValue(
      [ ...profilesFixture(), linker, ...meleteProfilesFixture() ],
    )
    const { result } = renderHookWithClient( () => useMeleteProfiles() )

    expect( result.current.isLoading ).toBe( true )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )

    expect( listProfiles ).toHaveBeenCalledWith( 'all' )
    expect( result.current.profiles ).toEqual( meleteProfilesFixture() )
    expect( result.current.error ).toBeNull()
  } )

  it( 'reports an error', async () => {
    vi.mocked( listProfiles ).mockRejectedValue( new Error( 'Server down' ) )
    const { result } = renderHookWithClient( () => useMeleteProfiles() )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Server down' ) )

    expect( result.current.profiles ).toEqual( [] )
  } )

  it( 'is refreshed by the profiles key, which every prompt change invalidates', async () => {
    vi.mocked( listProfiles ).mockResolvedValue( meleteProfilesFixture() )
    const { result, queryClient } = renderHookWithClient( () => useMeleteProfiles() )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    await queryClient.invalidateQueries( { queryKey: promptKeys.profiles } )

    expect( listProfiles ).toHaveBeenCalledTimes( 2 )
  } )
} )
