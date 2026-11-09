// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { gapsFixture, suggestionsFixture } from '../test-support/gaps.fixture'
import { SUBJECT_ID } from '../test-support/melete.fixture'
import { getMeleteGaps, suggestResources } from './gaps.api'

const fetchMock = vi.fn()

const json = ( body: unknown, status = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'getMeleteGaps', () => {
  it( 'reads the gap view of a subject', async () => {
    fetchMock.mockResolvedValue( json( gapsFixture() ) )

    await expect( getMeleteGaps( SUBJECT_ID ) ).resolves.toEqual( gapsFixture() )
    expect( fetchMock )
      .toHaveBeenCalledWith( `/api/melete/subjects/${ SUBJECT_ID }/gaps`, undefined )
  } )

  it( 'throws the server\'s message when the syllabus is not approved', async () => {
    fetchMock.mockResolvedValue( json( { error: 'The subject has no approved syllabus' }, 409 ) )

    await expect( getMeleteGaps( SUBJECT_ID ) )
      .rejects.toThrow( 'The subject has no approved syllabus' )
  } )
} )

describe( 'suggestResources', () => {
  it( 'posts for a concept and returns the suggestions', async () => {
    fetchMock.mockResolvedValue( json( suggestionsFixture() ) )

    await expect( suggestResources( SUBJECT_ID ) ).resolves.toEqual( suggestionsFixture() )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/melete/concepts/${ SUBJECT_ID }/suggestions`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
    )
  } )

  it( 'throws the server\'s message when Claude fails', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Overloaded' }, 502 ) )

    await expect( suggestResources( SUBJECT_ID ) ).rejects.toThrow( 'Overloaded' )
  } )
} )
