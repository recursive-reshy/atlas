// Packages
import { mkdir, readdir } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
// Shared
import { TranscriptMeta } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Clients
import { runCommand } from './runCommand.js'

const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000
const UNEXPECTED_OUTPUT = 'Unexpected output from yt-dlp'

const DownloadedMeta = TranscriptMeta.pick( {
  title: true,
  source: true,
  channel: true,
  duration_seconds: true,
} )

export type DownloadedAudio = {
  audioPath: string
  meta: z.infer< typeof DownloadedMeta >
}

const YtDlpOutput = z.object( {
  id: z.string(),
  webpage_url: z.string(),
  title: z.string().nullish(),
  channel: z.string().nullish(),
  uploader: z.string().nullish(),
  duration: z.number().nullish(),
} )

const parseOutput = ( stdout: string ): z.infer< typeof YtDlpOutput > => {
  const lastLine = stdout
    .split( '\n' )
    .map( ( line ) => line.trim() )
    .filter( ( line ) => line !== '' )
    .at( -1 )

  let json: unknown

  try {
    json = JSON.parse( lastLine ?? '' )
  } catch( error ) {
    throw new Error( UNEXPECTED_OUTPUT, { cause: error } )
  }

  const parsed = YtDlpOutput.safeParse( json )

  if( !parsed.success ) {
    throw new Error( UNEXPECTED_OUTPUT )
  }

  return parsed.data
}

// Where yt-dlp's bgutil plugin asks for PO tokens (ADR 0079)
const potProviderArgs = (): string[] => {
  return config.potProviderUrl === null
    ? []
    : [ '--extractor-args', `youtubepot-bgutilhttp:base_url=${ config.potProviderUrl }` ]
}

export const downloadAudio = async (
  url: string,
  outputDir: string,
): Promise< DownloadedAudio > => {
  await mkdir( outputDir, { recursive: true } )

  const { stdout } = await runCommand(
    'yt-dlp',
    [
      '--no-playlist',
      '--no-simulate',
      '-f',
      'bestaudio',
      '-o',
      path.join( outputDir, 'audio.%(ext)s' ),
      '--print',
      '%(.{id,title,channel,uploader,duration,webpage_url})j',
      ...potProviderArgs(),
      '--',
      url,
    ],
    DOWNLOAD_TIMEOUT_MS,
  )

  const output = parseOutput( stdout )
  const hasTitle = output.title !== undefined && output.title !== null && output.title !== ''

  const meta = DownloadedMeta.parse( {
    title: hasTitle ? output.title : output.id,
    source: output.webpage_url,
    channel: output.channel ?? output.uploader ?? '',
    duration_seconds: Math.round( output.duration ?? 0 ),
  } )

  const files = await readdir( outputDir )
  const audioFile = files.find( ( name ) => name.startsWith( 'audio.' ) )

  if( audioFile === undefined ) {
    throw new Error( 'yt-dlp did not produce an audio file' )
  }

  return { audioPath: path.join( outputDir, audioFile ), meta }
}
