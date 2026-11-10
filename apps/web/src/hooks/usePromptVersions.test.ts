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
import { listVersions } from '../api/prompts.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { CODING_ID, versionFixture } from '../features/jobs/fixtures/summarizer.fixture'
import { usePromptVersions } from './usePromptVersions'

vi.mock( '../api/prompts.api' )

const mockedList = vi.mocked( listVersions )

beforeEach( () => {
  mockedList.mockReset()
} )

describe( 'usePromptVersions', () => {
  it( 'does nothing without a profile', () => {
    const { result } = renderHookWithClient( () => usePromptVersions( null ) )

    expect( result.current ).toEqual( { versions: [], isLoading: false, error: null } )
    expect( mockedList ).not.toHaveBeenCalled()
  } )

  it( 'loads the versions of a profile', async () => {
    const versions = [ versionFixture( { version: 2 } ), versionFixture() ]
    mockedList.mockResolvedValue( versions )
    const { result } = renderHookWithClient( () => usePromptVersions( CODING_ID ) )

    expect( result.current.isLoading ).toBe( true )

    await vi.waitFor( () => expect( result.current.versions ).toEqual( versions ) )
    expect( mockedList ).toHaveBeenCalledWith( CODING_ID )
    expect( result.current.isLoading ).toBe( false )
  } )

  it( 'loads again when the profile changes', async () => {
    mockedList.mockResolvedValue( [ versionFixture() ] )
    const { rerender } = renderHookWithClient(
      ( id: string ) => usePromptVersions( id ),
      { initialProps: CODING_ID },
    )
    await vi.waitFor( () => expect( mockedList ).toHaveBeenCalledTimes( 1 ) )

    rerender( 'other' )

    await vi.waitFor( () => expect( mockedList ).toHaveBeenCalledWith( 'other' ) )
  } )

  it( 'reports an error', async () => {
    mockedList.mockRejectedValue( new ApiError( 'Prompt profile not found', 404 ) )
    const { result } = renderHookWithClient( () => usePromptVersions( CODING_ID ) )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Prompt profile not found' ) )
  } )
} )
