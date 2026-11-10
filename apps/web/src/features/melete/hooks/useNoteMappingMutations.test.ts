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
import * as api from '../api/melete.api'
import {
  meleteNoteFixture,
  meleteNoteResponseFixture,
  meleteSubjectResponseFixture,
  NOTE_ID,
  SUBJECT_ID,
} from '../fixtures/melete.fixture'
import { renderHookWithClient } from '#src/test-support/renderWithClient'
import { meleteKeys } from '#src/lib/queryKeys'
import { useOffSyllabusAction, useSetNoteConcepts } from './useNoteMappingMutations'

vi.mock( '../api/melete.api' )

const queued = meleteNoteResponseFixture( {
  note: meleteNoteFixture( { mapping: 'queued' } ),
} )

const setup = < Result >( hook: () => Result ) => {
  const rendered = renderHookWithClient( hook )

  const { queryClient } = rendered

  queryClient.setQueryData( meleteKeys.subject( SUBJECT_ID ), meleteSubjectResponseFixture() )
  queryClient.setQueryData( meleteKeys.note( NOTE_ID ), meleteNoteResponseFixture() )

  return { ...rendered, invalidate: vi.spyOn( rendered.queryClient, 'invalidateQueries' ) }
}

const expectHandled = ( queryClient: QueryClient, invalidate: ReturnType< typeof vi.spyOn > ) => {
  expect( queryClient.getQueryData( meleteKeys.note( NOTE_ID ) ) ).toEqual( queued )
  expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.subject( SUBJECT_ID ) } )
  expect( invalidate ).toHaveBeenCalledWith( { queryKey: meleteKeys.today } )
}

beforeEach( () => {
  vi.resetAllMocks()
} )

describe( 'note mapping mutations', () => {
  it( 'saves a hand mapping, stores the note and refreshes its subject and syllabus', async () => {
    vi.mocked( api.setNoteConcepts ).mockResolvedValue( queued )
    const { result, queryClient, invalidate } = setup( () => useSetNoteConcepts() )

    act( () => result.current.mutate( { id: NOTE_ID, conceptIds: [ SUBJECT_ID ] } ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( api.setNoteConcepts ).toHaveBeenCalledWith( NOTE_ID, [ SUBJECT_ID ] )
    expectHandled( queryClient, invalidate )
  } )

  it( 'applies an off-syllabus action and refreshes the same caches', async () => {
    vi.mocked( api.applyOffSyllabusAction ).mockResolvedValue( queued )
    const { result, queryClient, invalidate } = setup( () => useOffSyllabusAction() )

    act( () => result.current.mutate( { id: NOTE_ID, body: { action: 'dismiss' } } ) )

    await vi.waitFor( () => expect( result.current.isSuccess ).toBe( true ) )
    expect( api.applyOffSyllabusAction ).toHaveBeenCalledWith( NOTE_ID, { action: 'dismiss' } )
    expectHandled( queryClient, invalidate )
  } )
} )
