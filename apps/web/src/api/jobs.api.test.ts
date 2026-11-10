// Shared
import type { DownloadFormat } from '@atlas/shared'
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
import { jobFixture } from '../test-support/job.fixture'
import { ApiError } from '../lib/apiError'
import {
  createJob,
  discardJob,
  downloadUrl,
  getJob,
  getSource,
  submitPastedText,
  listJobs,
  regenerateSummary,
  retrySummary,
  saveJob,
  updateDraft,
} from './jobs.api'

const fetchMock = vi.fn()
const EMPTY_JSON = { headers: { 'Content-Type': 'application/json' }, body: '{}' }
const jobId = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b'

const jsonResponse = ( body: unknown, status: number ): Response => {
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

describe( 'createJob', () => {
  const url = 'https://www.youtube.com/watch?v=cFoaK1OQRhw'

  it( 'posts the url as JSON', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { job_id: jobId }, 202 ) )

    await createJob( { url } )

    expect( fetchMock ).toHaveBeenCalledWith( '/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { url } ),
    } )
  } )

  it( 'sends the source type, pasted text and title when the body has them', async () => {
    fetchMock.mockImplementation( () => Promise.resolve( jsonResponse( { job_id: jobId }, 202 ) ) )
    const body = { url, source_type: 'article' as const, text: 'x'.repeat( 300 ), title: 'T' }

    await createJob( body )

    expect( fetchMock.mock.calls[ 0 ]?.[ 1 ] ).toMatchObject( { body: JSON.stringify( body ) } )
  } )

  it( 'adds the model and profile only when they are given', async () => {
    fetchMock.mockImplementation( () => Promise.resolve( jsonResponse( { job_id: jobId }, 202 ) ) )

    await createJob( { url, model: 'claude-opus-5-5', profile_id: jobId } )
    await createJob( { url } )

    expect( fetchMock.mock.calls[ 0 ]?.[ 1 ] ).toMatchObject( {
      body: JSON.stringify( { url, model: 'claude-opus-5-5', profile_id: jobId } ),
    } )
    expect( fetchMock.mock.calls[ 1 ]?.[ 1 ] ).toMatchObject( { body: JSON.stringify( { url } ) } )
  } )

  it( 'returns the job id', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { job_id: jobId }, 202 ) )

    await expect( createJob( { url } ) ).resolves.toBe( jobId )
  } )

  it( 'uses the server error message on a non-2xx response', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { error: 'Invalid request', issues: [] }, 400 ) )

    const error = await rejection( createJob( { url } ) )

    expect( error.message ).toBe( 'Invalid request' )
    expect( error.status ).toBe( 400 )
  } )

  it( 'falls back to the status when the error body is not parseable', async () => {
    fetchMock.mockResolvedValue( new Response( 'boom', { status: 500 } ) )

    const error = await rejection( createJob( { url } ) )

    expect( error.message ).toBe( 'Request failed with status 500' )
    expect( error.status ).toBe( 500 )
  } )

  it( 'reports an unreachable server', async () => {
    fetchMock.mockRejectedValue( new TypeError( 'Failed to fetch' ) )

    const error = await rejection( createJob( { url } ) )

    expect( error.message ).toBe( 'Could not reach the server' )
    expect( error.status ).toBeNull()
  } )

  it( 'rejects a 2xx response without a job id', async () => {
    fetchMock.mockResolvedValue( jsonResponse( {}, 202 ) )

    const error = await rejection( createJob( { url } ) )

    expect( error.message ).toBe( 'Unexpected response from the server' )
    expect( error.status ).toBe( 202 )
  } )
} )

describe( 'getJob', () => {
  it( 'requests the job with its id encoded', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { job: jobFixture() }, 200 ) )

    await getJob( 'a/b' )

    expect( fetchMock.mock.calls[ 0 ]?.[ 0 ] ).toBe( '/api/jobs/a%2Fb' )
  } )

  it( 'returns the parsed job', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { job: jobFixture() }, 200 ) )

    await expect( getJob( jobId ) ).resolves.toEqual( jobFixture() )
  } )

  it( 'uses the server error message for a missing job', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { error: 'Job not found' }, 404 ) )

    const error = await rejection( getJob( jobId ) )

    expect( error.message ).toBe( 'Job not found' )
    expect( error.status ).toBe( 404 )
  } )

  it( 'rejects a job that does not match the schema', async () => {
    const job = { ...jobFixture(), status: 'exploded' }
    fetchMock.mockResolvedValue( jsonResponse( { job }, 200 ) )

    const error = await rejection( getJob( jobId ) )

    expect( error.message ).toBe( 'Unexpected response from the server' )
  } )
} )

