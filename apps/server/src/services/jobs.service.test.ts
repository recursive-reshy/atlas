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
import {
  JobStatus,
  SourceDocument,
  VideoSource,
  parseNote,
} from '@atlas/shared'
// Config
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Repositories
import {
  clearJobs,
  findJobById,
  insertJob,
  updateJob,
} from '../repositories/jobStore.repository.js'

import { listTranscriptionRuns } from '../repositories/transcriptionRuns.repository.js'
import { getDatabase } from '../repositories/database.js'
import { insertFeed } from '../repositories/feeds.repository.js'
import { addStoredSource } from '../test-support/gmailSources.fixture.js'
// Services
import {
  completeSummary,
  completeAcquisition,
  deleteExpiredJobs,
  failJob,
  failSummary,
  findJob,
  claimNextJob,
  listJobs,
  markStatus,
  queueJob,
  recordSummaryRun,
  recordTranscriptionRun,
  recoverInterruptedJobs,
  regenerateSummary,
  retrySummary,
} from './jobs.service.js'

import { discardJob, saveJob, updateDraft } from './jobDraft.service.js'
// Models
import { assertKnownModel } from './models.service.js'
// Prompts
import {
  createProfile,
  deleteProfile,
  listProfiles,
  resolvePrompt,
  saveVersion,
} from './prompts.service.js'
// Clients
import { existingFolderSync, writeNote } from '../clients/vault.client.js'
// Formatters
import { formatNote } from '../formatters/note.formatter.js'
// Fixtures
// Repositories
// Logging
import { logger } from '../logger.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

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
const laterTime = new Date( '2026-10-14T10:05:00.000Z' )

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

describe( 'queueJob', () => {
  it( 'returns a queued public job', async () => {
    const job = await queueJob( userId, { url } )

    expect( job ).toEqual( {
      id: expect.stringMatching( /^[0-9a-f-]{36}$/ ) as string,
      url,
      status: 'queued',
      error: null,
      created_at: startTime.toISOString(),
      updated_at: startTime.toISOString(),
      title: null,
      note_markdown: null,
      target_folder: null,
      default_folder: 'Mnemosyne',
      expires_at: null,
      saved_path: null,
      summary_model: null,
      prompt_profile_id: null,
      summary_usage: null,
      link_state: null,
      link_error: null,
      link_usage: null,
      source_type: 'video',
      feed_id: null,
      feed_name: null,
      gmail_source_id: null,
      gmail_source_name: null,
    } )
  } )

  it( 'does not expose a transcript property', async () => {
    expect( await queueJob( userId, { url } ) ).not.toHaveProperty( 'transcript' )
  } )

  it( 'produces a different id on each call', async () => {
    expect( ( await queueJob( userId, { url } ) ).id )
      .not.toBe( ( await queueJob( userId, { url } ) ).id )
  } )
} )

