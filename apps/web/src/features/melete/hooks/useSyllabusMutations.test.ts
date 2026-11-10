// Packages
import type { QueryClient } from '@tanstack/react-query'
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
import * as api from '../api/syllabus.api'
import {
  meleteSubjectFixture,
  meleteSubjectResponseFixture,
  SUBJECT_ID,
} from '../fixtures/melete.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { DIFF, syllabusFixture } from '../fixtures/syllabus.fixture'
import { meleteKeys } from '#src/lib/queryKeys'
import {
  useApproveSyllabus,
  useDraftSyllabus,
  useSaveSyllabus,
} from './useSyllabusMutations'

vi.mock( '../api/syllabus.api' )

const seed = ( queryClient: QueryClient ): void => {
  queryClient.setQueryData( meleteKeys.subject( SUBJECT_ID ), meleteSubjectResponseFixture() )
}

const setup = < Result >( hook: () => Result ) => {
  const rendered = renderHookWithClient( hook )

  seed( rendered.queryClient )

  return { ...rendered, invalidate: vi.spyOn( rendered.queryClient, 'invalidateQueries' ) }
}

beforeEach( () => {
  vi.resetAllMocks()
} )

describe( 'syllabus mutations', () => {
  it.each( [
    [ 'drafting', useDraftSyllabus, 'draftMeleteSyllabus', 'drafting' ],
    [ 'approving', useApproveSyllabus, 'approveMeleteSyllabus', 'approved' ],
  ] as const )( '%s puts the subject in the cache and refreshes Today', async (
    _name,
    hook,
    call,
    status,
  ) => {
    const subject = meleteSubjectFixture( { syllabus_status: status } )

    vi.mocked( api[ call ] ).mockResolvedValue( subject )

    const { result, queryClient, invalidate } = setup( () => hook() )

    act( () => result.current.mutate( SUBJECT_ID ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( api[ call ] ).toHaveBeenCalledWith( SUBJECT_ID )
    expect( queryClient.getQueryData( meleteKeys.subject( SUBJECT_ID ) ) )
      .toEqual( meleteSubjectResponseFixture( { subject } ) )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.today } )
    expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.syllabus( SUBJECT_ID ) } )
  } )

  it( 'saving puts the syllabus in the cache and keeps the diff for the page', async () => {
    const edit = { sections: [ { name: 'A', concepts: [ { name: 'B', description: '' } ] } ] }

    vi.mocked( api.saveMeleteSyllabus )
      .mockResolvedValue( { syllabus: syllabusFixture(), diff: DIFF } )

    const { result, queryClient, invalidate } = setup( () => useSaveSyllabus() )

    act( () => result.current.mutate( { id: SUBJECT_ID, edit } ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( api.saveMeleteSyllabus ).toHaveBeenCalledWith( SUBJECT_ID, edit )
    expect( queryClient.getQueryData( meleteKeys.syllabus( SUBJECT_ID ) ) )
      .toEqual( syllabusFixture() )
    expect( result.current.data?.diff ).toEqual( DIFF )
    expect( invalidate ).toHaveBeenCalledWith( {
      queryKey: meleteKeys.subject( SUBJECT_ID ),
      exact: true,
    } )
  } )

  it( 'surfaces an error from the server', async () => {
    vi.mocked( api.draftMeleteSyllabus )
      .mockRejectedValue( new Error( 'Choose a target level first' ) )

    const { result } = setup( () => useDraftSyllabus() )

    act( () => result.current.mutate( SUBJECT_ID ) )

    await vi.waitFor( () => expect( result.current.isError ).toBe( true ) )
    expect( result.current.error?.message ).toBe( 'Choose a target level first' )
  } )
} )
