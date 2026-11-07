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
// Errors
import { ConflictError, NotFoundError } from '../errors.js'
// Services
import {
  completeAcquisition,
  findJob,
  markStatus,
  queueJob,
} from '../services/jobs.service.js'
// Repositories
import { clearJobs, findJobById, updateJob } from '../repositories/jobStore.repository.js'
import { listTranscriptionRuns } from '../repositories/transcriptionRuns.repository.js'
// Sources
import { fetchArticle } from '../sources/extractArticle.js'
// Clients
import { getVideoMeta } from '../clients/youtubeData.client.js'
import { transcribeYouTube } from '../clients/gemini.client.js'
// Worker
import { runJob } from './runJob.js'
import { linkJob } from './linkJob.js'
import { summarizeJob } from './summarizeJob.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../clients/youtubeData.client.js' )
vi.mock( '../clients/gemini.client.js' )
vi.mock( './summarizeJob.js' )
vi.mock( './linkJob.js' )
vi.mock( '../sources/extractArticle.js' )
vi.mock( '../config.js', () => ( {
  config: {
    geminiModel: 'test-model',
    geminiApiKey: 'gemini-key',
    youtubeApiKey: 'yt-key',
    geminiBaseUrl: null,
    youtubeApiBaseUrl: null,
    logLevel: 'silent',
    sessionDays: 30,
  },
} ) )

const NOW = '2026-10-14T12:00:00.000Z'

const meta = {
  title: 'A video',
  source: 'https://www.youtube.com/watch?v=abc',
  channel: 'A channel',
  duration_seconds: 12,
}
const metadata = { ...meta, privacy: 'public' as const }
const transcript = { text: 'Hello', truncated: false, inputTokens: 1000, outputTokens: 200 }

const metaMock = vi.mocked( getVideoMeta )
const transcribeMock = vi.mocked( transcribeYouTube )
const summarizeJobMock = vi.mocked( summarizeJob )
const linkJobMock = vi.mocked( linkJob )

const queue = async (): Promise< string > => {
  return ( await queueJob( userId, { url: 'https://www.youtube.com/watch?v=abc' } ) ).id
}