describe( 'findJob', () => {
  it( 'returns the public job', async () => {
    const { id } = await queueJob( userId, { url } )

    const job = findJob( userId, id )

    expect( job.id ).toBe( id )
    expect( job ).not.toHaveProperty( 'transcript' )
  } )

  it( 'returns the stored fields of a job', async () => {
    const { id } = await queueJob( userId, { url } )
    updateJob( userId, id, {
      title: 'A talk',
      expires_at: laterTime.toISOString(),
      saved_path: 'Mnemosyne/A talk.md',
    } )

    expect( findJob( userId, id ) ).toMatchObject( {
      title: 'A talk',
      expires_at: laterTime.toISOString(),
      saved_path: 'Mnemosyne/A talk.md',
    } )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => findJob( userId, 'missing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'markStatus', () => {
  it( 'moves a video job from queued to transcribing', async () => {
    const { id } = await queueJob( userId, { url } )

    expect( markStatus( userId, id, 'transcribing' ).status ).toBe( 'transcribing' )
  } )

  it( 'updates updated_at and keeps created_at', async () => {
    const { id } = await queueJob( userId, { url } )
    vi.setSystemTime( laterTime )

    const job = markStatus( userId, id, 'transcribing' )

    expect( job.updated_at ).toBe( laterTime.toISOString() )
    expect( job.created_at ).toBe( startTime.toISOString() )
  } )

  it( 'throws ConflictError when skipping a step', async () => {
    const { id } = await queueJob( userId, { url } )

    expect( () => markStatus( userId, id, 'fetching' ) ).toThrow( ConflictError )
    expect( () => markStatus( userId, id, 'fetching' ) ).toThrow(
      'Cannot move job from queued to fetching',
    )
  } )

  it( 'logs a refused move with the statuses and source', async () => {
    const warnSpy = vi.spyOn( logger, 'warn' ).mockImplementation( () => undefined )
    const { id } = await queueJob( userId, { url } )

    expect( () => markStatus( userId, id, 'fetching' ) ).toThrow( ConflictError )

    expect( warnSpy ).toHaveBeenCalledWith(
      { from: 'queued', to: 'fetching', source_type: 'video' },
      'Job move refused',
    )
  } )

  it( 'throws ConflictError when moving backwards', async () => {
    const id = await queueJobAt( 'transcribing' )

    expect( () => markStatus( userId, id, 'fetching' ) ).toThrow( ConflictError )
  } )

  it( 'throws ConflictError from a final status', async () => {
    const id = await queueJobAt( 'failed' )

    expect( () => markStatus( userId, id, 'transcribing' ) ).toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => markStatus( userId, 'missing', 'transcribing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'failJob', () => {
  it.each( [ 'queued', 'transcribing' ] as const )(
    'fails a job from %s with the message',
    async ( status ) => {
      const id = await queueJobAt( status )

      const job = failJob( userId, id, 'yt-dlp exited with 1' )

      expect( job.status ).toBe( 'failed' )
      expect( job.error ).toBe( 'yt-dlp exited with 1' )
    },
  )

  it.each( [ 'failed' ] as const )( 'throws ConflictError from %s', async ( status ) => {
    const id = await queueJobAt( status )

    expect( () => failJob( userId, id, 'late' ) ).toThrow( ConflictError )
  } )
} )

describe( 'claimNextJob', () => {
  it( 'returns a summarizing job so it can be resumed', async () => {
    const id = await queueSummarizing()

    expect( claimNextJob()?.job.id ).toBe( id )
  } )

  it( 'returns undefined when no jobs exist', () => {
    expect( claimNextJob() ).toBeUndefined()
  } )

  it( 'returns the oldest queued job', async () => {
    const first = await queueJob( userId, { url: 'https://www.youtube.com/watch?v=a' } )
    await queueJob( userId, { url: 'https://www.youtube.com/watch?v=b' } )

    expect( claimNextJob() ).toEqual( { job: first, userId } )
  } )

  it( 'skips jobs that are no longer queued', async () => {
    const first = await queueJob( userId, { url: 'https://www.youtube.com/watch?v=a' } )
    const second = await queueJob( userId, { url: 'https://www.youtube.com/watch?v=b' } )
    markStatus( userId, first.id, 'transcribing' )

    expect( claimNextJob() ).toEqual( { job: second, userId } )
  } )

  it( 'returns undefined when every job has moved on', async () => {
    const first = await queueJob( userId, { url: 'https://www.youtube.com/watch?v=a' } )
    const second = await queueJob( userId, { url: 'https://www.youtube.com/watch?v=b' } )
    markStatus( userId, first.id, 'transcribing' )
    markStatus( userId, second.id, 'transcribing' )

    expect( claimNextJob() ).toBeUndefined()
  } )

  it( 'returns a job without a transcript field', async () => {
    await queueJob( userId, { url: 'https://www.youtube.com/watch?v=a' } )

    expect( claimNextJob() ).not.toHaveProperty( 'transcript' )
  } )
} )

describe( 'recoverInterruptedJobs', () => {
  it( 'fails jobs left mid-processing and returns how many', async () => {
    const queued = await queueJobAt( 'queued' )
    const transcribing = await queueJobAt( 'transcribing' )
    const finished = await queueJobAt( 'ready_for_review' )
    vi.setSystemTime( laterTime )

    expect( recoverInterruptedJobs() ).toBe( 1 )

    expect( findJob( userId, transcribing ) ).toMatchObject( {
      status: 'failed',
      error: 'Interrupted by restart',
      updated_at: laterTime.toISOString(),
    } )
    expect( findJob( userId, queued ).status ).toBe( 'queued' )
    expect( findJob( userId, finished ).status ).toBe( 'ready_for_review' )
  } )

  it( 'returns 0 when nothing needs recovery', () => {
    expect( recoverInterruptedJobs() ).toBe( 0 )
  } )
} )

const queueSummarizing = async (): Promise< string > => {
  const id = await queueJobAt( 'transcribing' )
  completeAcquisition( userId, id, { kind: 'video', ...transcript } )

  return id
}

describe( 'completeAcquisition', () => {
  it( 'moves a transcribing job to summarizing and stores transcript and title', async () => {
    const id = await queueJobAt( 'transcribing' )

    const job = completeAcquisition( userId, id, { kind: 'video', ...transcript } )

    expect( job.status ).toBe( 'summarizing' )
    expect( job.title ).toBe( 'A talk' )
    expect( job ).not.toHaveProperty( 'transcript' )
    expect( findJobById( userId, id )?.source_document ).toEqual( { kind: 'video', ...transcript } )
  } )

  it.each( [ 'queued', 'failed' ] as const )(
    'throws ConflictError from %s and changes nothing',
    async ( status ) => {
      const id = await queueJobAt( status )
      const before = findJobById( userId, id )

      expect( () => completeAcquisition( userId, id, { kind: 'video', ...transcript } ) )
        .toThrow( ConflictError )
      expect( findJobById( userId, id ) ).toEqual( before )
    },
  )
} )

describe( 'completeSummary', () => {
  it( 'stores the note and sets the expiry from the review TTL', async () => {
    const id = await queueSummarizing()

    const job = completeSummary( userId, id, '## Summary\nText', [ 'rust' ] )

    expect( job ).toMatchObject( {
      status: 'ready_for_review',
      error: null,
      expires_at: new Date( startTime.getTime() + 24 * 3_600_000 ).toISOString(),
    } )
  } )

  it( 'stores the whole note: properties from the transcript, today as created', async () => {
    const id = await queueSummarizing()

    const job = completeSummary( userId, id, '## Summary\nText\n\n', [ 'Rust', 'mnemosyne' ] )

    expect( job.note_markdown ).toBe( formatNote( {
      title: transcript.meta.title,
      tags: [ 'rust' ],
      body: '## Summary\nText',
      document: { kind: 'video', ...transcript },
      created: '2026-10-14',
    } ) )
    expect( job.target_folder ).toBeNull()
  } )

  it.each( [ 'queued', 'transcribing', 'failed' ] as const )(
    'throws ConflictError from %s',
    async ( status ) => {
      const id = await queueJobAt( status )

      expect( () => completeSummary( userId, id, 'x', [] ) ).toThrow( ConflictError )
    },
  )

  it( 'throws ConflictError when called twice', async () => {
    const id = await queueSummarizing()
    completeSummary( userId, id, 'x', [] )

    expect( () => completeSummary( userId, id, 'y', [] ) ).toThrow( ConflictError )
  } )
} )

describe( 'failSummary', () => {
  it( 'moves a summarizing job to summary_failed with the error and an expiry', async () => {
    const id = await queueSummarizing()

    const job = failSummary( userId, id, 'Rate limited' )

    expect( job ).toMatchObject( {
      status: 'summary_failed',
      error: 'Rate limited',
      expires_at: new Date( startTime.getTime() + 24 * 3_600_000 ).toISOString(),
    } )
    expect( findJobById( userId, id )?.source_document ).toEqual( { kind: 'video', ...transcript } )
  } )

  it( 'throws ConflictError from a non-summarizing status', async () => {
    const id = await queueJobAt( 'transcribing' )

    expect( () => failSummary( userId, id, 'x' ) ).toThrow( ConflictError )
  } )
} )

describe( 'failJob after the summary steps', () => {
  it.each( [ 'ready_for_review', 'summary_failed' ] as const )(
    'refuses to fail a job in %s',
    async ( status ) => {
      const id = await queueSummarizing()

      if( status === 'ready_for_review' ) {
        completeSummary( userId, id, 'x', [] )
      } else {
        failSummary( userId, id, 'x' )
      }

      expect( () => failJob( userId, id, 'late' ) ).toThrow( ConflictError )
      expect( findJob( userId, id ).status ).toBe( status )
    },
  )

  it( 'refuses to fail a saved job', async () => {
    const id = await queueSummarizing()
    completeSummary( userId, id, 'x', [] )
    updateJob( userId, id, { status: 'saved' } )

    expect( () => failJob( userId, id, 'late' ) ).toThrow( ConflictError )
  } )

  it( 'can still fail a summarizing job', async () => {
    const id = await queueSummarizing()

    expect( failJob( userId, id, 'boom' ).status ).toBe( 'failed' )
  } )
} )

describe( 'listJobs', () => {
  it( 'returns public jobs, newest first', async () => {
    const first = await queueJob( userId, { url } )
    vi.setSystemTime( laterTime )
    const second = await queueJob( userId, { url } )

    const jobs = listJobs( userId )

    expect( jobs.map( ( { id } ) => id ) ).toEqual( [ second.id, first.id ] )
    expect( jobs[ 0 ] ).not.toHaveProperty( 'transcript' )
  } )

  it( 'leaves out failed and saved jobs', async () => {
    const failed = await queueJobAt( 'failed' )
    const review = await queueJobAt( 'ready_for_review' )

    expect( listJobs( userId ).map( ( { id } ) => id ) ).toEqual( [ review ] )
    expect( listJobs( userId ).map( ( { id } ) => id ) ).not.toContain( failed )
  } )
} )

describe( 'listJobs for many jobs', () => {
  const countPrepared = ( sqlPart: string, spy: { mock: { calls: unknown[][] } } ): number => {
    return spy.mock.calls.filter( ( [ sql ] ) => String( sql ).includes( sqlPart ) ).length
  }

  it( 'reads summary runs, link runs and profiles once, however many jobs it lists', async () => {
    const ids: string[] = []

    for( let index = 0; index < 10; index += 1 ) {
      const id = await queueJobAt( 'ready_for_review' )

      recordSummaryRun( userId, id, {
        model: 'claude-sonnet-5-5',
        promptVersionId: resolvePrompt( userId, null ).version.id,
        usage: { input_tokens: 1000 + index, output_tokens: 100 },
      } )
      ids.push( id )
    }

    // The list leaves the draft out; everything else matches the single-job read
    const expected = ids.map( ( id ) => ( { ...findJob( userId, id ), note_markdown: null } ) )
    const prepare = vi.spyOn( getDatabase(), 'prepare' )

    const jobs = listJobs( userId )

    expect( jobs ).toHaveLength( 10 )
    expect( countPrepared( 'FROM summary_runs', prepare ) ).toBe( 1 )
    expect( countPrepared( 'FROM link_runs', prepare ) ).toBe( 1 )
    expect( countPrepared( 'FROM prompt_profiles', prepare ) ).toBeLessThanOrEqual( 1 )
    expect( jobs.map( ( { id } ) => id ).toSorted() ).toEqual( ids.toSorted() )
    expect( jobs.toSorted( ( a, b ) => a.id.localeCompare( b.id ) ) )
      .toEqual( expected.toSorted( ( a, b ) => a.id.localeCompare( b.id ) ) )
  } )
} )

describe( 'retrySummary', () => {
  it( 'moves a failed summary back to summarizing, clearing error and expiry', async () => {
    const id = await queueJobAt( 'summary_failed' )

    const job = retrySummary( userId, id )

    expect( job ).toMatchObject( { status: 'summarizing', error: null, expires_at: null } )
    expect( findJobById( userId, id )?.source_document ).toEqual( { kind: 'video', ...transcript } )
  } )

  it( 'makes the job runnable again', async () => {
    const id = await queueJobAt( 'summary_failed' )

    retrySummary( userId, id )

    expect( claimNextJob()?.job.id ).toBe( id )
  } )

  it.each( [ 'queued', 'transcribing', 'ready_for_review', 'failed' ] as const )(
    'throws ConflictError from %s',
    async ( status ) => {
      const id = await queueJobAt( status )

      expect( () => retrySummary( userId, id ) ).toThrow( ConflictError )
    },
  )

  it( 'throws NotFoundError for an unknown id', () => {
    expect( () => retrySummary( userId, 'missing' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'deleteExpiredJobs', () => {
  it( 'deletes jobs past their expiry and returns how many', async () => {
    const expiredReview = await queueJobAt( 'ready_for_review' )
    const expiredFailed = await queueJobAt( 'summary_failed' )
    const fresh = await queueJobAt( 'ready_for_review' )
    updateJob( userId, expiredReview, { expires_at: '2026-10-14T09:00:00.000Z' } )
    updateJob( userId, expiredFailed, { expires_at: '2026-10-14T09:59:59.000Z' } )
    updateJob( userId, fresh, { expires_at: '2026-10-14T10:00:01.000Z' } )

    expect( deleteExpiredJobs() ).toBe( 2 )

    expect( findJobById( userId, expiredReview ) ).toBeUndefined()
    expect( findJobById( userId, expiredFailed ) ).toBeUndefined()
    expect( findJob( userId, fresh ).status ).toBe( 'ready_for_review' )
  } )

  it( 'returns 0 when nothing has expired', async () => {
    await queueJobAt( 'ready_for_review' )

    expect( deleteExpiredJobs() ).toBe( 0 )
  } )
} )

describe( 'recordTranscriptionRun', () => {
  it( 'stores a run with the tokens and the cost they come to', async () => {
    const id = await queueJobAt( 'transcribing' )

    recordTranscriptionRun( userId, id, {
      model: 'gemini-3.8-flash',
      duration_seconds: 3600,
      input_tokens: 1_000_000,
      output_tokens: 200_000,
      outcome: 'ok',
      error: null,
    } )

    expect( listTranscriptionRuns( userId, id ) ).toEqual( [ {
      id: 1,
      job_id: id,
      model: 'gemini-3.8-flash',
      duration_seconds: 3600,
      input_tokens: 1_000_000,
      output_tokens: 200_000,
      cost_usd: 1.5,
      outcome: 'ok',
      error: null,
      created_at: startTime.toISOString(),
    } ] )
  } )

  it( 'stores a failed run with its error, no tokens and no cost', async () => {
    const id = await queueJobAt( 'transcribing' )

    recordTranscriptionRun( userId, id, {
      model: 'gemini-3.8-flash',
      duration_seconds: 60,
      input_tokens: null,
      output_tokens: null,
      outcome: 'error',
      error: 'Gemini request failed (500)',
    } )

    expect( listTranscriptionRuns( userId, id ) ).toMatchObject( [ {
      outcome: 'error',
      error: 'Gemini request failed (500)',
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    } ] )
  } )

  it( 'has no cost for a model that is not priced', async () => {
    const id = await queueJobAt( 'transcribing' )

    recordTranscriptionRun( userId, id, {
      model: 'some-new-model',
      duration_seconds: 60,
      input_tokens: 100,
      output_tokens: 10,
      outcome: 'ok',
      error: null,
    } )

    expect( listTranscriptionRuns( userId, id )[ 0 ] ).toMatchObject( {
      input_tokens: 100,
      cost_usd: null,
    } )
  } )
} )

describe( 'recordSummaryRun and summary_usage', () => {
  const version = (): number => resolvePrompt( userId, null ).version.id

  it( 'has no usage before the first attempt', async () => {
    expect( findJob( userId, await queueJobAt( 'queued' ) ).summary_usage ).toBeNull()
  } )

  it( 'records a succeeded run with tokens and the estimated cost', async () => {
    const id = await queueJobAt( 'ready_for_review' )

    recordSummaryRun( userId, id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 1_000_000, output_tokens: 100_000 },
    } )

    expect( findJob( userId, id ).summary_usage ).toEqual( {
      last_run: {
        model: 'claude-sonnet-5-5',
        profile_id: resolvePrompt( userId, null ).profile.id,
        profile_name: 'Business ideas',
        prompt_version: 1,
        input_tokens: 1_000_000,
        output_tokens: 100_000,
        cost_usd: 3,
        outcome: 'succeeded',
        created_at: startTime.toISOString(),
      },
      run_count: 1,
      total_input_tokens: 1_000_000,
      total_output_tokens: 100_000,
      total_cost_usd: 3,
    } )
  } )

  it( 'records tokens but no cost for a model without a price', async () => {
    const id = await queueJobAt( 'ready_for_review' )

    recordSummaryRun( userId, id, {
      model: 'claude-haiku-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 10, output_tokens: 5 },
    } )

    expect( findJob( userId, id ).summary_usage ).toMatchObject( {
      last_run: { input_tokens: 10, output_tokens: 5, cost_usd: null },
      total_cost_usd: null,
    } )
  } )

  it( 'records a failed run with the billed tokens and the error', async () => {
    const id = await queueJobAt( 'summary_failed' )

    recordSummaryRun( userId, id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
      error: 'Summary was cut off',
    } )

    expect( findJob( userId, id ).summary_usage ).toMatchObject( {
      last_run: { outcome: 'failed', input_tokens: 1_000_000, cost_usd: 2 },
      total_cost_usd: 2,
    } )
  } )

  it( 'records a failed run without tokens or cost when no response came back', async () => {
    const id = await queueJobAt( 'summary_failed' )

    recordSummaryRun( userId, id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: version(),
      usage: undefined,
      error: 'Summary request failed: Overloaded',
    } )

    expect( findJob( userId, id ).summary_usage ).toEqual( expect.objectContaining( {
      last_run: expect.objectContaining( {
        outcome: 'failed',
        input_tokens: null,
        output_tokens: null,
        cost_usd: null,
      } ) as unknown,
      run_count: 1,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cost_usd: 0,
    } ) )
  } )

  it( 'reports the latest run, the count and the totals over several runs', async () => {
    const id = await queueJobAt( 'ready_for_review' )
    const first = version()
    saveVersion( userId, resolvePrompt( userId, null ).profile.id, 'A newer prompt' )

    recordSummaryRun( userId, id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: first,
      usage: { input_tokens: 1_000_000, output_tokens: 0 },
    } )
    recordSummaryRun( userId, id, {
      model: 'claude-opus-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 500_000, output_tokens: 100_000 },
    } )

    expect( findJob( userId, id ).summary_usage ).toMatchObject( {
      last_run: { model: 'claude-opus-5-5', prompt_version: 2, cost_usd: 4 },
      run_count: 2,
      total_input_tokens: 1_500_000,
      total_output_tokens: 100_000,
      total_cost_usd: 6,
    } )
  } )

  it( 'has no total cost when any run with tokens is unpriced', async () => {
    const id = await queueJobAt( 'ready_for_review' )

    recordSummaryRun( userId, id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 1000, output_tokens: 10 },
    } )
    recordSummaryRun( userId, id, {
      model: 'claude-haiku-5-5',
      promptVersionId: version(),
      usage: { input_tokens: 1000, output_tokens: 10 },
    } )

    expect( findJob( userId, id ).summary_usage?.total_cost_usd ).toBeNull()
  } )

  it( 'keeps the profile name after the profile is deleted', async () => {
    const id = await queueJobAt( 'ready_for_review' )
    const { id: profileId } = createProfile( userId, { name: 'Temporary', guidance: 'x' } )
    const versionId = resolvePrompt( userId, profileId ).version.id

    recordSummaryRun( userId, id, {
      model: 'claude-sonnet-5-5',
      promptVersionId: versionId,
      usage: { input_tokens: 1, output_tokens: 1 },
    } )
    deleteProfile( userId, profileId )

    expect( findJob( userId, id ).summary_usage?.last_run ).toMatchObject( {
      profile_id: profileId,
      profile_name: 'Temporary',
    } )
  } )
} )

describe( 'queueJob and videos that are not on YouTube (ADR 0081)', () => {
  it.each( [
    'https://vimeo.com/123',
    'https://www.dailymotion.com/video/x1',
    'https://www.tiktok.com/@a/video/1',
    'https://www.twitch.tv/videos/1',
  ] )( 'refuses %s instead of reading it as an article', async ( link ) => {
    await expect( queueJob( userId, { url: link } ) )
      .rejects.toThrow( new ValidationError( 'Only YouTube videos are supported' ) )
    expect( listJobs( userId ) ).toEqual( [] )
  } )

  it( 'refuses a video chosen for a page that is not YouTube', async () => {
    await expect( queueJob( userId, { url: 'https://example.com/clip', source_type: 'video' } ) )
      .rejects.toThrow( ValidationError )
  } )

  it( 'still queues such a page when it is said to be an article', async () => {
    const job = await queueJob( userId, { url: 'https://vimeo.com/123', source_type: 'article' } )

    expect( job ).toMatchObject( { status: 'queued', source_type: 'article' } )
  } )

  it( 'does not refuse a feed item whose text is already in hand', async () => {
    const document = {
      kind: 'article' as const,
      meta: {
        title: 'Post',
        source: 'https://vimeo.com/blog/post',
        author: null,
        site: 'Vimeo blog',
        published: null,
        fetched_at: startTime.toISOString(),
        origin: 'feed' as const,
      },
      markdown: 'x'.repeat( 400 ),
    }

    const job = await queueJob( userId, { url: 'https://vimeo.com/blog/post' }, { document } )

    expect( job.status ).toBe( 'summarizing' )
  } )
} )

describe( 'queueJob options', () => {
  const codingId = (): string => listProfiles( userId )
    .find( ( { name } ) => name === 'Coding' )?.id ?? ''

  it( 'stores the model and profile when given', async () => {
    const profileId = codingId()

    const job = await queueJob(
      userId,
      { url: url, model: 'claude-opus-5-5', profile_id: profileId },
    )

    expect( assertKnownModelMock ).toHaveBeenCalledWith( userId, 'claude-opus-5-5' )
    expect( job )
      .toMatchObject( { summary_model: 'claude-opus-5-5', prompt_profile_id: profileId } )
    expect( findJobById( userId, job.id ) ).toMatchObject( {
      summary_model: 'claude-opus-5-5',
      prompt_profile_id: profileId,
    } )
  } )

  it( 'stores null for both when no options are given', async () => {
    const none = { summary_model: null, prompt_profile_id: null }

    expect( await queueJob( userId, { url } ) ).toMatchObject( none )
    expect( await queueJob( userId, { url } ) ).toMatchObject( none )
    expect( assertKnownModelMock ).not.toHaveBeenCalled()
  } )

  it( 'rejects an unknown model and queues nothing', async () => {
    assertKnownModelMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

    await expect( queueJob( userId, { url: url, model: 'nope' } ) )
      .rejects.toThrow( 'Unknown model: nope' )
    expect( listJobs( userId ) ).toEqual( [] )
  } )

  it( 'rejects an unknown profile', async () => {
    await expect( queueJob( userId, { url: url, profile_id: crypto.randomUUID() } ) )
      .rejects.toThrow( ValidationError )
    expect( listJobs( userId ) ).toEqual( [] )
  } )

  it( 'rejects a deleted profile', async () => {
    const profileId = codingId()
    deleteProfile( userId, profileId )

    await expect( queueJob( userId, { url, profile_id: profileId } ) )
      .rejects.toThrow( ValidationError )
  } )
} )

describe( 'regenerateSummary', () => {
  const codingId = (): string => listProfiles( userId )
    .find( ( { name } ) => name === 'Coding' )?.id ?? ''

  const queueReviewed = async (): Promise< string > => {
    const id = await queueJobAt( 'ready_for_review' )
    const note_markdown = findJobById( userId, id )?.note_markdown ?? ''
    updateDraft( userId, id, { note_markdown, target_folder: 'Learning' } )

    return id
  }

  it( 'moves a job in review to summarizing and keeps the note and folder', async () => {
    const id = await queueReviewed()
    const before = findJobById( userId, id )

    const job = await regenerateSummary( userId, id, {} )

    expect( job ).toMatchObject( {
      status: 'summarizing',
      error: null,
      expires_at: null,
      target_folder: 'Learning',
      note_markdown: before?.note_markdown,
    } )
    expect( findJobById( userId, id )?.source_document ).not.toBeNull()
  } )

  it( 'stores the new model and profile when given', async () => {
    const id = await queueReviewed()

    const job = await regenerateSummary(
      userId,
      id,
      { model: 'claude-opus-5-5', profile_id: codingId() },
    )

    expect( assertKnownModelMock ).toHaveBeenCalledWith( userId, 'claude-opus-5-5' )
    expect( job ).toMatchObject( {
      summary_model: 'claude-opus-5-5',
      prompt_profile_id: codingId(),
    } )
  } )

  it( 'keeps the earlier choices when none are given', async () => {
    const profileId = codingId()
    const { id } = await queueJob(
      userId,
      { url: url, model: 'claude-opus-5-5', profile_id: profileId },
    )
    markStatus( userId, id, 'transcribing' )
    completeAcquisition( userId, id, { kind: 'video', ...transcript } )
    completeSummary( userId, id, '## Summary', [] )

    const job = await regenerateSummary( userId, id, {} )

    expect( job )
      .toMatchObject( { summary_model: 'claude-opus-5-5', prompt_profile_id: profileId } )
  } )

  it.each( [
    'queued',
    'transcribing',
    'summary_failed',
    'failed',
  ] as const )( 'refuses a job that is %s', async ( status ) => {
    const id = await queueJobAt( status )

    await expect( regenerateSummary( userId, id, {} ) ).rejects.toThrow( ConflictError )
    expect( findJob( userId, id ).status ).toBe( status )
  } )

  it( 'refuses a job that is already summarizing', async () => {
    const id = await queueJobAt( 'transcribing' )
    completeAcquisition( userId, id, { kind: 'video', ...transcript } )

    await expect( regenerateSummary( userId, id, {} ) ).rejects.toThrow( ConflictError )
    expect( findJob( userId, id ).status ).toBe( 'summarizing' )
  } )

  it( 'refuses a saved job', async () => {
    const id = await queueReviewed()
    await saveJob( userId, id )

    await expect( regenerateSummary( userId, id, {} ) ).rejects.toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown job', async () => {
    await expect( regenerateSummary( userId, crypto.randomUUID(), {} ) )
      .rejects.toThrow( NotFoundError )
  } )

  it( 'rejects an unknown model or profile and leaves the job in review', async () => {
    const id = await queueReviewed()
    assertKnownModelMock.mockRejectedValueOnce( new ValidationError( 'Unknown model: nope' ) )

    await expect( regenerateSummary( userId, id, { model: 'nope' } ) )
      .rejects.toThrow( ValidationError )
    await expect( regenerateSummary( userId, id, { profile_id: crypto.randomUUID() } ) )
      .rejects.toThrow( ValidationError )
    expect( findJob( userId, id ).status ).toBe( 'ready_for_review' )
  } )
} )

describe( 'article jobs', () => {
  const article: SourceDocument = {
    kind: 'article',
    meta: {
      title: 'A post',
      source: 'https://example.com/post',
      author: 'Ada',
      site: 'Example',
      published: '2026-10-01',
      fetched_at: '2026-10-18T10:00:00.000Z',
      origin: 'fetched',
    },
    markdown: 'Some text.',
  }

  const feedId = crypto.randomUUID()

  const insertArticle = ( status: 'summarizing' | 'ready_for_review' ): string => {
    const id = crypto.randomUUID()
    const now = startTime.toISOString()

    insertFeed( userId, {
      id: feedId,
      url: 'https://example.com',
      feed_url: 'https://example.com/feed.xml',
      name: 'A blog',
      profile_id: null,
      enabled: true,
      auto_summarize: false,
      etag: null,
      last_modified: null,
      last_checked_at: null,
      last_error: null,
      last_skipped_count: 0,
      created_at: now,
      deleted_at: null,
    } )
    insertJob( userId, {
      id,
      url: article.meta.source,
      status,
      error: null,
      created_at: now,
      updated_at: now,
      title: 'A post',
      note_markdown: null,
      target_folder: null,
      expires_at: null,
      saved_path: null,
      summary_model: null,
      prompt_profile_id: null,
      link_state: null,
      link_error: null,
      source_document: article,
      source_type: 'article',
      feed_id: feedId,
      feed_name: null,
      gmail_source_id: null,
      gmail_source_name: null,
    } )

    return id
  }

  const insertReviewed = (): string => {
    const id = insertArticle( 'summarizing' )
    completeSummary( userId, id, '## Summary\n\nText.', [ 'writing' ] )

    return id
  }

  it( 'exposes source_type, feed_id and feed_name on the public job', () => {
    const id = insertArticle( 'summarizing' )

    expect( findJob( userId, id ) ).toMatchObject( {
      source_type: 'article',
      feed_id: feedId,
      feed_name: 'A blog',
    } )
    expect( listJobs( userId )[ 0 ] )
      .toMatchObject( { source_type: 'article', feed_name: 'A blog' } )
  } )

  it( 'writes the article locked properties when the summary completes', () => {
    const id = insertReviewed()
    const { properties } = parseNote( findJobById( userId, id )?.note_markdown ?? '' )

    expect( properties ).toEqual( {
      title: 'A post',
      source: 'https://example.com/post',
      author: 'Ada',
      site: 'Example',
      published: '2026-10-01',
      created: '2026-10-14',
      tags: [ 'mnemosyne', 'writing' ],
    } )
  } )

  it( 'keeps the article keys and drops typed video keys on a draft update', () => {
    const id = insertReviewed()

    updateDraft( userId, id, { note_markdown: [
      '---',
      'title: "Mine"',
      'source: "x"',
      'channel: "typed"',
      'duration: "typed"',
      'author: "typed"',
      'created: 2020-01-01',
      'tags: [rust]',
      '---',
      '',
      'Edited.',
      '',
    ].join( '\n' ) } )

    expect( parseNote( findJobById( userId, id )?.note_markdown ?? '' ).properties ).toEqual( {
      title: 'Mine',
      source: 'https://example.com/post',
      author: 'Ada',
      site: 'Example',
      published: '2026-10-01',
      created: '2026-10-14',
      tags: [ 'mnemosyne', 'rust' ],
    } )
  } )

  it( 'saves the note with the article locked properties and today as created', async () => {
    const id = insertReviewed()

    await saveJob( userId, id )

    const [ , , , markdown ] = writeNoteMock.mock.calls[ 0 ] ?? []

    expect( parseNote( markdown ?? '' ).properties ).toMatchObject( {
      source: 'https://example.com/post',
      author: 'Ada',
      site: 'Example',
      created: '2026-10-14',
    } )
    expect( markdown ).not.toContain( 'duration' )
    expect( markdown ).not.toContain( 'channel' )
  } )
} )

describe( 'queueJob with source types', () => {
  const articleUrl = 'https://example.com/post'
  const pasted = `# Pasted title\n\n${ 'Some pasted words. '.repeat( 20 ) }`

  it( 'detects a video URL and queues it', async () => {
    expect( await queueJob( userId, { url } ) )
      .toMatchObject( { source_type: 'video', status: 'queued' } )
  } )

  it( 'detects an article URL and queues it', async () => {
    expect( await queueJob( userId, { url: articleUrl } ) )
      .toMatchObject( { source_type: 'article', status: 'queued' } )
  } )

  it( 'lets the body override the detected type', async () => {
    expect( ( await queueJob( userId, { url, source_type: 'article' } ) ).source_type )
      .toBe( 'article' )
    expect( ( await queueJob( userId, { url, source_type: 'video' } ) ).source_type )
      .toBe( 'video' )
  } )

  it( 'stores pasted text as an article document and goes straight to summarizing', async () => {
    const job = await queueJob( userId, { url: articleUrl, text: pasted } )

    expect( job ).toMatchObject( {
      source_type: 'article',
      status: 'summarizing',
      title: 'Pasted title',
    } )
    expect( findJobById( userId, job.id )?.source_document ).toMatchObject( {
      kind: 'article',
      meta: {
        title: 'Pasted title',
        source: articleUrl,
        origin: 'pasted',
        fetched_at: startTime.toISOString(),
      },
      markdown: pasted.trim(),
    } )
  } )

  it( 'prefers the given title for pasted text', async () => {
    const job = await queueJob( userId, { url: articleUrl, text: pasted, title: 'My title' } )

    expect( job.title ).toBe( 'My title' )
  } )

  it( 'refuses pasted text for a video', async () => {
    await expect( queueJob( userId, { url, text: pasted } ) ).rejects.toThrow( ValidationError )
  } )

  it( 'validates the model and profile for pasted text too', async () => {
    assertKnownModelMock.mockRejectedValueOnce( new ValidationError( 'Unknown model: nope' ) )

    await expect( queueJob( userId, { url: articleUrl, text: pasted, model: 'nope' } ) )
      .rejects.toThrow( ValidationError )
  } )

  it( 'stores a ready-made article document and goes straight to summarizing', async () => {
    const document: SourceDocument = {
      kind: 'article',
      meta: {
        title: 'From a feed',
        source: articleUrl,
        author: 'Ada',
        site: 'A blog',
        published: '2026-10-01',
        fetched_at: startTime.toISOString(),
        origin: 'feed',
      },
      markdown: 'Full text from the feed.',
    }

    const job = await queueJob( userId, { url: articleUrl }, { document } )

    expect( job ).toMatchObject( {
      status: 'summarizing',
      source_type: 'article',
      title: 'From a feed',
    } )
    expect( findJobById( userId, job.id )?.source_document ).toEqual( document )
  } )

  it( 'stores a feed id that the caller passes', async () => {
    const feedId = crypto.randomUUID()

    expect( ( await queueJob( userId, { url: articleUrl }, { feed_id: feedId } ) ).feed_id )
      .toBe( feedId )
  } )

  describe( 'a Gmail source', () => {
    it( 'stores the source id and shows its name on the job', async () => {
      const source = addStoredSource( userId, { name: 'Substacks', destination: 'newsletter' } )

      const job = await queueJob( userId, { url: articleUrl }, { gmail_source_id: source.id } )

      expect( job ).toMatchObject( {
        gmail_source_id: source.id,
        gmail_source_name: 'Substacks',
        feed_id: null,
        feed_name: null,
      } )
      expect( findJob( userId, job.id ) ).toMatchObject( { gmail_source_name: 'Substacks' } )
    } )

    it( 'leaves the Gmail fields null for a job with no source', async () => {
      expect( await queueJob( userId, { url: articleUrl } ) )
        .toMatchObject( { gmail_source_id: null, gmail_source_name: null } )
    } )

    it( 'refuses a source that does not exist, and stores no job', async () => {
      await expect( queueJob(
        userId,
        { url: articleUrl },
        { gmail_source_id: crypto.randomUUID() },
      ) )
        .rejects.toThrow( ValidationError )
      expect( listJobs( userId ) ).toEqual( [] )
    } )
  } )
} )

describe( 'step rules per source type', () => {
  const articleUrl = 'https://example.com/post'
  const article: SourceDocument = {
    kind: 'article',
    meta: {
      title: 'A post',
      source: articleUrl,
      author: null,
      site: 'Example',
      published: null,
      fetched_at: '2026-10-18T10:00:00.000Z',
      origin: 'fetched',
    },
    markdown: 'Some text.',
  }

  it( 'moves an article job queued to fetching and nowhere else', async () => {
    const { id } = await queueJob( userId, { url: articleUrl } )

    expect( () => markStatus( userId, id, 'transcribing' ) ).toThrow( ConflictError )
    expect( markStatus( userId, id, 'fetching' ).status ).toBe( 'fetching' )
    expect( () => markStatus( userId, id, 'transcribing' ) ).toThrow( ConflictError )
  } )

  it( 'refuses fetching for a video job', async () => {
    const { id } = await queueJob( userId, { url } )

    expect( () => markStatus( userId, id, 'fetching' ) ).toThrow( ConflictError )
  } )

  it( 'completes an article from fetching and goes to summarizing', async () => {
    const { id } = await queueJob( userId, { url: articleUrl } )
    markStatus( userId, id, 'fetching' )

    const job = completeAcquisition( userId, id, article )

    expect( job ).toMatchObject( { status: 'summarizing', title: 'A post' } )
    expect( findJobById( userId, id )?.source_document ).toEqual( article )
  } )

  it( 'refuses an article document for a job that is not fetching', async () => {
    const { id } = await queueJob( userId, { url: articleUrl } )

    expect( () => completeAcquisition( userId, id, article ) ).toThrow( ConflictError )
  } )

  it( 'refuses a video document for an article job and an article for a video job', async () => {
    const articleJob = await queueJob( userId, { url: articleUrl } )
    markStatus( userId, articleJob.id, 'fetching' )
    const videoJob = await queueJobAt( 'transcribing' )

    expect( () => completeAcquisition( userId, articleJob.id, { kind: 'video', ...transcript } ) )
      .toThrow( ConflictError )
    expect( () => completeAcquisition( userId, videoJob, article ) ).toThrow( ConflictError )
  } )

  it( 'fails an article job that was fetching when the server stopped', async () => {
    const { id } = await queueJob( userId, { url: articleUrl } )
    markStatus( userId, id, 'fetching' )

    expect( recoverInterruptedJobs() ).toBe( 1 )
    expect( findJob( userId, id ) )
      .toMatchObject( { status: 'failed', error: 'Interrupted by restart' } )
  } )
} )

describe( 'jobs of two users', () => {
  it( 'hands the worker the oldest runnable job of anyone, with its owner', async () => {
    const member = createTestUser().id
    const first = await queueJob( member, { url } )
    await queueJob( userId, { url } )

    expect( claimNextJob() ).toEqual( { job: first, userId: member } )
  } )

  it( 'recovers the interrupted jobs of every user', async () => {
    const member = createTestUser().id
    const mine = await queueJobAt( 'transcribing' )
    const { id: theirs } = await queueJob( member, { url } )
    markStatus( member, theirs, 'transcribing' )

    expect( recoverInterruptedJobs() ).toBe( 2 )
    expect( findJob( userId, mine ).status ).toBe( 'failed' )
    expect( findJob( member, theirs ).status ).toBe( 'failed' )
  } )

  it( 'deletes the expired jobs of every user and leaves the rest', async () => {
    const member = createTestUser().id
    const mine = await queueJobAt( 'ready_for_review' )
    const { id: theirs } = await queueJob( member, { url } )
    markStatus( member, theirs, 'transcribing' )
    completeAcquisition( member, theirs, { kind: 'video', ...transcript } )
    completeSummary( member, theirs, '## Summary', [] )
    updateJob( userId, mine, { expires_at: '2026-10-14T09:00:00.000Z' } )
    updateJob( member, theirs, { expires_at: '2026-10-14T09:00:00.000Z' } )
    const kept = await queueJobAt( 'ready_for_review' )

    expect( deleteExpiredJobs() ).toBe( 2 )
    expect( findJobById( userId, mine ) ).toBeUndefined()
    expect( findJobById( member, theirs ) ).toBeUndefined()
    expect( findJob( userId, kept ).status ).toBe( 'ready_for_review' )
  } )

  it( 'refuses another user\'s job by id', async () => {
    const member = createTestUser().id
    const mine = await queueJobAt( 'ready_for_review' )

    expect( () => findJob( member, mine ) ).toThrow( NotFoundError )
    expect( () => discardJob( member, mine ) ).toThrow( NotFoundError )
    expect( () => updateDraft( member, mine, { target_folder: 'A' } ) ).toThrow( NotFoundError )
    expect( listJobs( member ) ).toEqual( [] )
  } )
} )
