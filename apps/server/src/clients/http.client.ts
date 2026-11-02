// Version
import { appVersion } from '../version.js'

const MAX_REDIRECTS = 5
const REDIRECT_STATUSES = [ 301, 302, 303, 307, 308 ]
const LOGIN_STATUSES = [ 401, 402, 403 ]

export class UnreachableError extends Error {
  constructor() {
    super( "Couldn't reach the site" )
    this.name = 'UnreachableError'
  }
}

export class HttpStatusError extends Error {
  readonly status: number

  constructor( status: number ) {
    super(
      LOGIN_STATUSES.includes( status )
        ? 'The page needs a login or is paywalled'
        : `The site answered ${ status }`,
    )
    this.name = 'HttpStatusError'
    this.status = status
  }
}

export class TooLargeError extends Error {
  constructor( maxBytes: number ) {
    super( `The page is too large to read (over ${ maxBytes } bytes)` )
    this.name = 'TooLargeError'
  }
}

export class RedirectError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'RedirectError'
  }
}

export interface FetchOptions {
  accept: string
  maxBytes: number
  timeoutMs: number
  etag?: string
  lastModified?: string
}

export interface FetchedResource {
  status: number
  finalUrl: string
  contentType: string | null
  body: string
  etag: string | null
  lastModified: string | null
}

const isHttp = ( url: URL ): boolean => url.protocol === 'http:' || url.protocol === 'https:'

const decode = ( bytes: Uint8Array, contentType: string | null ): string => {
  const label = /charset=["']?([^;"'\s]+)/i.exec( contentType ?? '' )?.[ 1 ] ?? 'utf-8'

  try {
    return new TextDecoder( label ).decode( bytes )
  } catch{
    return new TextDecoder( 'utf-8' ).decode( bytes )
  }
}

const readBody = async (
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise< Uint8Array > => {
  if( Number( response.headers.get( 'content-length' ) ) > maxBytes ) {
    await response.body?.cancel()

    throw new TooLargeError( maxBytes )
  }

  const reader = response.body?.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  if( reader === undefined ) {
    return new Uint8Array()
  }

  for( ;; ) {
    if( signal.aborted ) {
      throw new UnreachableError()
    }

    const { done, value } = await reader.read()

    if( done ) {
      break
    }

    total += value.byteLength

    if( total > maxBytes ) {
      await reader.cancel()

      throw new TooLargeError( maxBytes )
    }

    chunks.push( value )
  }

  return Buffer.concat( chunks )
}

export const fetchResource = async (
  url: string,
  { accept, maxBytes, timeoutMs, etag, lastModified }: FetchOptions,
): Promise< FetchedResource > => {
  const controller = new AbortController()
  const timer = setTimeout( () => controller.abort(), timeoutMs )
  const headers: Record< string, string > = {
    'User-Agent': `Atlas/${ appVersion } (personal reader)`,
    Accept: accept,
  }

  if( etag !== undefined ) {
    headers[ 'If-None-Match' ] = etag
  }

  if( lastModified !== undefined ) {
    headers[ 'If-Modified-Since' ] = lastModified
  }

  try {
    let current = new URL( url )

    for( let hops = 0; ; hops += 1 ) {
      if( !isHttp( current ) ) {
        throw hops === 0
          ? new UnreachableError()
          : new RedirectError( 'The site redirected to an address that is not http or https' )
      }

      const response = await fetch( current, {
        headers,
        redirect: 'manual',
        signal: controller.signal,
      } )

      if( REDIRECT_STATUSES.includes( response.status ) ) {
        const location = response.headers.get( 'location' )

        await response.body?.cancel()

        if( location === null ) {
          throw new HttpStatusError( response.status )
        }

        if( hops >= MAX_REDIRECTS ) {
          throw new RedirectError( 'The site redirected too many times' )
        }

        current = new URL( location, current )
        continue
      }

      if( response.status === 304 ) {
        return {
          status: 304,
          finalUrl: current.href,
          contentType: response.headers.get( 'content-type' ),
          body: '',
          etag: response.headers.get( 'etag' ) ?? etag ?? null,
          lastModified: response.headers.get( 'last-modified' ) ?? lastModified ?? null,
        }
      }

      if( !response.ok ) {
        await response.body?.cancel()

        throw new HttpStatusError( response.status )
      }

      const contentType = response.headers.get( 'content-type' )
      const bytes = await readBody( response, maxBytes, controller.signal )

      return {
        status: response.status,
        finalUrl: current.href,
        contentType,
        body: decode( bytes, contentType ),
        etag: response.headers.get( 'etag' ),
        lastModified: response.headers.get( 'last-modified' ),
      }
    }
  } catch( error ) {
    if( error instanceof UnreachableError || error instanceof HttpStatusError
      || error instanceof TooLargeError || error instanceof RedirectError ) {
      throw error
    }

    throw new UnreachableError()
  } finally {
    clearTimeout( timer )
  }
}
