// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Shared
import { VideoSource, parseNote } from '@atlas/shared'
// Services
import {
  completeAcquisition,
  findJob,
  markStatus,
  queueJob,
  regenerateSummary,
  retrySummary,
  updateDraft,
} from '../services/jobs.service.js'
// Repositories
import { clearJobs, insertJob, updateJob } from '../repositories/jobStore.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Prompts
import { listProfiles, saveVersion } from '../services/prompts.service.js'
// Clients
import { SummaryError, summarizeSource } from '../clients/claude.client.js'
// Models
import { assertKnownModel } from '../services/models.service.js'
// Worker
import { summarizeJob } from './summarizeJob.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../clients/claude.client.js', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( '../clients/claude.client.js' ) >()

  return { ...original, summarizeSource: vi.fn() }
} )

vi.mock( '../services/models.service.js' )

const summarizeMock = vi.mocked( summarizeSource )

const transcript: Pick< VideoSource, 'meta' | 'text' > = {
  meta: {
    title: 'A talk',
    source: 'https://www.youtube.com/watch?v=abc123',
    channel: 'Channel',
    duration_seconds: 60,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'large-v3-turbo',
  },
  text: 'Rust has an ownership model. Memory safety comes free.',
}

const queueSummarizing = async (): Promise< string > => {
  const { id } = await queueJob( userId, { url: transcript.meta.source } )
  markStatus( userId, id, 'downloading' )
  markStatus( userId, id, 'converting' )
  markStatus( userId, id, 'transcribing' )
  completeAcquisition( userId, id, { kind: 'video', ...transcript } )

  return id
}

beforeEach( () => {
  clearJobs( userId )
  vi.resetAllMocks()
  vi.mocked( assertKnownModel ).mockResolvedValue( undefined )
  summarizeMock.mockResolvedValue( {
    summary: {
      kind: 'video',
      overview: 'An overview.',
      key_points: [ 'Ownership', 'Borrowing' ],
      quotes: [ 'Memory safety comes free.', 'Invented quote' ],
      tags: [ 'Rust Lang', 'mnemosyne' ],
    },
    usage: { input_tokens: 100, output_tokens: 20 },
  } )
} )

