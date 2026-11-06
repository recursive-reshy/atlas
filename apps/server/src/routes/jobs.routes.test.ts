// Node
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vitest'
// Shared
import {
  GetJobResponse,
  GetSourceResponse,
  Job,
  JobStatus,
  LinkSuggestionsResponse,
  ListJobsResponse,
  ListLinkSuggestionsResponse,
  UpdateDraftResponse,
} from '@atlas/shared'
// App
import { app } from '../app.js'
// Test support
import { defaultTestVaultPath, signedInRequest as request } from '../test-support/auth.js'
import { config } from '../config.js'
// Clients
import { listSummaryModels } from '../clients/anthropicModels.client.js'
// Repositories
import { clearJobs, findJobById, updateJob } from '../repositories/jobStore.repository.js'
import { setStatus } from '../repositories/linkSuggestions.repository.js'
// Services
import {
  completeAcquisition,
  completeLinking,
  completeSummary,
  failJob,
  failSummary,
  listLinkSuggestions,
  markStatus,
  queueJob,
  recordLinkRun,
  recordLinkSuggestions,
} from '../services/jobs.service.js'
// Formatters
import { formatMarkdown } from '../formatters/markdown.formatter.js'
import { formatTxt } from '../formatters/txt.formatter.js'
// Services
import { clearModelCache } from '../services/models.service.js'
import { listProfiles, resolveLinkerPrompt } from '../services/prompts.service.js'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../clients/anthropicModels.client.js' )

const youtubeUrl = 'https://www.youtube.com/watch?v=abc'

const seedJobAt = async ( status: JobStatus ): Promise< string > => {
  const { id } = await queueJob( userId, { url: youtubeUrl } )
  const steps = [ 'transcribing' ] as const

  if( status === 'queued' ) {
    return id
  }

  for( const step of steps ) {
    markStatus( userId, id, step )

    if( step === status ) {
      return id
    }
  }

  if( status === 'failed' ) {
    failJob( userId, id, 'boom' )

    return id
  }

  completeAcquisition( userId, id, { kind: 'video', ...transcriptFixture } )

  if( status === 'ready_for_review' || status === 'saved' ) {
    completeSummary( userId, id, '## Summary', [] )
  } else if( status === 'summary_failed' ) {
    failSummary( userId, id, 'Rate limited' )
  }

  if( status === 'saved' ) {
    updateJob( userId, id, { status: 'saved', source_document: null } )
  }

  return id
}

