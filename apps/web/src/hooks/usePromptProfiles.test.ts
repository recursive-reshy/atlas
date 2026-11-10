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
import {
  createProfile,
  deleteProfile,
  listProfiles,
  renameProfile,
  resetProfile,
  restoreVersion,
  saveVersion,
} from '../api/prompts.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import {
  CODING_ID,
  profileFixture,
  profilesFixture,
} from '../test-support/summarizer.fixture'
import { promptKeys } from '../lib/queryKeys'
import { usePromptProfiles } from './usePromptProfiles'

vi.mock( '../api/prompts.api' )

const mocks = {
  list: vi.mocked( listProfiles ),
  create: vi.mocked( createProfile ),
  rename: vi.mocked( renameProfile ),
  remove: vi.mocked( deleteProfile ),
  save: vi.mocked( saveVersion ),
  restore: vi.mocked( restoreVersion ),
  reset: vi.mocked( resetProfile ),
}

const setup = async () => {
  const rendered = renderHookWithClient( () => usePromptProfiles() )
  await vi.waitFor( () => expect( rendered.result.current.isLoading ).toBe( false ) )
  const invalidate = vi.spyOn( rendered.queryClient, 'invalidateQueries' )

  return { ...rendered, invalidate }
}

beforeEach( () => {
  Object.values( mocks ).forEach( ( mock ) => mock.mockReset() )
  mocks.list.mockResolvedValue( profilesFixture() )
} )

describe( 'usePromptProfiles', () => {
  it( 'starts loading, then returns the profiles', async () => {
    const { result } = renderHookWithClient( () => usePromptProfiles() )

    expect( result.current.isLoading ).toBe( true )
    expect( result.current.profiles ).toEqual( [] )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current.profiles ).toEqual( profilesFixture() )
    expect( result.current.error ).toBeNull()
  } )

  it( 'reports a load error', async () => {
    mocks.list.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => usePromptProfiles() )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Could not reach the server' ) )
  } )

  it( 'creates a profile and refreshes the profiles', async () => {
    const created = profileFixture( { id: CODING_ID, name: 'Research' } )
    mocks.create.mockResolvedValue( created )
    const { result, invalidate } = await setup()

    act( () => result.current.createProfile.mutate( { name: 'Research', guidance: 'g' } ) )

    await vi.waitFor( () => expect( result.current.createProfile.isSuccess ).toBe( true ) )
    expect( mocks.create ).toHaveBeenCalledWith( { name: 'Research', guidance: 'g' } )
    expect( result.current.createProfile.data ).toEqual( created )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: promptKeys.profiles } )
  } )

  it( 'renames a profile and refreshes the profiles', async () => {
    mocks.rename.mockResolvedValue( profileFixture() )
    const { result, invalidate } = await setup()

    act( () => result.current.renameProfile.mutate( { id: CODING_ID, name: 'Code' } ) )

    await vi.waitFor( () => expect( result.current.renameProfile.isSuccess ).toBe( true ) )
    expect( mocks.rename ).toHaveBeenCalledWith( CODING_ID, 'Code' )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: promptKeys.profiles } )
  } )

  it( 'deletes a profile and refreshes the profiles', async () => {
    mocks.remove.mockResolvedValue( undefined )
    const { result, invalidate } = await setup()

    act( () => result.current.deleteProfile.mutate( CODING_ID ) )

    await vi.waitFor( () => expect( result.current.deleteProfile.isSuccess ).toBe( true ) )
    expect( mocks.remove ).toHaveBeenCalledWith( CODING_ID )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: promptKeys.profiles } )
  } )

  it( 'saves a version and refreshes the profiles and their versions', async () => {
    mocks.save.mockResolvedValue( profileFixture() )
    const { result, invalidate } = await setup()

    act( () => result.current.saveVersion.mutate( { id: CODING_ID, guidance: 'New' } ) )

    await vi.waitFor( () => expect( result.current.saveVersion.isSuccess ).toBe( true ) )
    expect( mocks.save ).toHaveBeenCalledWith( CODING_ID, 'New' )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: promptKeys.profiles } )
  } )

  it( 'restores a version and refreshes the profiles', async () => {
    mocks.restore.mockResolvedValue( profileFixture() )
    const { result, invalidate } = await setup()

    act( () => result.current.restoreVersion.mutate( { id: CODING_ID, versionId: 4 } ) )

    await vi.waitFor( () => expect( result.current.restoreVersion.isSuccess ).toBe( true ) )
    expect( mocks.restore ).toHaveBeenCalledWith( CODING_ID, 4 )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: promptKeys.profiles } )
  } )

  it( 'resets a profile and refreshes the profiles', async () => {
    mocks.reset.mockResolvedValue( profileFixture() )
    const { result, invalidate } = await setup()

    act( () => result.current.resetProfile.mutate( CODING_ID ) )

    await vi.waitFor( () => expect( result.current.resetProfile.isSuccess ).toBe( true ) )
    expect( mocks.reset ).toHaveBeenCalledWith( CODING_ID )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: promptKeys.profiles } )
  } )

  it( 'reports a failed mutation and leaves the cached profiles alone', async () => {
    mocks.create.mockRejectedValue( new ApiError( 'A profile with that name already exists', 409 ) )
    const { result, queryClient, invalidate } = await setup()

    act( () => result.current.createProfile.mutate( { name: 'Coding', guidance: 'g' } ) )

    await vi.waitFor( () => expect( result.current.createProfile.isError ).toBe( true ) )
    expect( result.current.createProfile.error?.message )
      .toBe( 'A profile with that name already exists' )
    expect( queryClient.getQueryData( promptKeys.profiles ) ).toEqual( profilesFixture() )
    expect( invalidate ).not.toHaveBeenCalled()
  } )
} )
