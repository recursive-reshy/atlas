// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Shared
import { JobStatus, VideoSource } from '@atlas/shared'
// Config
// Errors
import { ConflictError, NotFoundError } from '../errors.js'
// Repositories
import { clearJobs, updateJob } from '../repositories/jobStore.repository.js'

// Services
import {
  completeSummary,
  completeAcquisition,
  failJob,
  failSummary,
  markStatus,
  queueJob,
} from './jobs.service.js'

import { findSource, getSource, renderTranscript } from './jobRender.service.js'
// Models
import { assertKnownModel } from './models.service.js'
// Prompts

// Clients
import { existingFolderSync, writeNote } from '../clients/vault.client.js'
// Formatters
import { formatMarkdown } from '../formatters/markdown.formatter.js'
import { formatTxt } from '../formatters/txt.formatter.js'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'
// Repositories
// Logging
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../clients/vault.client.js' )
vi.mock( './models.service.js' )
vi.mock( '../repositories/linkSuggestions.repository.js', async ( importOriginal ) => {
  const original = await importOriginal<
    typeof import( '../repositories/linkSuggestions.repository.js' )
  >()

  return { ...original, setStatus: vi.fn( original.setStatus ) }
} )

const writeNoteMock = vi.mocked( writeNote )
const existingFolderSyncMock = vi.mocked( existingFolderSync )
const assertKnownModelMock = vi.mocked( assertKnownModel )

const url = 'https://www.youtube.com/watch?v=abc'
const startTime = new Date( '2026-10-14T10:00:00.000Z' )

const transcript: Pick< VideoSource, 'meta' | 'text' > = {
  meta: {
    title: 'A talk',
    source: url,
    channel: 'Some Channel',
    duration_seconds: 60,
    transcribed_at: '2026-10-14T10:04:00.000Z',
    model: 'large-v3',
  },
  text: 'Hello',
}

const queueJobAt = async ( status: JobStatus ): Promise< string > => {
  const { id } = await queueJob( userId, { url } )

  if( status !== 'queued' ) {
    markStatus( userId, id, 'transcribing' )
  }
  if( status === 'ready_for_review' || status === 'summary_failed' ) {
    completeAcquisition( userId, id, { kind: 'video', ...transcript } )

    if( status === 'ready_for_review' ) {
      completeSummary( userId, id, '## Summary', [] )
    } else {
      failSummary( userId, id, 'earlier summary failure' )
    }
  }
  if( status === 'failed' ) failJob( userId, id, 'earlier failure' )

  return id
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( startTime )
  clearJobs( userId )
  writeNoteMock.mockReset()
  writeNoteMock.mockResolvedValue( 'Mnemosyne/Edited title.md' )
  existingFolderSyncMock.mockReset()
  existingFolderSyncMock.mockReturnValue( true )
  assertKnownModelMock.mockReset()
  assertKnownModelMock.mockResolvedValue( undefined )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'renderTranscript', () => {
  const queueReviewJob = async (
    outcome: 'ready_for_review' | 'summary_failed',
  ): Promise< string > => {
    const { id } = await queueJob( userId, { url } )

    markStatus( userId, id, 'transcribing' )
    completeAcquisition( userId, id, { kind: 'video', ...transcriptFixture } )

    if( outcome === 'ready_for_review' ) {
      completeSummary( userId, id, '## Summary', [] )
    } else {
      failSummary( userId, id, 'Rate limited' )
    }

    return id
  }

  it.each( [
    [ 'md', 'Video title.md', 'text/markdown; charset=utf-8', formatMarkdown ],
    [ 'txt', 'Video title.txt', 'text/plain; charset=utf-8', formatTxt ],
  ] as const )(
    'renders a review job as %s',
    async ( format, filename, contentType, formatter ) => {
      const id = await queueReviewJob( 'ready_for_review' )

      const rendered = renderTranscript( userId, id, format )

      expect( rendered ).toEqual( {
        filename,
        contentType,
        body: formatter( transcriptFixture ),
      } )
    },
  )

  it( 'still renders after the summary failed', async () => {
    const id = await queueReviewJob( 'summary_failed' )

    expect( renderTranscript( userId, id, 'md' ).body ).toBe( formatMarkdown( transcriptFixture ) )
  } )

  it( 'throws ConflictError once the job is saved', async () => {
    const id = await queueReviewJob( 'ready_for_review' )
    updateJob( userId, id, { status: 'saved', source_document: null } )

    expect( () => renderTranscript( userId, id, 'md' ) ).toThrow(
      new ConflictError( 'Transcript not ready' ),
    )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => renderTranscript( userId, 'missing', 'md' ) ).toThrow( NotFoundError )
  } )

  it.each( [
    'queued',
    'transcribing',
    'summarizing',
    'failed',
  ] as const )(
    'throws ConflictError from %s',
    async ( status ) => {
      const id = status === 'summarizing' ? await queueSummarizing() : await queueJobAt( status )

      expect( () => renderTranscript( userId, id, 'md' ) ).toThrow(
        new ConflictError( 'Transcript not ready' ),
      )
    },
  )
} )

const queueSummarizing = async (): Promise< string > => {
  const id = await queueJobAt( 'transcribing' )
  completeAcquisition( userId, id, { kind: 'video', ...transcript } )

  return id
}

describe( 'getSource', () => {
  it( 'returns the stored transcript', async () => {
    const id = await queueSummarizing()

    expect( getSource( userId, id ) ).toEqual( { kind: 'video', ...transcript } )
  } )

  it( 'throws NotFoundError for an unknown job', () => {
    expect( () => getSource( userId, 'missing' ) ).toThrow( NotFoundError )
  } )

  it( 'throws when the job has no transcript', async () => {
    const { id } = await queueJob( userId, { url } )

    expect( () => getSource( userId, id ) ).toThrow( 'has no transcript' )
  } )
} )

describe( 'findSource', () => {
  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'returns the transcript when the job is %s',
    async ( status ) => {
      const id = await queueJobAt( status )

      expect( findSource( userId, id ) ).toEqual( { kind: 'video', ...transcript } )
    },
  )

  it( 'throws ConflictError while summarizing', async () => {
    const id = await queueSummarizing()

    expect( () => findSource( userId, id ) ).toThrow( new ConflictError( 'Transcript not ready' ) )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => findSource( userId, 'missing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'renderTranscript for articles', () => {
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

  it( 'renders Markdown as the title, the source URL and the text', async () => {
    const id = await reviewedArticle()

    expect( renderTranscript( userId, id, 'md' ) ).toMatchObject( {
      contentType: 'text/markdown; charset=utf-8',
      body: `# A post\n\n${ articleUrl }\n\nSome text.`,
    } )
  } )

  it.each( [ 'txt' ] as const )( 'refuses %s', async ( format ) => {
    const id = await reviewedArticle()

    expect( () => renderTranscript( userId, id, format ) )
      .toThrow( new ConflictError( 'Only Markdown is available for articles' ) )
  } )
} )
