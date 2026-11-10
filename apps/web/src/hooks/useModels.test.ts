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
import { listModels } from '../api/models.api'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { modelsFixture } from '../features/jobs/fixtures/summarizer.fixture'
import { modelKeys } from '../lib/queryKeys'
import { useModels } from './useModels'

vi.mock( '../api/models.api' )

const mockedList = vi.mocked( listModels )

beforeEach( () => {
  mockedList.mockReset()
} )

describe( 'useModels', () => {
  it( 'starts loading, then returns the models and their source', async () => {
    mockedList.mockResolvedValue( modelsFixture( { source: 'fallback' } ) )
    const { result } = renderHookWithClient( () => useModels() )

    expect( result.current ).toEqual( { models: [], source: null, isLoading: true, error: null } )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( result.current ).toEqual( {
      models: modelsFixture().models,
      source: 'fallback',
      isLoading: false,
      error: null,
    } )
  } )

  it( 'reports an error', async () => {
    mockedList.mockRejectedValue( new ApiError( 'Request failed with status 500', 500 ) )
    const { result } = renderHookWithClient( () => useModels() )

    await vi.waitFor( () => {
      expect( result.current.error ).toBe( 'Request failed with status 500' )
    } )
  } )

  it( 'keeps the list fresh for an hour', async () => {
    mockedList.mockResolvedValue( modelsFixture() )
    const { result, queryClient } = renderHookWithClient( () => useModels() )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )

    const state = queryClient.getQueryState( modelKeys.all )
    const query = queryClient.getQueryCache().find( { queryKey: modelKeys.all } )

    expect( state?.status ).toBe( 'success' )
    expect( query?.isStale() ).toBe( false )
    expect( query?.observers[ 0 ]?.options.staleTime ).toBe( 3_600_000 )
  } )
} )
