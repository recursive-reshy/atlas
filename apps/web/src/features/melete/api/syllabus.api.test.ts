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
import { meleteSubjectFixture, SUBJECT_ID } from '../fixtures/melete.fixture'
import { DIFF, syllabusFixture } from '../fixtures/syllabus.fixture'
import {
  approveMeleteSyllabus,
  draftMeleteSyllabus,
  getMeleteSyllabus,
  saveMeleteSyllabus,
} from './syllabus.api'

const fetchMock = vi.fn()

const json = ( body: unknown, status = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

const base = `/api/melete/subjects/${ SUBJECT_ID }/syllabus`

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'the syllabus api', () => {
  it( 'gets the syllabus and rejects a response of the wrong shape', async () => {
    fetchMock.mockResolvedValueOnce( json( syllabusFixture() ) )

    await expect( getMeleteSyllabus( SUBJECT_ID ) ).resolves.toEqual( syllabusFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( base, undefined )

    fetchMock.mockResolvedValueOnce( json( { sections: [ { name: 'No id', concepts: [] } ] } ) )
    await expect( getMeleteSyllabus( SUBJECT_ID ) ).rejects.toThrow(
      'Unexpected response from the server',
    )
  } )

  it( 'puts the whole edited syllabus and returns it with the diff', async () => {
    const edit = { sections: [ { name: 'New', concepts: [ { name: 'Views', description: '' } ] } ] }

    fetchMock.mockResolvedValue( json( { syllabus: syllabusFixture(), diff: DIFF } ) )

    await expect( saveMeleteSyllabus( SUBJECT_ID, edit ) )
      .resolves.toEqual( { syllabus: syllabusFixture(), diff: DIFF } )
    expect( fetchMock ).toHaveBeenCalledWith( base, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( edit ),
    } )
  } )

  it.each( [
    [ 'drafts', draftMeleteSyllabus, '/draft' ],
    [ 'approves', approveMeleteSyllabus, '/approve' ],
  ] as const )( '%s a syllabus and returns the subject', async ( _name, call, tail ) => {
    const subject = meleteSubjectFixture( { syllabus_status: 'drafting' } )

    fetchMock.mockResolvedValue( json( { subject }, 202 ) )

    await expect( call( SUBJECT_ID ) ).resolves.toEqual( subject )
    expect( fetchMock ).toHaveBeenCalledWith( `${ base }${ tail }`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    } )
  } )

  it( 'throws the server message on an error', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Choose a target level first' }, 400 ) )

    await expect( draftMeleteSyllabus( SUBJECT_ID ) )
      .rejects.toThrow( 'Choose a target level first' )
  } )
} )
