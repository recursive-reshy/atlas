// Packages
import { z } from 'zod'

const REQUEST_TIMEOUT_MS = 15 * 1000
const DEFAULT_BASE_URL = 'https://www.googleapis.com'

export type YouTubeDataOptions = { apiKey: string, baseUrl?: string }

export type VideoMeta = {
  title: string
  channel: string
  duration_seconds: number
  privacy: 'public'
}

const VideosBody = z.object( {
  items: z.array( z.object( {
    snippet: z.object( { title: z.string(), channelTitle: z.string() } ),
    contentDetails: z.object( { duration: z.string() } ),
    status: z.object( { privacyStatus: z.string() } ),
  } ) ),
} )
const ErrorBody = z.object( { error: z.object( { message: z.string() } ) } )

const SECONDS = { day: 86_400, hour: 3600, minute: 60 }
const DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/

// contentDetails.duration is ISO 8601: PT15M33S, PT1H2M, P1DT2H, P0D for a live stream
export const parseIsoDuration = ( text: string ): number => {
  const match = DURATION.exec( text )

  if( match === null || text === 'P' || text.endsWith( 'T' ) ) {
    throw new Error( 'Unexpected video length from YouTube' )
  }

  const [ , days, hours, minutes, seconds ] = match.map( ( part ) => Number( part ?? 0 ) )

  return ( days ?? 0 ) * SECONDS.day
    + ( hours ?? 0 ) * SECONDS.hour
    + ( minutes ?? 0 ) * SECONDS.minute
    + ( seconds ?? 0 )
}

// The key travels in the URL, so a message that quotes the request could carry it
const hideKey = ( text: string, apiKey: string ): string => text.replaceAll( apiKey, '[hidden]' )

const fetchVideos = async (
  videoId: string,
  { apiKey, baseUrl }: YouTubeDataOptions,
): Promise< Response > => {
  const url = new URL( '/youtube/v3/videos', baseUrl ?? DEFAULT_BASE_URL )

  url.searchParams.set( 'part', 'snippet,contentDetails,status' )
  url.searchParams.set( 'id', videoId )
  url.searchParams.set( 'key', apiKey )

  try {
    return await fetch( url, { signal: AbortSignal.timeout( REQUEST_TIMEOUT_MS ) } )
  } catch( error ) {
    if( error instanceof Error && error.name === 'TimeoutError' ) {
      throw new Error( 'The YouTube Data API did not answer within 15 seconds', { cause: error } )
    }

    const reason = error instanceof Error ? error.message : String( error )

    throw new Error(
      `Could not reach the YouTube Data API: ${ hideKey( reason, apiKey ) }`,
      { cause: error },
    )
  }
}

// One quota unit. Runs before Gemini, so a private or missing video costs nothing.
export const getVideoMeta = async (
  videoId: string,
  options: YouTubeDataOptions,
): Promise< VideoMeta > => {
  const response = await fetchVideos( videoId, options )
  const json: unknown = await response.json().catch( () => undefined )

  if( !response.ok ) {
    const body = ErrorBody.safeParse( json )
    const detail = body.success ? `: ${ hideKey( body.data.error.message, options.apiKey ) }` : ''

    throw new Error( `YouTube Data API failed (${ response.status })${ detail }` )
  }

  const body = VideosBody.safeParse( json )

  if( !body.success ) {
    throw new Error( 'Unexpected response from the YouTube Data API' )
  }

  const [ item ] = body.data.items

  if( item === undefined ) {
    throw new Error( 'Video not found or not public' )
  }

  if( item.status.privacyStatus !== 'public' ) {
    throw new Error( 'Only public YouTube videos are supported' )
  }

  return {
    title: item.snippet.title,
    channel: item.snippet.channelTitle,
    duration_seconds: parseIsoDuration( item.contentDetails.duration ),
    privacy: 'public',
  }
}
