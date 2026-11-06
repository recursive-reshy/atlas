// Shared
import { ONLY_YOUTUBE_MESSAGE, VideoSource } from '@atlas/shared'
// Clients
import { transcribeYouTube } from '../clients/gemini.client.js'
import { geminiOptions, youtubeDataOptions } from '../clients/geminiOptions.js'
import { getVideoMeta } from '../clients/youtubeData.client.js'
// Config
import { config } from '../config.js'
// Formatters
import { youTubeVideoId } from '../formatters/youtube.js'
// Sources
import type { SourceAdapter } from './adapter.js'

const errorMessage = ( error: unknown ): string => {
  return error instanceof Error ? error.message : 'Unknown error'
}

// Gemini reads the video from its link, so nothing is downloaded (ADR 0081)
export const videoAdapter: SourceAdapter = {
  acquire: async ( { job, markStatus, recordTranscription } ) => {
    markStatus( 'transcribing' )

    const videoId = youTubeVideoId( job.url )

    if( videoId === undefined ) {
      const isYouTube = URL.parse( job.url )?.hostname.includes( 'youtu' ) === true

      throw new Error( isYouTube
        ? 'Could not find a video in that YouTube link'
        : ONLY_YOUTUBE_MESSAGE )
    }

    // First, so a private or missing video never reaches Gemini and costs nothing
    const meta = await getVideoMeta( videoId, youtubeDataOptions() )
    const source = `https://www.youtube.com/watch?v=${ videoId }`
    const attempt = { model: config.geminiModel, audio_seconds: meta.duration_seconds }
    let transcript: Awaited< ReturnType< typeof transcribeYouTube > >

    try {
      transcript = await transcribeYouTube( source, geminiOptions() )
    } catch( error ) {
      recordTranscription( {
        ...attempt,
        input_tokens: null,
        output_tokens: null,
        outcome: 'error',
        error: errorMessage( error ),
      } )

      throw error
    }

    recordTranscription( {
      ...attempt,
      input_tokens: transcript.inputTokens,
      output_tokens: transcript.outputTokens,
      outcome: 'ok',
      error: null,
    } )

    return VideoSource.parse( {
      kind: 'video',
      meta: {
        title: meta.title,
        source,
        channel: meta.channel,
        duration_seconds: meta.duration_seconds,
        transcribed_at: new Date().toISOString(),
        model: config.geminiModel,
        ...transcript.truncated ? { truncated: true } : {},
      },
      text: transcript.text,
    } )
  },
}
