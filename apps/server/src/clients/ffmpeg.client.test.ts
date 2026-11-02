// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
import { stat } from 'node:fs/promises'
// Clients
import {
  chooseCut,
  parseSilences,
  prepareAudio,
} from './ffmpeg.client.js'
import { runCommand } from './runCommand.js'

vi.mock( './runCommand.js' )
vi.mock( 'node:fs/promises' )

const stubStat = ( size: number ): void => {
  vi.mocked( stat ).mockResolvedValue( { size } as Awaited< ReturnType< typeof stat > > )
}

beforeEach( () => {
  vi.resetAllMocks()
  vi.mocked( runCommand ).mockResolvedValue( { stdout: '', stderr: '' } )
  stubStat( 1024 )
} )

const MB = 1024 * 1024
const SILENCE_REPORT = [
  '[silencedetect @ 0x1] silence_start: 12.5',
  '[silencedetect @ 0x1] silence_end: 13.7 | silence_duration: 1.2',
  '[silencedetect @ 0x1] silence_start: 40',
  '[silencedetect @ 0x1] silence_end: 41 | silence_duration: 1',
].join( '\n' )

describe( 'parseSilences', () => {
  it( 'reads each start and end pair', () => {
    expect( parseSilences( SILENCE_REPORT ) ).toEqual( [
      { start: 12.5, end: 13.7 },
      { start: 40, end: 41 },
    ] )
  } )

  it( 'ignores lines that are not silencedetect output and a start without an end', () => {
    expect( parseSilences( 'size=N/A\n[silencedetect @ 0x1] silence_start: 3' ) ).toEqual( [] )
  } )
} )

describe( 'chooseCut', () => {
  it( 'cuts at the middle of the silence nearest the target', () => {
    const silences = [ { start: 10, end: 12 }, { start: 50, end: 52 } ]

    expect( chooseCut( 45, silences ) ).toBe( 51 )
    expect( chooseCut( 14, silences ) ).toBe( 11 )
  } )

  it( 'cuts at the target when there is no silence', () => {
    expect( chooseCut( 45, [] ) ).toBe( 45 )
  } )
} )

