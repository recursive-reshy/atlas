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
import { Segment } from '@atlas/shared'
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
// Sources
import { fetchArticle } from '../sources/extractArticle.js'
// Clients
import { downloadAudio } from '../clients/ytDlp.client.js'
import { convertToWav } from '../clients/ffmpeg.client.js'
import { transcribeAudio } from '../clients/whisperServer.client.js'
// Worker
import { runJob } from './runJob.js'
import { linkJob } from './linkJob.js'
import { summarizeJob } from './summarizeJob.js'
// Node
import { rm } from 'node:fs/promises'
// Logging
import { logger } from '../logger.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../clients/ytDlp.client.js' )
vi.mock( '../clients/ffmpeg.client.js' )
vi.mock( '../clients/whisperServer.client.js' )
vi.mock( './summarizeJob.js' )
vi.mock( './linkJob.js' )
vi.mock( '../sources/extractArticle.js' )
vi.mock( 'node:fs/promises' )
vi.mock( '../config.js', () => ( {
  config: {
    workDir: '/work',
    whisperUrl: 'http://whisper:8178',
    whisperModel: 'test-model',
    logLevel: 'silent',
    sessionDays: 30,
  },
} ) )

const NOW = '2026-10-14T12:00:00.000Z'
const URL_FORBIDDEN =
  'yt-dlp failed: ERROR: unable to download video data: HTTP Error 403: Forbidden'

const meta = {
  title: 'A video',
  source: 'https://www.youtube.com/watch?v=abc',
  channel: 'A channel',
  duration_seconds: 12,
}
const download = { audioPath: '/work/audio.webm', meta }
const segments: Segment[] = [ { start: 0, end: 1.5, text: 'Hello' } ]

const downloadMock = vi.mocked( downloadAudio )
const convertMock = vi.mocked( convertToWav )
const transcribeMock = vi.mocked( transcribeAudio )
const rmMock = vi.mocked( rm )
const summarizeJobMock = vi.mocked( summarizeJob )
const linkJobMock = vi.mocked( linkJob )

const queue = async (): Promise< string > => {
  return ( await queueJob( userId, { url: 'https://www.youtube.com/watch?v=abc' } ) ).id
}