beforeEach( async () => {
  clearJobs( userId )
  clearModelCache()
  vi.mocked( listSummaryModels ).mockResolvedValue( [
    { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
    { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' },
  ] )
  await rm( defaultTestVaultPath(), { recursive: true, force: true } )
  await mkdir( defaultTestVaultPath(), { recursive: true } )
} )

describe( 'POST /api/jobs', () => {
  it( 'accepts a valid https URL with 202 and a Location header', async () => {
    const response = await request( app ).post( '/api/jobs' ).send( { url: youtubeUrl } )

    const body = response.body as { job_id: string }
    expect( response.status ).toBe( 202 )
    expect( body.job_id ).toMatch( /^[0-9a-f-]{36}$/ )
    expect( response.headers.location ).toBe( `/api/jobs/${ body.job_id }` )
  } )

  it( 'accepts a valid http URL', async () => {
    const response = await request( app ).post( '/api/jobs' ).send( { url: 'http://example.com/v' } )

    expect( response.status ).toBe( 202 )
  } )

  it( 'rejects an ftp URL with 400 and issues', async () => {
    const response = await request( app ).post( '/api/jobs' ).send( { url: 'ftp://example.com/v' } )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( {
      error: 'Invalid request',
      issues: expect.any( Array ) as unknown[],
    } )
  } )

  it( 'rejects a missing url', async () => {
    const response = await request( app ).post( '/api/jobs' ).send( {} )

    expect( response.status ).toBe( 400 )
  } )

  it( 'rejects a non-string url', async () => {
    const response = await request( app ).post( '/api/jobs' ).send( { url: 42 } )

    expect( response.status ).toBe( 400 )
  } )

  it( 'rejects a request with no body', async () => {
    const response = await request( app ).post( '/api/jobs' )

    expect( response.status ).toBe( 400 )
  } )

  it( 'rejects malformed JSON with 400 Invalid JSON', async () => {
    const response = await request( app )
      .post( '/api/jobs' )
      .set( 'content-type', 'application/json' )
      .send( '{"url":' )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( { error: 'Invalid JSON' } )
  } )

  it( 'ignores extra fields', async () => {
    const response = await request( app )
      .post( '/api/jobs' )
      .send( { url: youtubeUrl, extra: 'ignored' } )

    expect( response.status ).toBe( 202 )
  } )
} )

describe( 'GET /api/jobs', () => {
  it( 'returns an empty list when there are no jobs', async () => {
    const response = await request( app ).get( '/api/jobs' )

    expect( response.status ).toBe( 200 )
    expect( response.body ).toEqual( { jobs: [] } )
  } )

  it( 'lists active jobs newest first, without transcripts', async () => {
    const first = await queueJob( userId, { url: youtubeUrl } )
    const second = await queueJob( userId, { url: 'https://www.youtube.com/watch?v=def' } )
    markStatus( userId, second.id, 'transcribing' )

    const response = await request( app ).get( '/api/jobs' )

    const { jobs } = ListJobsResponse.parse( response.body )
    expect( response.status ).toBe( 200 )
    expect( jobs.map( ( { id } ) => id ) ).toEqual( [ second.id, first.id ] )
    expect( JSON.stringify( response.body ) ).not.toContain( 'transcript"' )
  } )

  it( 'leaves out failed jobs', async () => {
    const { id } = await queueJob( userId, { url: youtubeUrl } )
    failJob( userId, id, 'boom' )

    const response = await request( app ).get( '/api/jobs' )

    expect( response.body ).toEqual( { jobs: [] } )
  } )
} )

describe( 'GET /api/jobs/:id', () => {
  it( 'returns the queued public job after a POST', async () => {
    const created = await request( app ).post( '/api/jobs' ).send( { url: youtubeUrl } )
    const { job_id: jobId } = created.body as { job_id: string }

    const response = await request( app ).get( `/api/jobs/${ jobId }` )

    const { job } = response.body as { job: unknown }
    const parsed = Job.parse( job )
    expect( response.status ).toBe( 200 )
    expect( parsed ).toMatchObject( { id: jobId, url: youtubeUrl, status: 'queued' } )
    expect( job ).not.toHaveProperty( 'transcript' )
  } )

  it( 'returns 404 for an unknown UUID', async () => {
    const response = await request( app ).get( `/api/jobs/${ crypto.randomUUID() }` )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Job not found' } )
  } )

  it( 'returns 404 for a non-UUID id', async () => {
    const response = await request( app ).get( '/api/jobs/abc' )

    expect( response.status ).toBe( 404 )
  } )
} )

describe( 'GET /api/jobs/:id/download', () => {
  const seedReviewJob = async ( title?: string ): Promise< string > => {
    const { id } = await queueJob( userId, { url: youtubeUrl } )

    markStatus( userId, id, 'transcribing' )
    completeAcquisition( userId, id, {
      kind: 'video',
      ...transcriptFixture,
      meta: { ...transcriptFixture.meta, title: title ?? transcriptFixture.meta.title },
    } )
    completeSummary( userId, id, '## Summary', [] )

    return id
  }

  it.each( [
    [ 'md', 'text/markdown; charset=utf-8', formatMarkdown ],
    [ 'txt', 'text/plain; charset=utf-8', formatTxt ],
  ] as const )( 'downloads %s', async ( format, contentType, formatter ) => {
    const id = await seedReviewJob()

    const response = await request( app ).get( `/api/jobs/${ id }/download?format=${ format }` )

    expect( response.status ).toBe( 200 )
    expect( response.headers[ 'content-type' ] ).toBe( contentType )
    expect( response.headers[ 'content-disposition' ] ).toBe(
      `attachment; filename="Video title.${ format }"`,
    )
    expect( response.text ).toBe( formatter( transcriptFixture ) )
  } )

  it( 'defaults to Markdown', async () => {
    const id = await seedReviewJob()

    const response = await request( app ).get( `/api/jobs/${ id }/download` )

    expect( response.status ).toBe( 200 )
    expect( response.headers[ 'content-type' ] ).toBe( 'text/markdown; charset=utf-8' )
    expect( response.text ).toBe( formatMarkdown( transcriptFixture ) )
  } )

  it.each( [ 'format=pdf', 'format=md&format=srt' ] )( 'rejects ?%s with 400', async ( query ) => {
    const id = await seedReviewJob()

    const response = await request( app ).get( `/api/jobs/${ id }/download?${ query }` )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 400 for an invalid format even for an unknown id', async () => {
    const response = await request( app ).get( '/api/jobs/nope/download?format=pdf' )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 404 for an unknown id', async () => {
    const response = await request( app ).get( `/api/jobs/${ crypto.randomUUID() }/download` )

    expect( response.status ).toBe( 404 )
    expect( response.body ).toEqual( { error: 'Job not found' } )
  } )

  it( 'returns 409 for a queued job', async () => {
    const { id } = await queueJob( userId, { url: youtubeUrl } )

    const response = await request( app ).get( `/api/jobs/${ id }/download` )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Transcript not ready' } )
  } )

  it( 'encodes a non-ASCII title with filename*', async () => {
    const id = await seedReviewJob( '日本語のタイトル' )

    const response = await request( app ).get( `/api/jobs/${ id }/download?format=txt` )

    expect( response.headers[ 'content-disposition' ] ).toContain(
      `filename*=UTF-8''${ encodeURIComponent( '日本語のタイトル.txt' ) }`,
    )
  } )
} )

describe( 'GET /api/jobs/:id/source', () => {
  it( 'no longer answers on the old /transcript path', async () => {
    const id = await seedJobAt( 'ready_for_review' )

    const response = await request( app ).get( `/api/jobs/${ id }/transcript` )

    expect( response.status ).toBe( 404 )
  } )

  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'returns the source when the job is %s',
    async ( status ) => {
      const id = await seedJobAt( status )

      const response = await request( app ).get( `/api/jobs/${ id }/source` )

      expect( response.status ).toBe( 200 )
      expect( GetSourceResponse.parse( response.body ) ).toEqual( {
        source: { kind: 'video', ...transcriptFixture },
      } )
    },
  )

  it.each( [ 'queued', 'transcribing', 'summarizing', 'failed', 'saved' ] as const )(
    'returns 409 when the job is %s',
    async ( status ) => {
      const id = await seedJobAt( status )

      const response = await request( app ).get( `/api/jobs/${ id }/source` )

      expect( response.status ).toBe( 409 )
      expect( response.body ).toEqual( { error: 'Transcript not ready' } )
    },
  )

  it( 'returns 404 for an unknown job', async () => {
    const response = await request( app ).get( `/api/jobs/${ crypto.randomUUID() }/source` )

    expect( response.status ).toBe( 404 )
  } )
} )

describe( 'POST /api/jobs/:id/save', () => {
  const note = [
    '---',
    'title: "What Is RAG: A Primer"',
    'source: "x"',
    'channel: "x"',
    'duration: "x"',
    'created: 2020-01-01',
    'tags: [rag]',
    '---',
    '',
    '## Summary',
    'Edited.',
    '',
  ].join( '\n' )

  const seedDrafted = async ( target_folder?: string ): Promise< string > => {
    const id = await seedJobAt( 'ready_for_review' )

    await request( app )
      .patch( `/api/jobs/${ id }/draft` )
      .send( { note_markdown: note, ...( target_folder === undefined ? {} : { target_folder } ) } )

    return id
  }

  it( 'writes the draft into the default folder and returns its path', async () => {
    const id = await seedDrafted()

    const response = await request( app ).post( `/api/jobs/${ id }/save` )

    expect( response.status ).toBe( 200 )
    expect( response.body ).toEqual( { saved_path: 'Mnemosyne/What Is RAG A Primer.md' } )

    const written = await readFile(
      join( defaultTestVaultPath(), 'Mnemosyne/What Is RAG A Primer.md' ),
      'utf8',
    )
    expect( written ).toContain( 'title: "What Is RAG: A Primer"' )
    expect( written ).toContain( 'tags: [mnemosyne, rag]' )
    expect( written ).toContain( `created: ${ new Date().toISOString().slice( 0, 10 ) }` )
    expect( written.endsWith( '## Summary\nEdited.\n' ) ).toBe( true )
  } )

  it( 'writes into the chosen folder, creating it', async () => {
    const id = await seedDrafted( 'Learning/AI' )

    const response = await request( app ).post( `/api/jobs/${ id }/save` )

    expect( response.body ).toEqual( { saved_path: 'Learning/AI/What Is RAG A Primer.md' } )
    expect( await readFile(
      join( defaultTestVaultPath(), 'Learning/AI/What Is RAG A Primer.md' ),
      'utf8',
    ) ).toContain( 'title: "What Is RAG: A Primer"' )
  } )

  it( 'ignores a body: the stored draft is what gets saved', async () => {
    const id = await seedDrafted()

    const response = await request( app )
      .post( `/api/jobs/${ id }/save` )
      .send( { title: 'Other', tags: [], body: 'ignored' } )

    expect( response.body ).toEqual( { saved_path: 'Mnemosyne/What Is RAG A Primer.md' } )
  } )

  it( 'removes the transcript: the job is saved and downloads are refused', async () => {
    const id = await seedDrafted()
    await request( app ).post( `/api/jobs/${ id }/save` )

    const job = await request( app ).get( `/api/jobs/${ id }` )
    const download = await request( app ).get( `/api/jobs/${ id }/download` )

    expect( job.body ).toMatchObject( { job: { status: 'saved' } } )
    expect( download.status ).toBe( 409 )
  } )

  it( 'suffixes the file name when the title is already in the vault', async () => {
    const first = await seedDrafted()
    const second = await seedDrafted()

    await request( app ).post( `/api/jobs/${ first }/save` )
    const response = await request( app ).post( `/api/jobs/${ second }/save` )

    expect( response.body ).toEqual( { saved_path: 'Mnemosyne/What Is RAG A Primer (2).md' } )
  } )

  it( 'returns 400 and keeps the job in review for a stale folder', async () => {
    const id = await seedDrafted()
    updateJob( userId, id, { target_folder: '../outside' } )

    const response = await request( app ).post( `/api/jobs/${ id }/save` )
    const job = await request( app ).get( `/api/jobs/${ id }` )

    expect( response.status ).toBe( 400 )
    expect( job.body ).toMatchObject( { job: { status: 'ready_for_review' } } )
  } )

  it( 'returns 409 when the job has no draft', async () => {
    const id = await seedJobAt( 'ready_for_review' )
    updateJob( userId, id, { note_markdown: null } )

    const response = await request( app ).post( `/api/jobs/${ id }/save` )

    expect( response.status ).toBe( 409 )
  } )

  it( 'returns 404 for an unknown job', async () => {
    const response = await request( app ).post( `/api/jobs/${ crypto.randomUUID() }/save` )

    expect( response.status ).toBe( 404 )
  } )

  it.each( [ 'queued', 'summarizing', 'summary_failed', 'saved' ] as const )(
    'returns 409 when the job is %s',
    async ( status ) => {
      const id = await seedJobAt( status )

      const response = await request( app ).post( `/api/jobs/${ id }/save` )

      expect( response.status ).toBe( 409 )
    },
  )
} )

describe( 'POST /api/jobs/:id/retry-summary', () => {
  it( 'returns 202 with the job back in summarizing', async () => {
    const id = await seedJobAt( 'summary_failed' )

    const response = await request( app ).post( `/api/jobs/${ id }/retry-summary` )

    expect( response.status ).toBe( 202 )
    expect( Job.parse( ( response.body as { job: unknown } ).job ) ).toMatchObject( {
      id,
      status: 'summarizing',
      error: null,
      expires_at: null,
    } )
  } )

  it( 'returns 404 for an unknown job', async () => {
    const response = await request( app )
      .post( `/api/jobs/${ crypto.randomUUID() }/retry-summary` )

    expect( response.status ).toBe( 404 )
  } )

  it.each( [ 'queued', 'summarizing', 'ready_for_review', 'failed', 'saved' ] as const )(
    'returns 409 when the job is %s',
    async ( status ) => {
      const id = await seedJobAt( status )

      const response = await request( app ).post( `/api/jobs/${ id }/retry-summary` )

      expect( response.status ).toBe( 409 )
    },
  )
} )

describe( 'POST /api/jobs with summary options', () => {
  const codingId = (): string => listProfiles( userId )
    .find( ( { name } ) => name === 'Coding' )?.id ?? ''

  it( 'stores the model and profile on the job', async () => {
    const response = await request( app )
      .post( '/api/jobs' )
      .send( { url: youtubeUrl, model: 'claude-opus-5-5', profile_id: codingId() } )

    const { job_id: id } = response.body as { job_id: string }
    const fetched = await request( app ).get( `/api/jobs/${ id }` )
    const job = Job.parse( ( fetched.body as { job: unknown } ).job )

    expect( response.status ).toBe( 202 )
    expect( job ).toMatchObject( {
      summary_model: 'claude-opus-5-5',
      prompt_profile_id: codingId(),
      summary_usage: null,
      link_state: null,
      link_error: null,
      link_usage: null,
    } )
  } )

  it( 'leaves both null when no options are sent', async () => {
    const id = await seedJobAt( 'queued' )

    const fetched = await request( app ).get( `/api/jobs/${ id }` )
    const job = Job.parse( ( fetched.body as { job: unknown } ).job )

    expect( job ).toMatchObject( { summary_model: null, prompt_profile_id: null } )
  } )

  it.each( [
    [ 'an unknown model', { model: 'claude-nope' } ],
    [ 'an unknown profile', { profile_id: crypto.randomUUID() } ],
    [ 'a profile id that is not a uuid', { profile_id: 'x' } ],
    [ 'an empty model', { model: '' } ],
  ] )( 'returns 400 for %s and queues nothing', async ( _name, options ) => {
    const response = await request( app )
      .post( '/api/jobs' )
      .send( { url: youtubeUrl, ...options } )

    expect( response.status ).toBe( 400 )
    expect( ( await request( app ).get( '/api/jobs' ) ).body ).toEqual( { jobs: [] } )
  } )
} )

describe( 'POST /api/jobs/:id/regenerate-summary', () => {
  it( 'returns 202 with the job back in summarizing and the new choices', async () => {
    const id = await seedJobAt( 'ready_for_review' )
    const profileId = listProfiles( userId )[ 1 ]?.id ?? ''

    const response = await request( app )
      .post( `/api/jobs/${ id }/regenerate-summary` )
      .send( { model: 'claude-opus-5-5', profile_id: profileId } )

    expect( response.status ).toBe( 202 )
    expect( Job.parse( ( response.body as { job: unknown } ).job ) ).toMatchObject( {
      id,
      status: 'summarizing',
      error: null,
      expires_at: null,
      summary_model: 'claude-opus-5-5',
      prompt_profile_id: profileId,
    } )
  } )

  it( 'accepts an empty body or no body', async () => {
    const first = await seedJobAt( 'ready_for_review' )

    const response = await request( app ).post( `/api/jobs/${ first }/regenerate-summary` )

    expect( response.status ).toBe( 202 )
  } )

  it.each( [
    [ 'an unknown model', { model: 'claude-nope' } ],
    [ 'an unknown profile', { profile_id: crypto.randomUUID() } ],
    [ 'a profile id that is not a uuid', { profile_id: 'x' } ],
  ] )( 'returns 400 for %s', async ( _name, body ) => {
    const id = await seedJobAt( 'ready_for_review' )

    const response = await request( app )
      .post( `/api/jobs/${ id }/regenerate-summary` )
      .send( body )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 404 for an unknown job', async () => {
    const response = await request( app )
      .post( `/api/jobs/${ crypto.randomUUID() }/regenerate-summary` )
      .send( {} )

    expect( response.status ).toBe( 404 )
  } )

  it.each( [ 'queued', 'summarizing', 'summary_failed', 'failed', 'saved' ] as const )(
    'returns 409 when the job is %s',
    async ( status ) => {
      const id = await seedJobAt( status )

      const response = await request( app )
        .post( `/api/jobs/${ id }/regenerate-summary` )
        .send( {} )

      expect( response.status ).toBe( 409 )
    },
  )
} )

describe( 'DELETE /api/jobs/:id', () => {
  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'discards a job that is %s with 204',
    async ( status ) => {
      const id = await seedJobAt( status )

      const response = await request( app ).delete( `/api/jobs/${ id }` )

      expect( response.status ).toBe( 204 )
      expect( ( await request( app ).get( `/api/jobs/${ id }` ) ).status ).toBe( 404 )
      expect( ( await request( app ).get( '/api/jobs' ) ).body ).toEqual( { jobs: [] } )
    },
  )

  it( 'returns 404 for an unknown job', async () => {
    const response = await request( app ).delete( `/api/jobs/${ crypto.randomUUID() }` )

    expect( response.status ).toBe( 404 )
  } )

  it.each( [ 'queued', 'transcribing', 'summarizing', 'failed', 'saved' ] as const )(
    'returns 409 when the job is %s',
    async ( status ) => {
      const id = await seedJobAt( status )

      const response = await request( app ).delete( `/api/jobs/${ id }` )

      expect( response.status ).toBe( 409 )
      expect( ( await request( app ).get( `/api/jobs/${ id }` ) ).status ).toBe( 200 )
    },
  )
} )

