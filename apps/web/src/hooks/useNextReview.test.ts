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
import { getNextReview } from '../api/melete.api'
import { SUBJECT_ID } from '../test-support/melete.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { useNextReview } from './useNextReview'

vi.mock( '../api/melete.api' )

const mockedGet = vi.mocked( getNextReview )
const empty = { item: null, counts: { due: 0, new_remaining: 0, learning_soon: 0 } }

beforeEach( () => {
  mockedGet.mockReset()
} )

describe( 'useNextReview', () => {
  it( 'loads the next item for a subject, or for everything', async () => {
    mockedGet.mockResolvedValue( empty )
    const { result } = renderHookWithClient( () => useNextReview( SUBJECT_ID ) )

    expect( result.current ).toMatchObject( { item: null, counts: null, isLoading: true } )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( mockedGet ).toHaveBeenCalledWith( SUBJECT_ID )
    expect( result.current ).toMatchObject( { item: null, counts: empty.counts, error: null } )

    renderHookWithClient( () => useNextReview( null ) )
    await vi.waitFor( () => expect( mockedGet ).toHaveBeenCalledWith( null ) )
  } )

  it( 'loads the next item for one concept', async () => {
    mockedGet.mockResolvedValue( empty )
    const { result } = renderHookWithClient( () => useNextReview( null, SUBJECT_ID ) )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( mockedGet ).toHaveBeenCalledWith( null, SUBJECT_ID )
  } )

  it( 'reports an error', async () => {
    mockedGet.mockRejectedValue( new ApiError( 'Choose a learning root first', 409 ) )
    const { result } = renderHookWithClient( () => useNextReview( null ) )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Choose a learning root first' ) )
  } )
} )