const expectClientsNotCalled = (): void => {
  expect( downloadMock ).not.toHaveBeenCalled()
  expect( convertMock ).not.toHaveBeenCalled()
  expect( transcribeMock ).not.toHaveBeenCalled()
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( new Date( NOW ) )
  clearJobs( userId )
  vi.resetAllMocks()
  downloadMock.mockResolvedValue( download )
  convertMock.mockResolvedValue( '/work/audio.wav' )
  transcribeMock.mockResolvedValue( segments )
  rmMock.mockResolvedValue( undefined )
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
      segments,
    } )
  } )

  it( 'passes the right arguments to each client', async () => {
    const id = await queue()

    await runJob( userId, id )

    expect( downloadMock ).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc',
      `/work/${ id }`,
    )
    expect( convertMock ).toHaveBeenCalledWith( '/work/audio.webm' )
    expect( transcribeMock ).toHaveBeenCalledWith( '/work/audio.wav', 'http://whisper:8178' )
  } )

  it( 'moves through downloading, converting and transcribing', async () => {
    const id = await queue()
    const seen: string[] = []
    downloadMock.mockImplementation( () => {
      seen.push( findJob( userId, id ).status )
      return Promise.resolve( download )
    } )
    convertMock.mockImplementation( () => {
      seen.push( findJob( userId, id ).status )
      return Promise.resolve( '/work/audio.wav' )
    } )
    transcribeMock.mockImplementation( () => {
      seen.push( findJob( userId, id ).status )
      return Promise.resolve( segments )
    } )

    await runJob( userId, id )

    expect( seen ).toEqual( [ 'downloading', 'converting', 'transcribing' ] )
  } )

  describe.each( [
    { step: 'download', fail: () => downloadMock, later: [ convertMock, transcribeMock ] },
    { step: 'convert', fail: () => convertMock, later: [ transcribeMock ] },
    { step: 'transcribe', fail: () => transcribeMock, later: [] },
  ] )( 'when $step fails', ( { fail, later } ) => {
    it( 'fails the job with the message and skips later clients', async () => {
      const id = await queue()
      fail().mockRejectedValue( new Error( 'boom' ) )

      await runJob( userId, id )

      expect( findJob( userId, id ) ).toMatchObject( { status: 'failed', error: 'boom' } )
      later.forEach( ( mock ) => expect( mock ).not.toHaveBeenCalled() )
    } )

    it( 'still removes the work folder', async () => {
      const id = await queue()
      fail().mockRejectedValue( new Error( 'boom' ) )

      await runJob( userId, id )

      expect( rmMock ).toHaveBeenCalledWith( `/work/${ id }`, { recursive: true, force: true } )
    } )

    it( 'fails with Unknown error for a non-Error rejection', async () => {
      const id = await queue()
      fail().mockRejectedValue( 'nope' )

      await runJob( userId, id )

      expect( findJob( userId, id ) ).toMatchObject( { status: 'failed', error: 'Unknown error' } )
    } )
  } )

  it( 'summarizes after the audio is removed', async () => {
    const id = await queue()

    await runJob( userId, id )

    expect( summarizeJobMock ).toHaveBeenCalledWith( userId, id )
    expect( rmMock.mock.invocationCallOrder[ 0 ] ).toBeLessThan(
      summarizeJobMock.mock.invocationCallOrder[ 0 ],
    )
  } )

  it( 'does not summarize when the pipeline fails', async () => {
    const id = await queue()
    transcribeMock.mockRejectedValue( new Error( 'boom' ) )

    await runJob( userId, id )

    expect( summarizeJobMock ).not.toHaveBeenCalled()
  } )

  it( 'removes the work folder after success', async () => {
    const id = await queue()

    await runJob( userId, id )

    expect( rmMock ).toHaveBeenCalledWith( `/work/${ id }`, { recursive: true, force: true } )
  } )

  it( 'keeps the job summarizing and resolves when cleanup fails', async () => {
    const id = await queue()
    const errorSpy = vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )
    rmMock.mockRejectedValue( new Error( 'disk' ) )

    await expect( runJob( userId, id ) ).resolves.toBeUndefined()

    expect( findJob( userId, id ).status ).toBe( 'summarizing' )
    expect( errorSpy ).toHaveBeenCalled()
  } )

  it( 'retries once after a 403, cleaning up first', async () => {
    const id = await queue()
    downloadMock
      .mockRejectedValueOnce( new Error( URL_FORBIDDEN ) )
      .mockResolvedValueOnce( download )

    const run = runJob( userId, id )
    await vi.advanceTimersByTimeAsync( 3000 )
    await run

    expect( findJob( userId, id ).status ).toBe( 'summarizing' )
    expect( downloadMock ).toHaveBeenCalledTimes( 2 )
    expect( rmMock.mock.invocationCallOrder[ 0 ] ).toBeLessThan(
      downloadMock.mock.invocationCallOrder[ 1 ],
    )
  } )

  it( 'fails after a second 403 without a third attempt', async () => {
    const id = await queue()
    downloadMock.mockRejectedValue( new Error( URL_FORBIDDEN ) )

    const run = runJob( userId, id )
    await vi.advanceTimersByTimeAsync( 3000 )
    await run

    expect( findJob( userId, id ) ).toMatchObject( { status: 'failed', error: URL_FORBIDDEN } )
    expect( downloadMock ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'does not retry other download errors', async () => {
    const id = await queue()
    downloadMock.mockRejectedValue( new Error( 'Video unavailable' ) )

    await runJob( userId, id )

    expect( downloadMock ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'rejects with ConflictError when the job is not queued', async () => {
    const id = await queue()
    markStatus( userId, id, 'downloading' )

    await expect( runJob( userId, id ) ).rejects.toBeInstanceOf( ConflictError )

    expectClientsNotCalled()
    expect( rmMock ).not.toHaveBeenCalled()
    expect( findJob( userId, id ).status ).toBe( 'downloading' )
  } )

  describe( 'when the job is already summarizing', () => {
    const queueSummarizing = async (): Promise< string > => {
      const id = await queue()
      markStatus( userId, id, 'downloading' )
      markStatus( userId, id, 'converting' )
      markStatus( userId, id, 'transcribing' )
      completeAcquisition( userId, id, {
        kind: 'video',
        meta: { ...meta, transcribed_at: NOW, model: 'test-model' },
        segments,
      } )

      return id
    }

    it( 'runs only the summarize step', async () => {
      const id = await queueSummarizing()

      await runJob( userId, id )

      expect( summarizeJobMock ).toHaveBeenCalledExactlyOnceWith( userId, id )
      expectClientsNotCalled()
      expect( rmMock ).not.toHaveBeenCalled()
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
      markStatus( userId, id, 'downloading' )
      markStatus( userId, id, 'converting' )
      markStatus( userId, id, 'transcribing' )
      completeAcquisition( userId, id, {
        kind: 'video',
        meta: { ...meta, transcribed_at: NOW, model: 'test-model' },
        segments,
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
      expect( rmMock ).not.toHaveBeenCalled()
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
    expect( rmMock ).not.toHaveBeenCalled()
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
    expect( rmMock ).not.toHaveBeenCalled()
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