describe( 'PATCH /api/jobs/:id/draft', () => {
  const draftNote = (): string => [
    '---',
    'title: "Edited title"',
    'source: "x"',
    'channel: "x"',
    'duration: "x"',
    'created: 2020-01-01',
    'tags: [rag]',
    '---',
    '',
    '## Edited',
    '',
  ].join( '\n' )

  it( 'stores the draft and returns the job', async () => {
    const id = await seedJobAt( 'ready_for_review' )

    const response = await request( app )
      .patch( `/api/jobs/${ id }/draft` )
      .send( { note_markdown: draftNote(), target_folder: 'Learning/AI' } )

    expect( response.status ).toBe( 200 )
    const { job } = UpdateDraftResponse.parse( response.body )

    expect( job ).toMatchObject( {
      id,
      title: 'Edited title',
      target_folder: 'Learning/AI',
      status: 'ready_for_review',
    } )
    expect( job.note_markdown ).toContain( 'tags: [mnemosyne, rag]' )
  } )

  it.each( [
    [ 'invalid YAML', { note_markdown: '---\ntitle: "A\n---\n\nx\n' } ],
    [ 'no front-matter', { note_markdown: 'just text' } ],
    [ 'an escaping folder', { target_folder: '../x' } ],
    [ 'an empty body', {} ],
  ] )( 'responds 400 for %s', async ( _label, body ) => {
    const id = await seedJobAt( 'ready_for_review' )

    const response = await request( app ).patch( `/api/jobs/${ id }/draft` ).send( body )

    expect( response.status ).toBe( 400 )
  } )

  it( 'responds 404 for an unknown job', async () => {
    const response = await request( app )
      .patch( `/api/jobs/${ crypto.randomUUID() }/draft` )
      .send( { target_folder: 'A' } )

    expect( response.status ).toBe( 404 )
  } )

  it.each( [ 'queued', 'summarizing', 'summary_failed', 'failed' ] as const )(
    'responds 409 from %s',
    async ( status ) => {
      const id = await seedJobAt( status )

      const response = await request( app )
        .patch( `/api/jobs/${ id }/draft` )
        .send( { target_folder: 'A' } )

      expect( response.status ).toBe( 409 )
    },
  )
} )