const expectClientsNotCalled = (): void => {
  expect( metaMock ).not.toHaveBeenCalled()
  expect( transcribeMock ).not.toHaveBeenCalled()
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( new Date( NOW ) )
  clearJobs( userId )
  vi.resetAllMocks()
  metaMock.mockResolvedValue( metadata )
  transcribeMock.mockResolvedValue( transcript )
  summarizeJobMock.mockResolvedValue( undefined )
  linkJobMock.mockResolvedValue( undefined )
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'runJob', () => {
  it( 'moves the job to summarizing and stores the transcript and title', async () => {
    const id = await queue()

    await runJob( userId, id )

    expect( findJob( userId, id ) ).toMatchObject( { status: 'summarizing', title: 'A video' } )
    expect( findJobById( userId, id )?.source_document ).toEqual( {
      kind: 'video',
      meta: { ...meta, transcribed_at: NOW, model: 'test-model' },
      text: 'Hello',
    } )
  } )

  it( 'asks YouTube for the metadata and Gemini for the transcript of the link', async () => {
    const id = await queue()

    await runJob( userId, id )

    expect( metaMock ).toHaveBeenCalledWith( 'abc', { apiKey: 'yt-key' } )
    expect( transcribeMock ).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc',
      { model: 'test-model', apiKey: 'gemini-key' },
    )
  } )

  it( 'is transcribing while the clients work', async () => {
    const id = await queue()
    const seen: string[] = []

    metaMock.mockImplementation( () => {
      seen.push( findJob( userId, id ).status )

      return Promise.resolve( metadata )
    } )
    transcribeMock.mockImplementation( () => {
      seen.push( findJob( userId, id ).status )

      return Promise.resolve( transcript )
    } )

    await runJob( userId, id )

    expect( seen ).toEqual( [ 'transcribing', 'transcribing' ] )
  } )

  describe.each( [
    { step: 'the metadata', fail: () => metaMock, later: [ transcribeMock ] },
    { step: 'the transcription', fail: () => transcribeMock, later: [] },
  ] )( 'when $step fails', ( { fail, later } ) => {
    it( 'fails the job with the message and skips later clients', async () => {
      const id = await queue()

      fail().mockRejectedValue( new Error( 'boom' ) )

      await runJob( userId, id )

      expect( findJob( userId, id ) ).toMatchObject( { status: 'failed', error: 'boom' } )
      later.forEach( ( mock ) => expect( mock ).not.toHaveBeenCalled() )
    } )

    it( 'does not summarize', async () => {
      const id = await queue()

      fail().mockRejectedValue( new Error( 'boom' ) )

      await runJob( userId, id )

      expect( summarizeJobMock ).not.toHaveBeenCalled()
    } )

    it( 'fails with Unknown error for a non-Error rejection', async () => {
      const id = await queue()

      fail().mockRejectedValue( 'nope' )

      await runJob( userId, id )

      expect( findJob( userId, id ) ).toMatchObject( { status: 'failed', error: 'Unknown error' } )
    } )
  } )

  describe( 'transcription runs', () => {
    it( 'stores an ok run with its tokens and cost for the job\'s owner', async () => {
      const id = await queue()

      await runJob( userId, id )

      expect( listTranscriptionRuns( userId, id ) ).toMatchObject( [ {
        job_id: id,
        model: 'test-model',
        duration_seconds: meta.duration_seconds,
        input_tokens: 1000,
        output_tokens: 200,
        outcome: 'ok',
        error: null,
        created_at: NOW,
      } ] )
    } )

    it( 'stores an error run when Gemini fails, and fails the job', async () => {
      const id = await queue()

      transcribeMock.mockRejectedValue( new Error( 'Gemini request failed (500)' ) )

      await runJob( userId, id )

      expect( findJob( userId, id ) ).toMatchObject( { status: 'failed' } )
      expect( listTranscriptionRuns( userId, id ) ).toMatchObject( [
        { outcome: 'error', error: 'Gemini request failed (500)', input_tokens: null },
      ] )
    } )

    it( 'stores nothing when the metadata fails', async () => {
      const id = await queue()

      metaMock.mockRejectedValue( new Error( 'Only public YouTube videos are supported' ) )

      await runJob( userId, id )

      expect( listTranscriptionRuns( userId, id ) ).toEqual( [] )
    } )
  } )

  it( 'summarizes once the transcript is stored', async () => {
    const id = await queue()

    await runJob( userId, id )

    expect( summarizeJobMock ).toHaveBeenCalledWith( userId, id )
  } )

  it( 'rejects with ConflictError when the job is not queued', async () => {
    const id = await queue()
    markStatus( userId, id, 'transcribing' )

    await expect( runJob( userId, id ) ).rejects.toBeInstanceOf( ConflictError )

    expectClientsNotCalled()
    expect( findJob( userId, id ).status ).toBe( 'transcribing' )
  } )

  describe( 'when the job is already summarizing', () => {
    const queueSummarizing = async (): Promise< string > => {
      const id = await queue()
      markStatus( userId, id, 'transcribing' )
      completeAcquisition( userId, id, {
        kind: 'video',
        meta: { ...meta, transcribed_at: NOW, model: 'test-model' },
        text: 'Hello',
      } )

      return id
    }

    it( 'runs only the summarize step', async () => {
      const id = await queueSummarizing()

      await runJob( userId, id )

      expect( summarizeJobMock ).toHaveBeenCalledExactlyOnceWith( userId, id )
      expectClientsNotCalled()
    } )

    it( 'leaves the status to the summarize step', async () => {
      const id = await queueSummarizing()

      await runJob( userId, id )

      expect( findJob( userId, id ).status ).toBe( 'summarizing' )
    } )

    it( 'links the job when summarizing moved it to linking', async () => {
      const id = await queueSummarizing()
      summarizeJobMock.mockImplementation( () => {
        updateJob( userId, id, { status: 'linking', link_state: 'pending' } )

        return Promise.resolve()
      } )

      await runJob( userId, id )

      expect( summarizeJobMock ).toHaveBeenCalledBefore( linkJobMock )
      expect( linkJobMock ).toHaveBeenCalledExactlyOnceWith( userId, id )
    } )

    it( 'does not link a job that went to review without linking', async () => {
      const id = await queueSummarizing()
      summarizeJobMock.mockImplementation( () => {
        updateJob( userId, id, { status: 'ready_for_review', link_state: 'off' } )

        return Promise.resolve()
      } )

      await runJob( userId, id )

      expect( linkJobMock ).not.toHaveBeenCalled()
    } )

    it( 'does not link a job whose summary failed', async () => {
      const id = await queueSummarizing()
      summarizeJobMock.mockImplementation( () => {
        updateJob( userId, id, { status: 'summary_failed' } )

        return Promise.resolve()
      } )

      await runJob( userId, id )

      expect( linkJobMock ).not.toHaveBeenCalled()
    } )
  } )

  describe( 'when the job is already linking', () => {
    const queueLinking = async (): Promise< string > => {
      const id = await queue()
      markStatus( userId, id, 'transcribing' )
      completeAcquisition( userId, id, {
        kind: 'video',
        meta: { ...meta, transcribed_at: NOW, model: 'test-model' },
        text: 'Hello',
      } )
      updateJob( userId, id, { status: 'linking', link_state: 'pending' } )

      return id
    }

    it( 'runs only the link step', async () => {
      const id = await queueLinking()

      await runJob( userId, id )

      expect( linkJobMock ).toHaveBeenCalledExactlyOnceWith( userId, id )
      expect( summarizeJobMock ).not.toHaveBeenCalled()
      expectClientsNotCalled()
    } )
  } )

  it( 'links a job that was summarized in the same run', async () => {
    const id = await queue()
    summarizeJobMock.mockImplementation( () => {
      updateJob( userId, id, { status: 'linking', link_state: 'pending' } )

      return Promise.resolve()
    } )

    await runJob( userId, id )

    expect( linkJobMock ).toHaveBeenCalledExactlyOnceWith( userId, id )
  } )

  it( 'rejects with NotFoundError for an unknown id', async () => {
    await expect( runJob( userId, 'missing' ) ).rejects.toBeInstanceOf( NotFoundError )

    expectClientsNotCalled()
  } )
} )

