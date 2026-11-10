// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { getMeleteSyllabus } from '../api/syllabus.api'
import { SUBJECT_ID } from '../test-support/melete.fixture'
import { renderHookWithClient } from '../test-support/renderWithClient'
import { syllabusFixture } from '../test-support/syllabus.fixture'
import { meleteKeys } from '../lib/queryKeys'
import { useMeleteSyllabus } from './useMeleteSyllabus'

vi.mock( '../api/syllabus.api' )

beforeEach( () => {
  vi.mocked( getMeleteSyllabus ).mockReset()
} )

describe( 'useMeleteSyllabus', () => {
  it( 'returns the syllabus once loaded', async () => {
    vi.mocked( getMeleteSyllabus ).mockResolvedValue( syllabusFixture() )

    const { result } = renderHookWithClient( () => useMeleteSyllabus( SUBJECT_ID ) )

    expect( result.current ).toMatchObject( { syllabus: null, isLoading: true } )
    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    expect( getMeleteSyllabus ).toHaveBeenCalledWith( SUBJECT_ID )
    expect( result.current ).toMatchObject( { syllabus: syllabusFixture(), error: null } )
  } )

  it( 'reports an error', async () => {
    vi.mocked( getMeleteSyllabus ).mockRejectedValue( new Error( 'Server down' ) )

    const { result } = renderHookWithClient( () => useMeleteSyllabus( SUBJECT_ID ) )

    await vi.waitFor( () => expect( result.current.error ).toBe( 'Server down' ) )
    expect( result.current.syllabus ).toBeNull()
  } )

  it( 'lives under the subject key, so a subject refresh refreshes it', async () => {
    vi.mocked( getMeleteSyllabus ).mockResolvedValue( syllabusFixture() )

    const { result, queryClient } = renderHookWithClient( () => useMeleteSyllabus( SUBJECT_ID ) )

    await vi.waitFor( () => expect( result.current.isLoading ).toBe( false ) )
    await queryClient.invalidateQueries( { queryKey: meleteKeys.subject( SUBJECT_ID ) } )

    expect( getMeleteSyllabus ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'fetches nothing while disabled, and fetches again once enabled', async () => {
    vi.mocked( getMeleteSyllabus ).mockResolvedValue( syllabusFixture() )

    const { result, rerender } = renderHookWithClient(
      ( { enabled }: { enabled: boolean } ) => useMeleteSyllabus( SUBJECT_ID, enabled ),
      { initialProps: { enabled: false } },
    )

    expect( getMeleteSyllabus ).not.toHaveBeenCalled()
    expect( result.current.syllabus ).toBeNull()

    rerender( { enabled: true } )

    await vi.waitFor( () => expect( result.current.syllabus ).toEqual( syllabusFixture() ) )
    expect( getMeleteSyllabus ).toHaveBeenCalledTimes( 1 )
  } )
} )