describe( 'POST /api/jobs for articles', () => {
  const articleUrl = 'https://example.com/post'
  const text = `# A pasted post\n\n${ 'Pasted words go here. '.repeat( 15 ) }`

  const jobOf = async ( id: string ): Promise< Job > => {
    const response = await request( app ).get( `/api/jobs/${ id }` )

    return GetJobResponse.parse( response.body ).job
  }

  it( 'queues an article URL as an article job', async () => {
    const response = await request( app ).post( '/api/jobs' ).send( { url: articleUrl } )

    expect( response.status ).toBe( 202 )
    expect( await jobOf( ( response.body as { job_id: string } ).job_id ) )
      .toMatchObject( { source_type: 'article', status: 'queued' } )
  } )

  it( 'lets source_type override the detected type', async () => {
    const response = await request( app )
      .post( '/api/jobs' )
      .send( { url: youtubeUrl, source_type: 'article' } )

    expect( await jobOf( ( response.body as { job_id: string } ).job_id ) )
      .toMatchObject( { source_type: 'article' } )
  } )

  it( 'stores pasted text and a title and goes straight to summarizing', async () => {
    const response = await request( app )
      .post( '/api/jobs' )
      .send( { url: articleUrl, text, title: 'My title' } )

    expect( response.status ).toBe( 202 )
    expect( await jobOf( ( response.body as { job_id: string } ).job_id ) )
      .toMatchObject( { source_type: 'article', status: 'summarizing', title: 'My title' } )
  } )

  it.each( [
    [ 'text for a detected video', { url: youtubeUrl, text: 'x'.repeat( 300 ) } ],
    [ 'a title for a detected video', { url: youtubeUrl, title: 'T' } ],
    [
      'text for an explicit video',
      { url: articleUrl, source_type: 'video', text: 'x'.repeat( 300 ) },
    ],
    [ 'text under 200 characters', { url: articleUrl, text: 'x'.repeat( 199 ) } ],
    [ 'text over 300,000 characters', { url: articleUrl, text: 'x'.repeat( 300_001 ) } ],
    [ 'an unknown source_type', { url: articleUrl, source_type: 'email' } ],
    [ 'a blank title', { url: articleUrl, text: 'x'.repeat( 300 ), title: '  ' } ],
  ] )( 'returns 400 for %s', async ( _name, body ) => {
    const response = await request( app ).post( '/api/jobs' ).send( body )

    expect( response.status ).toBe( 400 )
  } )
} )

