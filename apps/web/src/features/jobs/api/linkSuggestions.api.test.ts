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
import { jobFixture } from '../fixtures/job.fixture'
import { linkSuggestionFixture, SUGGESTION_ID } from '../fixtures/linkSuggestion.fixture'
import { ApiError } from '#src/lib/apiError'
import {
  acceptLinkSuggestions,
  listLinkSuggestions,
  rejectLinkSuggestions,
  runLinking,
} from './linkSuggestions.api'

const fetchMock = vi.fn()
const jobId = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b'
const jsonInit = ( body: unknown ): RequestInit => ( {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify( body ),
} )

const jsonResponse = ( body: unknown, status = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

const rejection = async ( promise: Promise< unknown > ): Promise< ApiError > => {
  const error: unknown = await promise.then( () => null, ( reason: unknown ) => reason )
  expect( error ).toBeInstanceOf( ApiError )
  return error as ApiError
}

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'listLinkSuggestions', () => {
  it( 'gets the suggestions of the job', async () => {
    const suggestion = linkSuggestionFixture()
    fetchMock.mockResolvedValue( jsonResponse( { suggestions: [ suggestion ] } ) )

    const result = await listLinkSuggestions( jobId )

    expect( fetchMock ).toHaveBeenCalledWith( `/api/jobs/${ jobId }/link-suggestions`, undefined )
    expect( result ).toEqual( [ suggestion ] )
  } )

  it( 'rejects a reply that is not a list of suggestions', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { suggestions: [ { id: 'x' } ] } ) )

    const error = await rejection( listLinkSuggestions( jobId ) )

    expect( error.message ).toBe( 'Unexpected response from the server' )
  } )

  it( 'throws the server message on an error status', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { error: 'Job not found' }, 404 ) )

    const error = await rejection( listLinkSuggestions( jobId ) )

    expect( error ).toMatchObject( { message: 'Job not found', status: 404 } )
  } )
} )

describe( 'acceptLinkSuggestions', () => {
  it( 'posts the ids and the resulting note, and returns the job and suggestions', async () => {
    const job = jobFixture( { status: 'ready_for_review', note_markdown: 'Note\n' } )
    const suggestion = linkSuggestionFixture( { status: 'accepted' } )
    fetchMock.mockResolvedValue( jsonResponse( { job, suggestions: [ suggestion ] } ) )
    const body = { ids: [ SUGGESTION_ID ], note_markdown: 'Note\n' }

    const result = await acceptLinkSuggestions( jobId, body )

    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/jobs/${ jobId }/link-suggestions/accept`,
      jsonInit( body ),
    )
    expect( result ).toEqual( { job, suggestions: [ suggestion ] } )
  } )

  it( 'throws the server message on a conflict', async () => {
    const conflict = { error: 'Link suggestion x is not pending' }
    fetchMock.mockResolvedValue( jsonResponse( conflict, 409 ) )

    const error = await rejection(
      acceptLinkSuggestions( jobId, { ids: [ SUGGESTION_ID ], note_markdown: '' } ),
    )

    expect( error ).toMatchObject( { message: 'Link suggestion x is not pending', status: 409 } )
  } )
} )

describe( 'rejectLinkSuggestions', () => {
  it( 'posts the ids only', async () => {
    const job = jobFixture( { status: 'ready_for_review' } )
    fetchMock.mockResolvedValue( jsonResponse( { job, suggestions: [] } ) )

    const result = await rejectLinkSuggestions( jobId, { ids: [ SUGGESTION_ID ] } )

    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/jobs/${ jobId }/link-suggestions/reject`,
      jsonInit( { ids: [ SUGGESTION_ID ] } ),
    )
    expect( result ).toEqual( { job, suggestions: [] } )
  } )
} )

describe( 'runLinking', () => {
  it( 'posts the editor text and returns the linking job', async () => {
    const job = jobFixture( { status: 'linking', link_state: 'pending' } )
    fetchMock.mockResolvedValue( jsonResponse( { job }, 202 ) )

    const result = await runLinking( jobId, { note_markdown: 'Note\n' } )

    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/jobs/${ jobId }/linking`,
      jsonInit( { note_markdown: 'Note\n' } ),
    )
    expect( result ).toEqual( job )
  } )

  it( 'posts an empty body when there is no text', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { job: jobFixture( { status: 'linking' } ) }, 202 ) )

    await runLinking( jobId, {} )

    expect( fetchMock ).toHaveBeenCalledWith( `/api/jobs/${ jobId }/linking`, jsonInit( {} ) )
  } )

  it( 'throws the server message when linking is not configured', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { error: 'Linking isn\'t configured' }, 409 ) )

    const error = await rejection( runLinking( jobId, {} ) )

    expect( error.message ).toBe( 'Linking isn\'t configured' )
  } )
} )