describe( 'summarizeJob', () => {
  it( 'sends the stored transcript to the client', async () => {
    const id = await queueSummarizing()

    await summarizeJob( userId, id )

    expect( summarizeMock ).toHaveBeenCalledWith( {
      document: { kind: 'video', ...transcript },
      model: 'claude-sonnet-5-5',
      guidance: expect.any( String ) as string,
    } )
  } )

  it( 'stores the cleaned, rendered summary and moves to ready_for_review', async () => {
    const id = await queueSummarizing()

    await summarizeJob( userId, id )

    const job = findJob( userId, id )
    const note = parseNote( job.note_markdown ?? '' )

    expect( job.status ).toBe( 'ready_for_review' )
    expect( note.properties.tags ).toEqual( [ 'mnemosyne', 'rust-lang' ] )
    expect( note.body ).toBe( [
      '## Summary',
      '',
      'An overview.',
      '',
      '## Key points',
      '',
      '- Ownership',
      '- Borrowing',
      '',
      '## Notable quotes',
      '',
      '> "Memory safety comes free."',
      '',
    ].join( '\n' ) )
  } )

  it.each( [
    [ new Error( 'Rate limited' ), 'Rate limited' ],
    [ 'nope', 'Unknown error' ],
  ] )( 'marks the summary failed when the client rejects', async ( reason, message ) => {
    const id = await queueSummarizing()
    summarizeMock.mockRejectedValue( reason )

    await expect( summarizeJob( userId, id ) ).resolves.toBeUndefined()

    expect( findJob( userId, id ) ).toMatchObject( { status: 'summary_failed', error: message } )
  } )

  it( 'uses the default model and the default profile\'s current guidance', async () => {
    const id = await queueSummarizing()
    saveVersion( userId, listProfiles( userId )[ 0 ]?.id ?? '', 'Be brief.' )
    setSetting( userId, 'default_model', 'claude-opus-5-5' )

    await summarizeJob( userId, id )

    expect( summarizeMock ).toHaveBeenCalledWith( {
      document: { kind: 'video', ...transcript },
      model: 'claude-opus-5-5',
      guidance: 'Be brief.',
    } )
  } )

  it( 'uses the model and profile stored on the job', async () => {
    const id = await queueSummarizing()
    const coding = listProfiles( userId ).find( ( { name } ) => name === 'Coding' )
    updateJob(
      userId,
      id,
      { summary_model: 'claude-sonnet-4-6', prompt_profile_id: coding?.id ?? null },
    )

    await summarizeJob( userId, id )

    expect( summarizeMock ).toHaveBeenCalledWith( {
      document: { kind: 'video', ...transcript },
      model: 'claude-sonnet-4-6',
      guidance: coding?.current_version.guidance,
    } )
  } )

  it( 'records a succeeded run with tokens and cost', async () => {
    const id = await queueSummarizing()

    await summarizeJob( userId, id )

    expect( findJob( userId, id ).summary_usage ).toMatchObject( {
      last_run: {
        model: 'claude-sonnet-5-5',
        profile_name: 'Business ideas',
        prompt_version: 1,
        input_tokens: 100,
        output_tokens: 20,
        cost_usd: ( 100 * 2 + 20 * 10 ) / 1_000_000,
        outcome: 'succeeded',
      },
      run_count: 1,
    } )
  } )

  it( 'records a failed run with the tokens of an unusable response', async () => {
    const id = await queueSummarizing()
    const usage = { input_tokens: 500, output_tokens: 16_000 }
    summarizeMock.mockRejectedValue( new SummaryError( 'Summary was cut off', { usage } ) )

    await summarizeJob( userId, id )

    expect( findJob( userId, id ) )
      .toMatchObject( { status: 'summary_failed', error: 'Summary was cut off' } )
    expect( findJob( userId, id ).summary_usage?.last_run ).toMatchObject( {
      outcome: 'failed',
      input_tokens: 500,
      output_tokens: 16_000,
    } )
  } )

  it( 'records a failed run without tokens when the request itself failed', async () => {
    const id = await queueSummarizing()
    summarizeMock.mockRejectedValue( new SummaryError( 'Summary request failed: Overloaded' ) )

    await summarizeJob( userId, id )

    expect( findJob( userId, id ).summary_usage?.last_run ).toMatchObject( {
      outcome: 'failed',
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
    } )
  } )

  it( 'records a run for every attempt', async () => {
    const id = await queueSummarizing()
    summarizeMock.mockRejectedValueOnce( new Error( 'Rate limited' ) )
    await summarizeJob( userId, id )
    retrySummary( userId, id )

    await summarizeJob( userId, id )

    expect( findJob( userId, id ).summary_usage ).toMatchObject( {
      run_count: 2,
      last_run: { outcome: 'succeeded' },
    } )
  } )

  it( 'completes after a failed summary is retried', async () => {
    const id = await queueSummarizing()
    summarizeMock.mockRejectedValueOnce( new Error( 'Rate limited' ) )
    await summarizeJob( userId, id )
    expect( findJob( userId, id ).status ).toBe( 'summary_failed' )

    retrySummary( userId, id )
    await summarizeJob( userId, id )

    expect( findJob( userId, id ) ).toMatchObject( { status: 'ready_for_review', error: null } )
  } )

  it( 'replaces the note when a summary in review is regenerated, keeping the folder', async () => {
    const id = await queueSummarizing()
    await summarizeJob( userId, id )
    updateDraft( userId, id, { target_folder: 'Learning' } )
    summarizeMock.mockResolvedValue( {
      summary: {
        kind: 'video',
        overview: 'A second take.',
        key_points: [],
        quotes: [],
        tags: [ 'rust' ],
      },
      usage: { input_tokens: 80, output_tokens: 10 },
    } )

    await regenerateSummary( userId, id, { model: 'claude-opus-5-5' } )
    await summarizeJob( userId, id )

    const job = findJob( userId, id )

    expect( summarizeMock ).toHaveBeenLastCalledWith( expect.objectContaining( {
      model: 'claude-opus-5-5',
    } ) )
    expect( job ).toMatchObject( { status: 'ready_for_review', target_folder: 'Learning' } )
    expect( parseNote( job.note_markdown ?? '' ).body ).toContain( 'A second take.' )
    expect( job.summary_usage ).toMatchObject( {
      run_count: 2,
      last_run: { model: 'claude-opus-5-5' },
    } )
  } )

  describe( 'for an article', () => {
    const markdown = 'Small things *compound* over time.\n\nDo it daily.'
    const articleDocument = {
      kind: 'article' as const,
      meta: {
        title: 'A post',
        source: 'https://example.com/post',
        author: 'Ada',
        site: 'Example',
        published: '2026-10-01',
        fetched_at: '2026-10-18T10:00:00.000Z',
        origin: 'fetched' as const,
      },
      markdown,
    }

    const queueArticle = (): string => {
      const id = crypto.randomUUID()

      insertJob( userId, {
        id,
        url: articleDocument.meta.source,
        status: 'summarizing',
        error: null,
        created_at: '2026-10-18T10:00:00.000Z',
        updated_at: '2026-10-18T10:00:00.000Z',
        title: 'A post',
        note_markdown: null,
        target_folder: null,
        expires_at: null,
        saved_path: null,
        summary_model: null,
        prompt_profile_id: null,
        link_state: null,
        link_error: null,
        source_type: 'article',
        feed_id: null,
        feed_name: null,
        gmail_source_id: null,
        gmail_source_name: null,
        source_document: articleDocument,
      } )

      return id
    }

    beforeEach( () => {
      summarizeMock.mockResolvedValue( {
        summary: {
          kind: 'article',
          overview: 'An overview of habits.',
          key_points: [ 'Small things compound' ],
          quotes: [ 'Small things compound over time.', 'An invented sentence.' ],
          tags: [ 'Habits', 'mnemosyne' ],
        },
        usage: { input_tokens: 50, output_tokens: 10 },
      } )
    } )

    it( 'sends the stored article to the client', async () => {
      const id = queueArticle()

      await summarizeJob( userId, id )

      expect( summarizeMock ).toHaveBeenCalledWith( {
        document: articleDocument,
        model: 'claude-sonnet-5-5',
        guidance: expect.any( String ) as string,
      } )
    } )

    it( 'stores a cleaned note with article front-matter and no timestamps', async () => {
      const id = queueArticle()

      await summarizeJob( userId, id )

      const job = findJob( userId, id )
      const note = parseNote( job.note_markdown ?? '' )

      expect( job.status ).toBe( 'ready_for_review' )
      expect( note.properties ).toEqual( {
        title: 'A post',
        source: 'https://example.com/post',
        author: 'Ada',
        site: 'Example',
        published: '2026-10-01',
        created: new Date().toISOString().slice( 0, 10 ),
        tags: [ 'mnemosyne', 'habits' ],
      } )
      expect( note.body ).toBe( [
        '## Summary',
        '',
        'An overview of habits.',
        '',
        '## Key points',
        '',
        '- Small things compound',
        '',
        '## Notable quotes',
        '',
        '> "Small things compound over time."',
        '',
      ].join( '\n' ) )
    } )
  } )
} )