describe( 'a request body over the limit', () => {
  it( 'returns 413 instead of a server error', async () => {
    const response = await request( app )
      .post( '/api/jobs' )
      .send( { url: 'https://example.com/post', text: 'x'.repeat( 2_500_000 ) } )

    expect( response.status ).toBe( 413 )
    expect( response.body ).toEqual( { error: 'Request body is too large' } )
  } )

  it( 'accepts the longest allowed pasted text, even in multi-byte characters', async () => {
    const response = await request( app )
      .post( '/api/jobs' )
      .send( { url: 'https://example.com/post', text: '日'.repeat( 300_000 ) } )

    expect( response.status ).toBe( 202 )
  } )
} )

describe( 'POST /api/jobs/:id/text', () => {
  const articleUrl = 'https://example.com/post'
  const text = `# A pasted post\n\n${ 'Pasted words go here. '.repeat( 15 ) }`

  const failedArticle = async (): Promise< string > => {
    const { id } = await queueJob( userId, { url: articleUrl } )
    markStatus( userId, id, 'fetching' )
    failJob( userId, id, 'The page needs a login or is paywalled' )

    return id
  }

  it( 'continues a failed article job with the pasted text', async () => {
    const id = await failedArticle()

    const response = await request( app ).post( `/api/jobs/${ id }/text` ).send( { text } )

    expect( response.status ).toBe( 200 )
    expect( GetJobResponse.parse( response.body ).job ).toMatchObject( {
      id,
      status: 'summarizing',
      error: null,
      title: 'A pasted post',
    } )
    expect( findJobById( userId, id )?.source_document ).toMatchObject( {
      kind: 'article',
      meta: { origin: 'pasted', source: articleUrl },
    } )
  } )

  it( 'accepts a title', async () => {
    const id = await failedArticle()

    const response = await request( app )
      .post( `/api/jobs/${ id }/text` )
      .send( { text, title: 'Mine' } )

    expect( GetJobResponse.parse( response.body ).job.title ).toBe( 'Mine' )
  } )

  it.each( [
    [ 'no body', {} ],
    [ 'text that is too short', { text: 'short' } ],
    [ 'a blank title', { text: 'x'.repeat( 300 ), title: ' ' } ],
  ] )( 'returns 400 for %s', async ( _name, body ) => {
    const id = await failedArticle()

    const response = await request( app ).post( `/api/jobs/${ id }/text` ).send( body )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 404 for an unknown job', async () => {
    const response = await request( app )
      .post( `/api/jobs/${ crypto.randomUUID() }/text` )
      .send( { text } )

    expect( response.status ).toBe( 404 )
  } )

  it( 'returns 409 for a failed video job', async () => {
    const id = await seedJobAt( 'failed' )

    const response = await request( app ).post( `/api/jobs/${ id }/text` ).send( { text } )

    expect( response.status ).toBe( 409 )
  } )

  it( 'returns 409 for an article job that has not failed', async () => {
    const { id } = await queueJob( userId, { url: articleUrl } )

    const response = await request( app ).post( `/api/jobs/${ id }/text` ).send( { text } )

    expect( response.status ).toBe( 409 )
  } )
} )

