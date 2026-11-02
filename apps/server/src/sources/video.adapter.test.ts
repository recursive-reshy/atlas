// Node
import { rm } from 'node:fs/promises'
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
import { Job, SourceDocument } from '@atlas/shared'
import type { Segment } from '@atlas/shared'
// Clients
import { downloadAudio } from '../clients/ytDlp.client.js'
import { convertToWav } from '../clients/ffmpeg.client.js'
import { transcribeAudio } from '../clients/whisperServer.client.js'
// Sources
import type { AdapterContext } from './adapter.js'
import { videoAdapter } from './video.adapter.js'
// Logging
import { logger } from '../logger.js'

vi.mock( '../clients/ytDlp.client.js' )
vi.mock( '../clients/ffmpeg.client.js' )
vi.mock( '../clients/whisperServer.client.js' )
vi.mock( 'node:fs/promises' )
vi.mock( '../config.js', () => ( {
  config: {
    whisperUrl: 'http://whisper:8178',
    whisperModel: 'test-model',
    logLevel: 'silent',
  },
} ) )

const NOW = '2026-10-14T12:00:00.000Z'
const FORBIDDEN =
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

const context = (
  markStatus: AdapterContext[ 'markStatus' ] = vi.fn(),
): AdapterContext => {
  return {
    job: Job.parse( {
      id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b',
      url: meta.source,
      status: 'queued',
      error: null,
      created_at: NOW,
      updated_at: NOW,
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
    } ),
    workDir: '/work/job',
    markStatus,
  }
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( new Date( NOW ) )
  vi.resetAllMocks()
  downloadMock.mockResolvedValue( download )
  convertMock.mockResolvedValue( '/work/audio.wav' )
  transcribeMock.mockResolvedValue( segments )
  rmMock.mockResolvedValue( undefined )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'videoAdapter.acquire', () => {
  it( 'returns a video document with the metadata, segments and model', async () => {
    const document = await videoAdapter.acquire( context() )

    expect( SourceDocument.parse( document ) ).toEqual( {
      kind: 'video',
      meta: { ...meta, transcribed_at: NOW, model: 'test-model' },
      segments,
    } )
  } )

  it( 'passes the right arguments to each client', async () => {
    await videoAdapter.acquire( context() )

    expect( downloadMock ).toHaveBeenCalledWith( meta.source, '/work/job' )
    expect( convertMock ).toHaveBeenCalledWith( '/work/audio.webm' )
    expect( transcribeMock ).toHaveBeenCalledWith( '/work/audio.wav', 'http://whisper:8178' )
  } )

  it( 'marks downloading, converting and transcribing before each step', async () => {
    const seen: string[] = []
    const markStatus = vi.fn( ( status: string ) => {
      seen.push( status )
    } )
    downloadMock.mockImplementation( () => {
      seen.push( 'download' )

      return Promise.resolve( download )
    } )
    convertMock.mockImplementation( () => {
      seen.push( 'convert' )

      return Promise.resolve( '/work/audio.wav' )
    } )

    await videoAdapter.acquire( context( markStatus ) )

    expect( seen ).toEqual( [
      'downloading',
      'download',
      'converting',
      'convert',
      'transcribing',
    ] )
  } )

  it( 'removes the work folder after success', async () => {
    await videoAdapter.acquire( context() )

    expect( rmMock ).toHaveBeenCalledWith( '/work/job', { recursive: true, force: true } )
  } )

  it( 'removes the work folder and rethrows when a step fails', async () => {
    transcribeMock.mockRejectedValue( new Error( 'boom' ) )

    await expect( videoAdapter.acquire( context() ) ).rejects.toThrow( 'boom' )

    expect( rmMock ).toHaveBeenCalledWith( '/work/job', { recursive: true, force: true } )
  } )

  it( 'still returns the document when cleanup fails, and logs it', async () => {
    const errorSpy = vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )
    rmMock.mockRejectedValue( new Error( 'disk' ) )

    await expect( videoAdapter.acquire( context() ) ).resolves.toMatchObject( { kind: 'video' } )

    expect( errorSpy ).toHaveBeenCalled()
  } )

  it( 'retries once after a 403, cleaning up first', async () => {
    downloadMock
      .mockRejectedValueOnce( new Error( FORBIDDEN ) )
      .mockResolvedValueOnce( download )

    const run = videoAdapter.acquire( context() )
    await vi.advanceTimersByTimeAsync( 3000 )
    await run

    expect( downloadMock ).toHaveBeenCalledTimes( 2 )
    expect( rmMock.mock.invocationCallOrder[ 0 ] ).toBeLessThan(
      downloadMock.mock.invocationCallOrder[ 1 ] ?? 0,
    )
  } )

  it( 'fails after a second 403 without a third attempt', async () => {
    downloadMock.mockRejectedValue( new Error( FORBIDDEN ) )

    const run = videoAdapter.acquire( context() )
    const outcome = expect( run ).rejects.toThrow( FORBIDDEN )
    await vi.advanceTimersByTimeAsync( 3000 )
    await outcome

    expect( downloadMock ).toHaveBeenCalledTimes( 2 )
  } )

  it( 'does not retry other download errors', async () => {
    downloadMock.mockRejectedValue( new Error( 'Video unavailable' ) )

    await expect( videoAdapter.acquire( context() ) ).rejects.toThrow( 'Video unavailable' )

    expect( downloadMock ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'touches no files and runs no client when the first status change is refused', async () => {
    const markStatus = vi.fn( () => {
      throw new Error( 'conflict' )
    } )

    await expect( videoAdapter.acquire( context( markStatus ) ) ).rejects.toThrow( 'conflict' )

    expect( downloadMock ).not.toHaveBeenCalled()
    expect( rmMock ).not.toHaveBeenCalled()
  } )
} )
