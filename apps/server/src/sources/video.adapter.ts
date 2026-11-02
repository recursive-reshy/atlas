// Packages
import { rm } from 'node:fs/promises'
// Shared
import { VideoSource } from '@atlas/shared'
// Clients
import { downloadAudio } from '../clients/ytDlp.client.js'
import { prepareAudio } from '../clients/ffmpeg.client.js'
import { transcribePieces } from '../clients/openaiTranscription.client.js'
// Config
import { config } from '../config.js'
// Sources
import type { SourceAdapter } from './adapter.js'
// Logging
import { logger } from '../logger.js'

const RETRY_DELAY_MS = 3000
const removeOptions = { recursive: true, force: true }

const downloadWithRetry = async (
  url: string,
  workDir: string,
): ReturnType< typeof downloadAudio > => {
  try {
    return await downloadAudio( url, workDir )
  } catch( error ) {
    if( !( error instanceof Error && error.message.includes( '403' ) ) ) {
      throw error
    }
  }

  await rm( workDir, removeOptions )
  await new Promise( ( resolve ) => setTimeout( resolve, RETRY_DELAY_MS ) )

  return downloadAudio( url, workDir )
}

export const videoAdapter: SourceAdapter = {
  acquire: async ( { job, workDir, markStatus } ) => {
    markStatus( 'downloading' )

    try {
      const { audioPath, meta } = await downloadWithRetry( job.url, workDir )

      markStatus( 'converting' )
      const pieces = await prepareAudio( audioPath )

      markStatus( 'transcribing' )
      const text = await transcribePieces( pieces, {
        baseUrl: config.openaiBaseUrl,
        apiKey: config.openaiApiKey,
        model: config.transcriptionModel,
      } )

      return VideoSource.parse( {
        kind: 'video',
        meta: {
          ...meta,
          transcribed_at: new Date().toISOString(),
          model: config.transcriptionModel,
        },
        text,
      } )
    } finally {
      try {
        await rm( workDir, removeOptions )
      } catch( cleanupError ) {
        logger.error( { err: cleanupError, workDir }, 'Could not remove work folder' )
      }
    }
  },
}