describe( 'GET /api/jobs/:id/download for articles', () => {
  const articleUrl = 'https://example.com/post'

  const reviewedArticle = async (): Promise< string > => {
    const { id } = await queueJob( userId, { url: articleUrl } )
    markStatus( userId, id, 'fetching' )
    completeAcquisition( userId, id, {
      kind: 'article',
      meta: {
        title: 'A post',
        source: articleUrl,
        author: null,
        site: null,
        published: null,
        fetched_at: '2026-10-18T10:00:00.000Z',
        origin: 'fetched',
      },
      markdown: 'Some text.',
    } )
    completeSummary( userId, id, '## Summary', [] )

    return id
  }

  it( 'downloads Markdown', async () => {
    const id = await reviewedArticle()

    const response = await request( app ).get( `/api/jobs/${ id }/download?format=md` )

    expect( response.status ).toBe( 200 )
    expect( response.text ).toBe( `# A post\n\n${ articleUrl }\n\nSome text.` )
  } )

  it.each( [ 'txt' ] )( 'returns 409 for %s', async ( format ) => {
    const id = await reviewedArticle()

    const response = await request( app ).get( `/api/jobs/${ id }/download?format=${ format }` )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Only Markdown is available for articles' } )
  } )

  it( 'serves the source as an article document', async () => {
    const id = await reviewedArticle()

    const response = await request( app ).get( `/api/jobs/${ id }/source` )

    expect( GetSourceResponse.parse( response.body ).source ).toMatchObject( { kind: 'article' } )
  } )
} )

