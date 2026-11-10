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
import { getMeleteGaps, suggestResources } from '../api/gaps.api'
import { gapsFixture, suggestionsFixture } from '../test-support/gaps.fixture'
import { SUBJECT_ID } from '../test-support/melete.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { meleteKeys } from '../lib/queryKeys'
import { useMeleteGaps } from './useMeleteGaps'
import { useSuggestResources } from './useSuggestResources'

vi.mock( '../api/gaps.api' )

beforeEach( () => {
  vi.resetAllMocks()
} )

describe( 'useMeleteGaps', () => {
  it( 'returns the gap view once loaded', async () => {
    vi.mocked( getMeleteGaps ).mockResolvedValue( gapsFixture() )

    const { result } = renderHookWithClient( () => useMeleteGaps( SUBJECT_ID ) )

    expect( result.current ).toMatchObject( { gaps: null, isLoading: true } )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( getMeleteGaps ).toHaveBeenCalledWith( SUBJECT_ID )
    expect( result.current ).toMatchObject( { gaps: gapsFixture(), error: null } )
  } )

  it( 'reports an error', async () => {
    vi.mocked( getMeleteGaps ).mockRejectedValue( new Error( 'Server down' ) )

    const { result } = renderHookWithClient( () => useMeleteGaps( SUBJECT_ID ) )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Server down' ) )
    expect( result.current.gaps ).toBeNull()
  } )

  it( 'lives under the subject key, so any change to the subject refreshes it', async () => {
    vi.mocked( getMeleteGaps ).mockResolvedValue( gapsFixture() )

    const { result, queryClient } = renderHookWithClient( () => useMeleteGaps( SUBJECT_ID ) )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    await queryClient.invalidateQueries( { queryKey: meleteKeys.subject( SUBJECT_ID ) } )

    expect( getMeleteGaps ).toHaveBeenCalledTimes( 2 )
  } )
} )

describe( 'useSuggestResources', () => {
  it( 'asks for a concept and keeps the answer in the mutation, not the cache', async () => {
    vi.mocked( suggestResources ).mockResolvedValue( suggestionsFixture() )

    const { result, queryClient } = renderHookWithClient( () => useSuggestResources() )

    act( () => result.current.mutate( SUBJECT_ID ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( suggestResources ).toHaveBeenCalledWith( SUBJECT_ID )
    expect( result.current.data ).toEqual( suggestionsFixture() )
    expect( queryClient.getQueryCache().getAll() ).toEqual( [] )
  } )

  it( 'exposes the error of a failed request', async () => {
    vi.mocked( suggestResources ).mockRejectedValue( new Error( 'Overloaded' ) )

    const { result } = renderHookWithClient( () => useSuggestResources() )

    act( () => result.current.mutate( SUBJECT_ID ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Overloaded' )
  } )
} )
