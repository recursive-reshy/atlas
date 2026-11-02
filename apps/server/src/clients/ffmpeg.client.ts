// Packages
import { stat } from 'node:fs/promises'
import path from 'node:path'
// Clients
import { runCommand } from './runCommand.js'

const CONVERT_TIMEOUT_MS = 30 * 60 * 1000

// Under the API's 25 MB upload limit (ADR 0074)
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024
const SILENCE_SEARCH_SECONDS = 30
const SILENCE_FILTER = 'silencedetect=noise=-35dB:d=0.4'
const PROBE_TIMEOUT_MS = 60 * 1000
const SCAN_TIMEOUT_MS = 5 * 60 * 1000
const NO_AUDIO = 'ffmpeg did not produce an audio file'

type Silence = { start: number, end: number }

export const parseSilences = ( report: string ): Silence[] => {
  const silences: Silence[] = []
  let start: number | undefined

  for( const line of report.split( '\n' ) ) {
    const started = /silence_start: (-?[\d.]+)/.exec( line )
    const ended = /silence_end: (-?[\d.]+)/.exec( line )

    if( started?.[ 1 ] !== undefined ) {
      start = Number( started[ 1 ] )
    } else if( ended?.[ 1 ] !== undefined && start !== undefined ) {
      silences.push( { start, end: Number( ended[ 1 ] ) } )
      start = undefined
    }
  }

  return silences
}

export const chooseCut = ( target: number, silences: Silence[] ): number => {
  const middles = silences.map( ( { start, end } ) => ( start + end ) / 2 )
  const nearest = middles.toSorted( ( a, b ) => Math.abs( a - target ) - Math.abs( b - target ) )

  return nearest[ 0 ] ?? target
}

const seconds = ( value: number ): string => String( Math.round( value * 10_000 ) / 10_000 )

const sizeOf = async ( file: string ): Promise< number > => {
  return ( await stat( file ).catch( () => ( { size: 0 } ) ) ).size
}

const findCut = async ( encodedPath: string, target: number ): Promise< number > => {
  const windowStart = Math.max( 0, target - SILENCE_SEARCH_SECONDS )
  const { stderr } = await runCommand(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostdin',
      '-ss',
      seconds( windowStart ),
      '-t',
      String( SILENCE_SEARCH_SECONDS * 2 ),
      '-i',
      encodedPath,
      '-af',
      SILENCE_FILTER,
      '-f',
      'null',
      '-',
    ],
    SCAN_TIMEOUT_MS,
  )
  // Input seeking restarts the clock, so the times are from the window's start
  const silences = parseSilences( stderr )
    .map( ( { start, end } ) => ( { start: windowStart + start, end: windowStart + end } ) )

  return chooseCut( target, silences )
}

const splitAudio = async (
  encodedPath: string,
  size: number,
  maxBytes: number,
): Promise< string[] > => {
  const count = Math.ceil( size / maxBytes )
  const { stdout } = await runCommand(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      encodedPath,
    ],
    PROBE_TIMEOUT_MS,
  )
  const duration = Number( stdout.trim() )
  const edges = [ 0 ]

  for( let index = 1; index < count; index += 1 ) {
    edges.push( await findCut( encodedPath, ( duration * index ) / count ) )
  }

  edges.push( duration )

  const parts: string[] = []

  for( let index = 0; index < count; index += 1 ) {
    const number = String( index + 1 ).padStart( 2, '0' )
    const partPath = path.join( path.dirname( encodedPath ), `part-${ number }.webm` )

    await runCommand(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-i',
        encodedPath,
        '-ss',
        seconds( edges[ index ] ?? 0 ),
        '-to',
        seconds( edges[ index + 1 ] ?? duration ),
        '-c',
        'copy',
        partPath,
      ],
      CONVERT_TIMEOUT_MS,
    )

    const partSize = await sizeOf( partPath )

    if( partSize === 0 ) {
      throw new Error( NO_AUDIO )
    }

    if( partSize > maxBytes ) {
      throw new Error( 'Audio could not be split under the upload limit' )
    }

    parts.push( partPath )
  }

  return parts
}

// One upload-ready file, or several in order when the audio is over the upload limit (ADR 0074)
export const prepareAudio = async (
  inputPath: string,
  { maxBytes = MAX_UPLOAD_BYTES }: { maxBytes?: number } = {},
): Promise< string[] > => {
  const encodedPath = path.join( path.dirname( inputPath ), 'encoded.webm' )

  await runCommand(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '16000',
      '-c:a',
      'libopus',
      '-b:a',
      '24k',
      '-application',
      'voip',
      encodedPath,
    ],
    CONVERT_TIMEOUT_MS,
  )

  const size = await sizeOf( encodedPath )

  if( size === 0 ) {
    throw new Error( NO_AUDIO )
  }

  return size <= maxBytes ? [ encodedPath ] : splitAudio( encodedPath, size, maxBytes )
}