describe( 'runJob for articles', () => {
  const articleUrl = 'https://example.com/post'
  const fetchMock = vi.mocked( fetchArticle )
  const article = {
    kind: 'article' as const,
    meta: {
      title: 'A post',
      source: articleUrl,
      author: null,
      site: 'Example',
      published: null,
      fetched_at: NOW,
      origin: 'fetched' as const,
    },
    markdown: 'Some text.',
  }

  beforeEach( () => {
    fetchMock.mockReset()
    fetchMock.mockResolvedValue( article )
  } )

  it( 'fetches through fetching, stores the article and summarizes', async () => {
    const { id } = await queueJob( userId, { url: articleUrl } )
    const seen: string[] = []
    fetchMock.mockImplementation( () => {
      seen.push( findJob( userId, id ).status )

      return Promise.resolve( article )
    } )

    await runJob( userId, id )

    expect( seen ).toEqual( [ 'fetching' ] )
    expect( findJob( userId, id ) ).toMatchObject( { status: 'summarizing', title: 'A post' } )
    expect( findJobById( userId, id )?.source_document ).toEqual( article )
    expect( summarizeJobMock ).toHaveBeenCalledExactlyOnceWith( userId, id )
    expectClientsNotCalled()
  } )

  it( 'fails the job with the fetch error and does not summarize', async () => {
    const { id } = await queueJob( userId, { url: articleUrl } )
    fetchMock.mockRejectedValue( new Error( 'Not an article page' ) )

    await runJob( userId, id )

    expect( findJob( userId, id ) )
      .toMatchObject( { status: 'failed', error: 'Not an article page' } )
    expect( summarizeJobMock ).not.toHaveBeenCalled()
  } )

  it( 'goes straight to summarizing for a pasted-text job without fetching', async () => {
    const text = 'Pasted words. '.repeat( 30 )
    const { id } = await queueJob( userId, { url: articleUrl, text } )

    await runJob( userId, id )

    expect( fetchMock ).not.toHaveBeenCalled()
    expect( summarizeJobMock ).toHaveBeenCalledExactlyOnceWith( userId, id )
  } )
} )
