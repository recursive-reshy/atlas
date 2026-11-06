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
// Clients
import { getVideoMeta } from '../clients/youtubeData.client.js'
import { transcribeYouTube } from '../clients/gemini.client.js'
// Sources
import type { AdapterContext } from './adapter.js'
import { videoAdapter } from './video.adapter.js'

vi.mock( '../clients/youtubeData.client.js' )
vi.mock( '../clients/gemini.client.js' )
vi.mock( '../config.js', () => ( {
  config: {
    geminiModel: 'test-gemini',
    googleCloudProject: 'test-project',
    geminiLocation: 'global',
    youtubeApiKey: 'yt-key',
    geminiBaseUrl: null,
    youtubeApiBaseUrl: null,
    geminiAccessToken: null,
    logLevel: 'silent',
  },
} ) )

const NOW = '2026-10-14T12:00:00.000Z'
const url = 'https://www.youtube.com/watch?v=abc123'

const metadata = {
  title: 'A video',
  channel: 'A channel',
  duration_seconds: 12,
  privacy: 'public' as const,
}
const transcript = {
  text: 'Hello',
  truncated: false,
  inputTokens: 1000,
  outputTokens: 200,
}

const metaMock = vi.mocked( getVideoMeta )
const transcribeMock = vi.mocked( transcribeYouTube )

const context = (
  jobUrl: string = url,
  markStatus: AdapterContext[ 'markStatus' ] = vi.fn(),
  recordTranscription: AdapterContext[ 'recordTranscription' ] = vi.fn(),
): AdapterContext => {
  return {
    job: Job.parse( {
      id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b',
      url: jobUrl,
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
    markStatus,
    recordTranscription,
  }
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( new Date( NOW ) )
  vi.resetAllMocks()
  metaMock.mockResolvedValue( metadata )
  transcribeMock.mockResolvedValue( transcript )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'videoAdapter.acquire', () => {
  it( 'returns a video document with the metadata, the text and the model', async () => {
    const document = await videoAdapter.acquire( context() )

    expect( SourceDocument.parse( document ) ).toEqual( {
      kind: 'video',
      meta: {
        title: 'A video',
        source: url,
        channel: 'A channel',
        duration_seconds: 12,
        transcribed_at: NOW,
        model: 'test-gemini',
      },
      text: 'Hello',
    } )
  } )

  it( 'marks truncated only when Gemini stopped at its output limit', async () => {
    transcribeMock.mockResolvedValue( { ...transcript, truncated: true } )

    const document = await videoAdapter.acquire( context() )

    expect( document.kind === 'video' && document.meta.truncated ).toBe( true )
  } )

  it( 'marks transcribing before it calls anything', async () => {
    const seen: string[] = []
    const markStatus = vi.fn( ( status: string ) => {
      seen.push( status )
    } )

    metaMock.mockImplementation( () => {
      seen.push( 'metadata' )

      return Promise.resolve( metadata )
    } )
    transcribeMock.mockImplementation( () => {
      seen.push( 'gemini' )

      return Promise.resolve( transcript )
    } )

    await videoAdapter.acquire( context( url, markStatus ) )

    expect( seen ).toEqual( [ 'transcribing', 'metadata', 'gemini' ] )
  } )

  it( 'asks YouTube for the metadata by video ID, then Gemini for the canonical link', async () => {
    await videoAdapter.acquire( context( 'https://youtu.be/abc123?t=30' ) )

    expect( metaMock )
      .toHaveBeenCalledWith( 'abc123', expect.objectContaining( { apiKey: 'yt-key' } ) )
    expect( transcribeMock ).toHaveBeenCalledWith(
      'https://www.youtube.com/watch?v=abc123',
      expect.objectContaining( {
        project: 'test-project',
        location: 'global',
        model: 'test-gemini',
        getAccessToken: expect.any( Function ) as unknown,
      } ),
    )
  } )

  it( 'reads shorts and mobile links', async () => {
    await videoAdapter.acquire( context( 'https://m.youtube.com/shorts/xyz789' ) )

    expect( metaMock ).toHaveBeenCalledWith( 'xyz789', expect.anything() )
  } )

  describe( 'a link that is not a YouTube video', () => {
    it.each( [
      [ 'https://vimeo.com/123', 'Only YouTube videos are supported' ],
      [ 'https://www.youtube.com/', 'Could not find a video in that YouTube link' ],
    ] )( 'refuses %s without calling anything or recording a run', async ( link, message ) => {
      const record = vi.fn()

      await expect( videoAdapter.acquire( context( link, vi.fn(), record ) ) )
        .rejects.toThrow( message )

      expect( metaMock ).not.toHaveBeenCalled()
      expect( transcribeMock ).not.toHaveBeenCalled()
      expect( record ).not.toHaveBeenCalled()
    } )
  } )

  describe( 'recording the transcription', () => {
    it( 'records an ok run with the video length, model and tokens', async () => {
      const record = vi.fn()

      await videoAdapter.acquire( context( url, vi.fn(), record ) )

      expect( record ).toHaveBeenCalledOnce()
      expect( record ).toHaveBeenCalledWith( {
        model: 'test-gemini',
        audio_seconds: 12,
        input_tokens: 1000,
        output_tokens: 200,
        outcome: 'ok',
        error: null,
      } )
    } )

    it( 'records an error run with no tokens, and still fails, when Gemini fails', async () => {
      const record = vi.fn()

      transcribeMock.mockRejectedValue( new Error( 'Gemini request failed (500)' ) )

      await expect( videoAdapter.acquire( context( url, vi.fn(), record ) ) )
        .rejects.toThrow( 'Gemini request failed (500)' )

      expect( record ).toHaveBeenCalledOnce()
      expect( record ).toHaveBeenCalledWith( {
        model: 'test-gemini',
        audio_seconds: 12,
        input_tokens: null,
        output_tokens: null,
        outcome: 'error',
        error: 'Gemini request failed (500)',
      } )
    } )

    it.each( [
      [ 'not found', 'Video not found or not public' ],
      [ 'private', 'Only public YouTube videos are supported' ],
    ] )( 'records nothing and never calls Gemini for a video that is %s', async (
      _kind,
      message,
    ) => {
      const record = vi.fn()

      metaMock.mockRejectedValue( new Error( message ) )

      await expect( videoAdapter.acquire( context( url, vi.fn(), record ) ) )
        .rejects.toThrow( message )

      expect( transcribeMock ).not.toHaveBeenCalled()
      expect( record ).not.toHaveBeenCalled()
    } )
  } )

  it( 'calls no client when the first status change is refused', async () => {
    const markStatus = vi.fn( () => {
      throw new Error( 'conflict' )
    } )

    await expect( videoAdapter.acquire( context( url, markStatus ) ) ).rejects.toThrow( 'conflict' )

    expect( metaMock ).not.toHaveBeenCalled()
    expect( transcribeMock ).not.toHaveBeenCalled()
  } )
} )