const transcript = {
  meta: {
    title: 'A talk',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration_seconds: 60,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'large-v3-turbo',
  },
  text: 'Hello.',
}

describe( 'listJobs', () => {
  it( 'requests the list and returns the parsed jobs', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { jobs: [ jobFixture() ] }, 200 ) )

    await expect( listJobs() ).resolves.toEqual( [ jobFixture() ] )
    expect( fetchMock.mock.calls[ 0 ]?.[ 0 ] ).toBe( '/api/jobs' )
    expect( fetchMock.mock.calls[ 0 ]?.[ 1 ] ).toBeUndefined()
  } )

  it( 'rejects a malformed list', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { jobs: [ { id: 1 } ] }, 200 ) )

    const error = await rejection( listJobs() )

    expect( error.message ).toBe( 'Unexpected response from the server' )
  } )
} )

describe( 'getSource', () => {
  it( 'requests the source with the id encoded and returns it', async () => {
    const source = { kind: 'video', ...transcript }
    fetchMock.mockResolvedValue( jsonResponse( { source }, 200 ) )

    await expect( getSource( 'a/b' ) ).resolves.toEqual( source )
    expect( fetchMock.mock.calls[ 0 ]?.[ 0 ] ).toBe( '/api/jobs/a%2Fb/source' )
  } )

  it( 'returns an article source', async () => {
    const article = {
      kind: 'article',
      meta: {
        title: 'A post',
        source: 'https://example.com/post',
        author: null,
        site: null,
        published: null,
        fetched_at: '2026-10-18T10:00:00.000Z',
        origin: 'fetched',
      },
      markdown: 'Text',
    }

    fetchMock.mockResolvedValue( jsonResponse( { source: article }, 200 ) )

    await expect( getSource( jobId ) ).resolves.toEqual( article )
  } )

  it( 'uses the server message when the transcript is not ready', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { error: 'Transcript not ready' }, 409 ) )

    const error = await rejection( getSource( jobId ) )

    expect( error.message ).toBe( 'Transcript not ready' )
    expect( error.status ).toBe( 409 )
  } )

  it( 'rejects a malformed source', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { source: { kind: 'video', meta: {} } }, 200 ) )

    const error = await rejection( getSource( jobId ) )

    expect( error.message ).toBe( 'Unexpected response from the server' )
  } )
} )

describe( 'updateDraft', () => {
  const draft = { note_markdown: '---\n---\n', target_folder: 'Learning/AI' }

  it( 'patches the draft as JSON and returns the job', async () => {
    const job = jobFixture( { status: 'ready_for_review', note_markdown: 'x' } )
    fetchMock.mockResolvedValue( jsonResponse( { job }, 200 ) )

    await expect( updateDraft( 'a/b', draft ) ).resolves.toEqual( job )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/jobs/a%2Fb/draft', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( draft ),
    } )
  } )

  it( 'uses the server message for invalid front-matter', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse( { error: 'front-matter invalid: bad YAML' }, 400 ),
    )

    const error = await rejection( updateDraft( jobId, draft ) )

    expect( error.message ).toBe( 'front-matter invalid: bad YAML' )
    expect( error.status ).toBe( 400 )
  } )

  it( 'uses the server message when the job is no longer in review', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { error: 'Cannot move job' }, 409 ) )

    const error = await rejection( updateDraft( jobId, draft ) )

    expect( error.status ).toBe( 409 )
  } )

  it( 'rejects a response without a job', async () => {
    fetchMock.mockResolvedValue( jsonResponse( {}, 200 ) )

    const error = await rejection( updateDraft( jobId, draft ) )

    expect( error.message ).toBe( 'Unexpected response from the server' )
  } )
} )

describe( 'saveJob', () => {
  it( 'posts with no body and returns the saved path', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { saved_path: 'Mnemosyne/A talk.md' }, 200 ) )

    await expect( saveJob( 'a/b' ) ).resolves.toBe( 'Mnemosyne/A talk.md' )
    expect( fetchMock ).toHaveBeenCalledWith(
      '/api/jobs/a%2Fb/save',
      { method: 'POST', ...EMPTY_JSON },
    )
  } )

  it( 'uses the server message when the job cannot be saved', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse( { error: 'Cannot move job from saved to saved' }, 409 ),
    )

    const error = await rejection( saveJob( jobId ) )

    expect( error.message ).toBe( 'Cannot move job from saved to saved' )
    expect( error.status ).toBe( 409 )
  } )

  it( 'reports an unreachable server', async () => {
    fetchMock.mockRejectedValue( new TypeError( 'Failed to fetch' ) )

    const error = await rejection( saveJob( jobId ) )

    expect( error.message ).toBe( 'Could not reach the server' )
  } )

  it( 'rejects a response without a saved path', async () => {
    fetchMock.mockResolvedValue( jsonResponse( {}, 200 ) )

    const error = await rejection( saveJob( jobId ) )

    expect( error.message ).toBe( 'Unexpected response from the server' )
  } )
} )