describe( 'prepareAudio', () => {
  const input = '/tmp/work/job1/audio.m4a'
  const encoded = '/tmp/work/job1/encoded.webm'
  let sizes: Record< string, number > = {}

  // A fake ffmpeg: ffprobe says the audio lasts 3000 s; a silencedetect pass reports one silence
  // 2 s after its window starts; every other call "writes" a file whose size is in `sizes`.
  const fakeTools = (): void => {
    vi.mocked( runCommand ).mockImplementation( ( command, args ) => {
      if( command === 'ffprobe' ) {
        return Promise.resolve( { stdout: '3000.04\n', stderr: '' } )
      }

      if( args.includes( 'silencedetect=noise=-35dB:d=0.4' ) ) {
        return Promise.resolve( {
          stdout: '',
          stderr: '[silencedetect @ 0x1] silence_start: 2\n'
            + '[silencedetect @ 0x1] silence_end: 4 | silence_duration: 2',
        } )
      }

      return Promise.resolve( { stdout: '', stderr: '' } )
    } )
    vi.mocked( stat ).mockImplementation( ( file ) => {
      const result = { size: sizes[ String( file ) ] ?? 0 }

      return Promise.resolve( result as Awaited< ReturnType< typeof stat > > )
    } )
  }

  beforeEach( () => {
    sizes = { [ encoded ]: 10 * MB }
    fakeTools()
  } )

  it( 'encodes once as mono 16 kHz Opus in WebM at 24 kbit/s', async () => {
    await prepareAudio( input )

    expect( runCommand ).toHaveBeenCalledTimes( 1 )
    expect( runCommand ).toHaveBeenCalledWith(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-y',
        '-i',
        input,
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
        encoded,
      ],
      30 * 60 * 1000,
    )
  } )

  it( 'returns the one file when it is under the limit', async () => {
    expect( await prepareAudio( input ) ).toEqual( [ encoded ] )
  } )

  it( 'returns the one file when it is exactly the limit', async () => {
    sizes[ encoded ] = 24 * MB

    expect( await prepareAudio( input ) ).toEqual( [ encoded ] )
  } )

  it( 'throws when the output is missing or empty', async () => {
    sizes[ encoded ] = 0

    await expect( prepareAudio( input ) ).rejects.toThrow( 'ffmpeg did not produce an audio file' )
  } )

  it( 'propagates a failure of the encode', async () => {
    const error = new Error( 'ffmpeg failed: Invalid data' )
    vi.mocked( runCommand ).mockRejectedValue( error )

    await expect( prepareAudio( input ) ).rejects.toBe( error )
  } )

  describe( 'over the limit', () => {
    const part = ( number: string ): string => `/tmp/work/job1/part-${ number }.webm`

    beforeEach( () => {
      sizes[ encoded ] = 50 * MB
      sizes[ part( '01' ) ] = 17 * MB
      sizes[ part( '02' ) ] = 17 * MB
      sizes[ part( '03' ) ] = 16 * MB
    } )

    it( 'splits into ceil( size / limit ) parts, in order', async () => {
      expect( await prepareAudio( input ) ).toEqual( [ part( '01' ), part( '02' ), part( '03' ) ] )
    } )

    it( 'looks for silence 30 seconds either side of each equal-part boundary', async () => {
      await prepareAudio( input )

      const scans = vi.mocked( runCommand ).mock.calls
        .filter( ( [ , args ] ) => args.includes( 'silencedetect=noise=-35dB:d=0.4' ) )
        .map( ( [ , args ] ) => {
          return [ args[ args.indexOf( '-ss' ) + 1 ], args[ args.indexOf( '-t' ) + 1 ] ]
        } )

      expect( scans ).toEqual( [ [ '970.0133', '60' ], [ '1970.0267', '60' ] ] )
    } )

    it( 'cuts in the middle of the silence it found and copies the audio', async () => {
      await prepareAudio( input )

      const cuts = vi.mocked( runCommand ).mock.calls
        .filter( ( [ command, args ] ) => command === 'ffmpeg' && args.includes( 'copy' ) )
        .map( ( [ , args ] ) => args )

      expect( cuts ).toHaveLength( 3 )
      expect( cuts[ 0 ]?.slice( cuts[ 0 ].indexOf( '-ss' ) ) )
        .toEqual( [ '-ss', '0', '-to', '973.0133', '-c', 'copy', part( '01' ) ] )
      expect( cuts[ 1 ]?.slice( cuts[ 1 ].indexOf( '-ss' ) ) )
        .toEqual( [ '-ss', '973.0133', '-to', '1973.0267', '-c', 'copy', part( '02' ) ] )
      expect( cuts[ 2 ]?.slice( cuts[ 2 ].indexOf( '-ss' ) ) )
        .toEqual( [ '-ss', '1973.0267', '-to', '3000.04', '-c', 'copy', part( '03' ) ] )
    } )

    it( 'cuts at the boundary itself when there is no silence', async () => {
      vi.mocked( runCommand ).mockImplementation( ( command, args ) => {
        if( command === 'ffprobe' ) {
          return Promise.resolve( { stdout: '3000\n', stderr: '' } )
        }

        return Promise.resolve( { stdout: '', stderr: args.includes( 'copy' ) ? '' : 'size=N/A' } )
      } )

      await prepareAudio( input )

      const cut = vi.mocked( runCommand ).mock.calls
        .find( ( [ , args ] ) => args.includes( 'copy' ) )?.[ 1 ]

      expect( cut?.slice( cut.indexOf( '-ss' ) ) )
        .toEqual( [ '-ss', '0', '-to', '1000', '-c', 'copy', part( '01' ) ] )
    } )

    it( 'splits at a lowered limit', async () => {
      sizes[ encoded ] = 10 * MB
      sizes[ part( '01' ) ] = 5 * MB
      sizes[ part( '02' ) ] = 5 * MB

      expect( await prepareAudio( input, { maxBytes: 6 * MB } ) )
        .toEqual( [ part( '01' ), part( '02' ) ] )
    } )

    it( 'throws when a part is still over the limit', async () => {
      sizes[ part( '02' ) ] = 25 * MB

      await expect( prepareAudio( input ) ).rejects.toThrow(
        'Audio could not be split under the upload limit',
      )
    } )

    it( 'throws when a part is not written', async () => {
      sizes[ part( '03' ) ] = 0

      await expect( prepareAudio( input ) ).rejects.toThrow(
        'ffmpeg did not produce an audio file',
      )
    } )
  } )
} )
