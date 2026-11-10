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
import { listLinkSuggestions } from '../api/linkSuggestions.api'
import { linkSuggestionFixture } from '../test-support/linkSuggestion.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { useLinkSuggestions } from './useLinkSuggestions'

vi.mock( '../api/linkSuggestions.api' )

const mockedList = vi.mocked( listLinkSuggestions )
const jobId = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b'

beforeEach( () => {
  mockedList.mockReset()
} )

describe( 'useLinkSuggestions', () => {
  it( 'does not ask the server while disabled', () => {
    const { result } = renderHookWithClient( () => useLinkSuggestions( jobId, { enabled: false } ) )

    expect( result.current ).toEqual( { suggestions: [], isLoading: false, error: null } )
    expect( mockedList ).not.toHaveBeenCalled()
  } )

  it( 'loads the suggestions when enabled', async () => {
    const suggestions = [ linkSuggestionFixture() ]
    mockedList.mockResolvedValue( suggestions )
    const { result } = renderHookWithClient( () => useLinkSuggestions( jobId, { enabled: true } ) )

    expect( result.current.isLoading ).toBe( true )

    await vi.waitFor( () => expect( result.current.suggestions ).toEqual( suggestions ) )
    expect( mockedList ).toHaveBeenCalledWith( jobId )
    expect( result.current ).toMatchObject( { isLoading: false, error: null } )
  } )

  it( 'reports a load error', async () => {
    mockedList.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    const { result } = renderHookWithClient( () => useLinkSuggestions( jobId, { enabled: true } ) )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Could not reach the server' ) )
    expect( result.current.suggestions ).toEqual( [] )
  } )
} )