describe( 'retrySummary', () => {
  it( 'posts to the retry endpoint and returns the job', async () => {
    const job = jobFixture( { status: 'summarizing' } )
    fetchMock.mockResolvedValue( jsonResponse( { job }, 202 ) )

    await expect( retrySummary( 'a/b' ) ).resolves.toEqual( job )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/jobs/a%2Fb/retry-summary', {
      method: 'POST',
      ...EMPTY_JSON,
    } )
  } )

  it( 'uses the server message on a conflict', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse( { error: 'Cannot move job from queued to summarizing' }, 409 ),
    )

    const error = await rejection( retrySummary( jobId ) )

    expect( error.status ).toBe( 409 )
    expect( error.message ).toBe( 'Cannot move job from queued to summarizing' )
  } )
} )

describe( 'discardJob', () => {
  it( 'sends DELETE and resolves with nothing on 204', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await expect( discardJob( 'a/b' ) ).resolves.toBeUndefined()
    expect( fetchMock ).toHaveBeenCalledWith(
      '/api/jobs/a%2Fb',
      { method: 'DELETE', ...EMPTY_JSON },
    )
  } )

  it( 'uses the server message for a missing job', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { error: 'Job not found' }, 404 ) )

    const error = await rejection( discardJob( jobId ) )

    expect( error.message ).toBe( 'Job not found' )
    expect( error.status ).toBe( 404 )
  } )

  it( 'reports an unreachable server', async () => {
    fetchMock.mockRejectedValue( new TypeError( 'Failed to fetch' ) )

    const error = await rejection( discardJob( jobId ) )

    expect( error.message ).toBe( 'Could not reach the server' )
  } )
} )

describe( 'downloadUrl', () => {
  it.each< DownloadFormat >( [ 'md', 'txt' ] )( 'builds the %s link', ( format ) => {
    expect( downloadUrl( 'a/b', format ) ).toBe( `/api/jobs/a%2Fb/download?format=${ format }` )
  } )
} )

describe( 'regenerateSummary', () => {
  it( 'posts the choices to the job and returns the job', async () => {
    const job = jobFixture( { status: 'summarizing' } )
    fetchMock.mockResolvedValue( jsonResponse( { job }, 202 ) )

    await expect( regenerateSummary( 'a/b', { model: 'claude-opus-5-5' } ) ).resolves.toEqual( job )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/jobs/a%2Fb/regenerate-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { model: 'claude-opus-5-5' } ),
    } )
  } )

  it( 'uses the server message when the job is not in review', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse( { error: 'Cannot move job from queued to summarizing' }, 409 ),
    )

    await expect( regenerateSummary( jobId, {} ) )
      .rejects.toThrow( 'Cannot move job from queued to summarizing' )
  } )
} )

describe( 'submitPastedText', () => {
  const text = 'x'.repeat( 300 )

  it( 'posts the text and title to the job and returns the job', async () => {
    const summarizing = jobFixture( { status: 'summarizing' } )
    fetchMock.mockResolvedValue( jsonResponse( { job: summarizing }, 200 ) )

    const job = await submitPastedText( 'a/b', { text, title: 'T' } )

    expect( job ).toEqual( summarizing )
    expect( fetchMock.mock.calls[ 0 ]?.[ 0 ] ).toBe( '/api/jobs/a%2Fb/text' )
    expect( fetchMock.mock.calls[ 0 ]?.[ 1 ] ).toMatchObject( {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { text, title: 'T' } ),
    } )
  } )

  it.each( [
    [ 400, 'Invalid request' ],
    [ 404, 'Job not found' ],
    [ 409, 'Pasted text can only continue a failed article job' ],
  ] )( 'uses the server message and status for a %s', async ( status, message ) => {
    fetchMock.mockResolvedValue( jsonResponse( { error: message }, status ) )

    const error = await rejection( submitPastedText( jobId, { text } ) )

    expect( error.message ).toBe( message )
    expect( error.status ).toBe( status )
  } )

  it( 'rejects a malformed response', async () => {
    fetchMock.mockResolvedValue( jsonResponse( { job: { id: 1 } }, 200 ) )

    const error = await rejection( submitPastedText( jobId, { text } ) )

    expect( error.message ).toBe( 'Unexpected response from the server' )
  } )
} )