describe( 'summarizeJob for two users', () => {
  it( 'summarizes each job with its owner\'s model and prompt', async () => {
    const member = createTestUser().id
    const mine = await queueSummarizing()

    setSetting( userId, 'default_model', 'claude-opus-5-5' )
    setSetting( member, 'default_model', 'claude-haiku-5-5' )

    const { id: theirs } = await queueJob( member, { url: transcript.meta.source } )
    markStatus( member, theirs, 'downloading' )
    markStatus( member, theirs, 'converting' )
    markStatus( member, theirs, 'transcribing' )
    completeAcquisition( member, theirs, { kind: 'video', ...transcript } )

    const coding = listProfiles( member ).find( ( { name } ) => name === 'Coding' )
    saveVersion( member, coding?.id ?? '', 'Their own guidance.' )
    updateJob( member, theirs, { prompt_profile_id: coding?.id ?? null } )

    await summarizeJob( userId, mine )
    await summarizeJob( member, theirs )

    expect( summarizeMock ).toHaveBeenNthCalledWith( 1, expect.objectContaining( {
      model: 'claude-opus-5-5',
    } ) )
    expect( summarizeMock ).toHaveBeenNthCalledWith( 2, {
      document: { kind: 'video', ...transcript },
      model: 'claude-haiku-5-5',
      guidance: 'Their own guidance.',
    } )
    expect( findJob( userId, mine ).status ).toBe( 'ready_for_review' )
    expect( findJob( member, theirs ).status ).toBe( 'ready_for_review' )
  } )
} )