describe( 'link suggestion routes', () => {
  const agent = { url: 'http://agent:8100', secret: 'x'.repeat( 32 ), timeoutMs: 1000 }

  beforeEach( () => {
    config.agent = agent
  } )

  afterEach( () => {
    config.agent = null
  } )

  const reviewed = async (): Promise< { id: string, ids: string[] } > => {
    const id = await seedJobAt( 'transcribing' )
    completeAcquisition( userId, id, { kind: 'video', ...transcriptFixture } )
    completeSummary( userId, id, '## Summary\n\nAbout pricing.', [] )

    const runId = recordLinkRun( userId, id, {
      model: 'claude-haiku-5-5',
      promptVersionId: resolveLinkerPrompt( userId ).version.id,
      usage: undefined,
    } )

    recordLinkSuggestions( userId, id, runId, [
      { target: 'Alpha', kind: 'new_concept', anchor: 'pricing', reason: 'Because.' },
      { target: 'Beta', kind: 'existing_note', anchor: null, reason: 'Also.' },
    ] )
    completeLinking( userId, id )

    return { id, ids: listLinkSuggestions(
      userId,
      id,
    ).map( ( { id: suggestionId } ) => suggestionId ) }
  }

  const noteWith = ( id: string, target: string ): string => {
    return `${ findJobById( userId, id )?.note_markdown ?? '' }\n- [[${ target }]]\n`
  }

  describe( 'GET /api/jobs/:id/link-suggestions', () => {
    it( 'lists the suggestions by position', async () => {
      const { id } = await reviewed()

      const response = await request( app ).get( `/api/jobs/${ id }/link-suggestions` )

      expect( response.status ).toBe( 200 )
      expect( ListLinkSuggestionsResponse.parse( response.body ).suggestions
        .map( ( { target, status } ) => ( { target, status } ) ) )
        .toEqual( [
          { target: 'Alpha', status: 'pending' },
          { target: 'Beta', status: 'pending' },
        ] )
    } )

    it( 'leaves superseded suggestions out', async () => {
      const { id, ids } = await reviewed()
      setStatus( userId, [ ids[ 0 ] ?? '' ], 'superseded', '2026-10-21T10:00:00.000Z' )

      const response = await request( app ).get( `/api/jobs/${ id }/link-suggestions` )

      expect( ListLinkSuggestionsResponse.parse( response.body ).suggestions ).toHaveLength( 1 )
    } )

    it( 'responds 404 for an unknown job and 400 for an id that is not a uuid', async () => {
      expect( ( await request( app )
        .get( `/api/jobs/${ crypto.randomUUID() }/link-suggestions` ) ).status ).toBe( 404 )
      expect( ( await request( app ).get( '/api/jobs/nope/link-suggestions' ) ).status )
        .toBe( 400 )
    } )
  } )

  describe( 'POST /api/jobs/:id/link-suggestions/accept', () => {
    it( 'stores the note and the decision and returns both', async () => {
      const { id, ids } = await reviewed()

      const response = await request( app )
        .post( `/api/jobs/${ id }/link-suggestions/accept` )
        .send( { ids: [ ids[ 0 ] ], note_markdown: noteWith( id, 'Alpha' ) } )

      expect( response.status ).toBe( 200 )
      const body = LinkSuggestionsResponse.parse( response.body )

      expect( body.job.note_markdown ).toContain( '- [[Alpha]]' )
      expect( body.suggestions.map( ( { status } ) => status ) )
        .toEqual( [ 'accepted', 'pending' ] )
    } )

    it.each( [
      [ 'no ids', () => ( { ids: [], note_markdown: 'x' } ) ],
      [ 'ids that are not uuids', () => ( { ids: [ 'x' ], note_markdown: 'x' } ) ],
      [ 'no note', ( ids: string[] ) => ( { ids: [ ids[ 0 ] ] } ) ],
      [
        'an invalid note',
        ( ids: string[] ) => ( { ids: [ ids[ 0 ] ], note_markdown: 'no front-matter' } ),
      ],
    ] )( 'responds 400 for %s', async ( _label, makeBody ) => {
      const { id, ids } = await reviewed()

      const response = await request( app )
        .post( `/api/jobs/${ id }/link-suggestions/accept` )
        .send( makeBody( ids ) )

      expect( response.status ).toBe( 400 )
    } )

    it( 'responds 409 for a suggestion that is not pending', async () => {
      const { id } = await reviewed()

      const response = await request( app )
        .post( `/api/jobs/${ id }/link-suggestions/accept` )
        .send( { ids: [ crypto.randomUUID() ], note_markdown: noteWith( id, 'Alpha' ) } )

      expect( response.status ).toBe( 409 )
    } )

    it( 'responds 404 for an unknown job', async () => {
      const response = await request( app )
        .post( `/api/jobs/${ crypto.randomUUID() }/link-suggestions/accept` )
        .send( { ids: [ crypto.randomUUID() ], note_markdown: 'x' } )

      expect( response.status ).toBe( 404 )
    } )
  } )

  describe( 'POST /api/jobs/:id/link-suggestions/reject', () => {
    it( 'rejects and returns the job and the suggestions', async () => {
      const { id, ids } = await reviewed()

      const response = await request( app )
        .post( `/api/jobs/${ id }/link-suggestions/reject` )
        .send( { ids } )

      expect( response.status ).toBe( 200 )
      expect( LinkSuggestionsResponse.parse( response.body ).suggestions
        .map( ( { status } ) => status ) ).toEqual( [ 'rejected', 'rejected' ] )
    } )

    it( 'responds 400 for no ids, 409 for a decided one, 404 for an unknown job', async () => {
      const { id, ids } = await reviewed()
      setStatus( userId, [ ids[ 0 ] ?? '' ], 'accepted', '2026-10-21T10:00:00.000Z' )

      expect( ( await request( app )
        .post( `/api/jobs/${ id }/link-suggestions/reject` ).send( { ids: [] } ) ).status )
        .toBe( 400 )
      expect( ( await request( app )
        .post( `/api/jobs/${ id }/link-suggestions/reject` )
        .send( { ids: [ ids[ 0 ] ] } ) ).status ).toBe( 409 )
      expect( ( await request( app )
        .post( `/api/jobs/${ crypto.randomUUID() }/link-suggestions/reject` )
        .send( { ids } ) ).status ).toBe( 404 )
    } )
  } )

  describe( 'POST /api/jobs/:id/linking', () => {
    it( 'queues linking with 202 and the job, with no body', async () => {
      const { id } = await reviewed()

      const response = await request( app ).post( `/api/jobs/${ id }/linking` )

      expect( response.status ).toBe( 202 )
      expect( GetJobResponse.parse( response.body ).job )
        .toMatchObject( { id, status: 'linking', link_state: 'pending' } )
    } )

    it( 'saves the note it is sent', async () => {
      const { id } = await reviewed()

      const response = await request( app )
        .post( `/api/jobs/${ id }/linking` )
        .send( { note_markdown: noteWith( id, 'Alpha' ) } )

      expect( response.status ).toBe( 202 )
      expect( GetJobResponse.parse( response.body ).job.note_markdown )
        .toContain( '- [[Alpha]]' )
    } )

    it( 'responds 400, 409 or 404 for a bad note, a wrong state or an unknown job', async () => {
      const { id } = await reviewed()

      expect( ( await request( app ).post( `/api/jobs/${ id }/linking` )
        .send( { note_markdown: 'nope' } ) ).status ).toBe( 400 )

      config.agent = null
      expect( ( await request( app ).post( `/api/jobs/${ id }/linking` ) ).status ).toBe( 409 )

      config.agent = agent
      updateJob( userId, id, { status: 'summarizing' } )
      expect( ( await request( app ).post( `/api/jobs/${ id }/linking` ) ).status ).toBe( 409 )

      expect( ( await request( app )
        .post( `/api/jobs/${ crypto.randomUUID() }/linking` ) ).status ).toBe( 404 )
    } )
  } )
} )
