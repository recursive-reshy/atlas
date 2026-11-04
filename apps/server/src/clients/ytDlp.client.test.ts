// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
import { mkdir, readdir } from 'node:fs/promises'
// Clients
import { downloadAudio } from './ytDlp.client.js'
import { runCommand } from './runCommand.js'

const configMock = vi.hoisted( () => ( { potProviderUrl: null as string | null } ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( './runCommand.js' )
vi.mock( 'node:fs/promises' )

const url = 'https://www.youtube.com/watch?v=cFoaK1OQRhw'
const outputDir = '/tmp/work/job1'
const realStdout =
  '{"id": "cFoaK1OQRhw", "title": "Atl\\u00e9tico Madrid 2-0 Manchester United | ' +
  'Champions League 26/27 Match Highlights", "channel": "beIN SPORTS Asia", ' +
  '"uploader": "beIN SPORTS Asia", "duration": 517, ' +
  '"webpage_url": "https://www.youtube.com/watch?v=cFoaK1OQRhw"}\n'

const stubOutput = ( stdout: string, files: string[] = [ 'audio.webm' ] ): void => {
  vi.mocked( runCommand ).mockResolvedValue( { stdout, stderr: '' } )
  const names = files as unknown as Awaited< ReturnType< typeof readdir > >

  vi.mocked( readdir ).mockResolvedValue( names )
}

const line = ( fields: Record< string, unknown > ): string => {
  return `${ JSON.stringify( { id: 'abc', webpage_url: url, ...fields } ) }\n`
}

beforeEach( () => {
  vi.resetAllMocks()
  configMock.potProviderUrl = null
  vi.mocked( mkdir ).mockResolvedValue( undefined )
} )

describe( 'downloadAudio', () => {
  it( 'creates the output directory recursively', async () => {
    stubOutput( realStdout )

    await downloadAudio( url, outputDir )

    expect( mkdir ).toHaveBeenCalledWith( outputDir, { recursive: true } )
  } )

  it( 'runs yt-dlp with the exact arguments and a 30 minute timeout', async () => {
    stubOutput( realStdout )

    await downloadAudio( url, outputDir )

    expect( runCommand ).toHaveBeenCalledWith(
      'yt-dlp',
      [
        '--no-playlist',
        '--no-simulate',
        '-f',
        'bestaudio',
        '-o',
        '/tmp/work/job1/audio.%(ext)s',
        '--print',
        '%(.{id,title,channel,uploader,duration,webpage_url})j',
        '--',
        url,
      ],
      30 * 60 * 1000,
    )
  } )

  it( 'passes the PO token provider before the URL when one is configured', async () => {
    configMock.potProviderUrl = 'http://pot-provider:4416'
    stubOutput( realStdout )

    await downloadAudio( url, outputDir )

    const args = vi.mocked( runCommand ).mock.calls[ 0 ]?.[ 1 ] ?? []
    const flag = args.indexOf( '--extractor-args' )

    expect( args[ flag + 1 ] ).toBe( 'youtubepot-bgutilhttp:base_url=http://pot-provider:4416' )
    expect( flag ).toBeGreaterThanOrEqual( 0 )
    expect( flag ).toBeLessThan( args.indexOf( '--' ) )
    expect( args.slice( -2 ) ).toEqual( [ '--', url ] )
  } )

  it( 'returns the audio path and metadata', async () => {
    stubOutput( realStdout )

    const result = await downloadAudio( url, outputDir )

    expect( result ).toEqual( {
      audioPath: '/tmp/work/job1/audio.webm',
      meta: {
        title: 'Atlético Madrid 2-0 Manchester United | Champions League 26/27 Match Highlights',
        source: 'https://www.youtube.com/watch?v=cFoaK1OQRhw',
        channel: 'beIN SPORTS Asia',
        duration_seconds: 517,
      },
    } )
  } )

  it( 'finds an m4a file and ignores stray files', async () => {
    stubOutput( realStdout, [ 'notes.txt', 'audio.m4a' ] )

    const { audioPath } = await downloadAudio( url, outputDir )

    expect( audioPath ).toBe( '/tmp/work/job1/audio.m4a' )
  } )

  it( 'falls back from channel to uploader to an empty string', async () => {
    stubOutput( line( { title: 'T', channel: null, uploader: 'Up' } ) )
    expect( ( await downloadAudio( url, outputDir ) ).meta.channel ).toBe( 'Up' )

    stubOutput( line( { title: 'T' } ) )
    expect( ( await downloadAudio( url, outputDir ) ).meta.channel ).toBe( '' )
  } )

  it( 'rounds the duration and defaults a null duration to 0', async () => {
    stubOutput( line( { title: 'T', duration: 61.4 } ) )
    expect( ( await downloadAudio( url, outputDir ) ).meta.duration_seconds ).toBe( 61 )

    stubOutput( line( { title: 'T', duration: null } ) )
    expect( ( await downloadAudio( url, outputDir ) ).meta.duration_seconds ).toBe( 0 )
  } )

  it( 'uses the id when the title is missing or empty', async () => {
    stubOutput( line( {} ) )
    expect( ( await downloadAudio( url, outputDir ) ).meta.title ).toBe( 'abc' )

    stubOutput( line( { title: '' } ) )
    expect( ( await downloadAudio( url, outputDir ) ).meta.title ).toBe( 'abc' )
  } )

  it( 'parses the last non-empty line among blank lines', async () => {
    stubOutput( `\n\n${ line( { title: 'T' } ) }\n\n` )

    const { meta } = await downloadAudio( url, outputDir )

    expect( meta.title ).toBe( 'T' )
  } )

  it.each( [ 'not json\n', '{"title": "no id"}\n', '' ] )(
    'throws on unexpected output %j',
    async ( stdout ) => {
      stubOutput( stdout )

      await expect( downloadAudio( url, outputDir ) ).rejects.toThrow(
        'Unexpected output from yt-dlp',
      )
    },
  )

  it( 'throws when no audio file was produced', async () => {
    stubOutput( realStdout, [ 'other.txt' ] )

    await expect( downloadAudio( url, outputDir ) ).rejects.toThrow(
      'yt-dlp did not produce an audio file',
    )
  } )

  it( 'propagates runCommand errors unchanged', async () => {
    const error = new Error( 'yt-dlp failed: ERROR: Video unavailable' )
    vi.mocked( runCommand ).mockRejectedValue( error )

    await expect( downloadAudio( url, outputDir ) ).rejects.toBe( error )
  } )
} )
