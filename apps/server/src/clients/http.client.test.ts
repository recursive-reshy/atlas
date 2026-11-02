// Node
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest'
// Version
import { appVersion } from '../version.js'
// Clients
import {
  HttpStatusError,
  RedirectError,
  TooLargeError,
  UnreachableError,
  fetchResource,
} from './http.client.js'

type Handler = ( req: IncomingMessage, res: ServerResponse ) => void

let server: Server
let handler: Handler
let base = ''

const options = { accept: 'text/html', maxBytes: 1024, timeoutMs: 2000 }

beforeEach( async () => {
  handler = ( _req, res ) => {
    res.end( 'ok' )
  }
  server = createServer( ( req, res ) => handler( req, res ) )
  await new Promise< void >( ( resolve ) => {
    server.listen( 0, '127.0.0.1', resolve )
  } )
  base = `http://127.0.0.1:${ ( server.address() as AddressInfo ).port }`
} )

afterEach( async () => {
  server.closeAllConnections()
  await new Promise( ( resolve ) => server.close( resolve ) )
} )

describe( 'fetchResource', () => {
  it( 'returns the status, final URL, content type and body', async () => {
    handler = ( _req, res ) => {
      res.setHeader( 'Content-Type', 'text/html; charset=utf-8' )
      res.setHeader( 'ETag', '"v1"' )
      res.setHeader( 'Last-Modified', 'Sat, 18 Oct 2026 10:00:00 GMT' )
      res.end( '<p>héllo</p>' )
    }

    expect( await fetchResource( `${ base }/page`, options ) ).toEqual( {
      status: 200,
      finalUrl: `${ base }/page`,
      contentType: 'text/html; charset=utf-8',
      body: '<p>héllo</p>',
      etag: '"v1"',
      lastModified: 'Sat, 18 Oct 2026 10:00:00 GMT',
    } )
  } )

  it( 'sends the user agent and the accept header', async () => {
    let seen: IncomingMessage[ 'headers' ] = {}
    handler = ( req, res ) => {
      seen = req.headers
      res.end( 'ok' )
    }

    await fetchResource( `${ base }/`, { ...options, accept: 'application/rss+xml' } )

    expect( seen[ 'user-agent' ] ).toBe( `Atlas/${ appVersion } (personal reader)` )
    expect( seen.accept ).toBe( 'application/rss+xml' )
  } )

  describe( 'redirects', () => {
    it( 'follows them and reports the final URL', async () => {
      handler = ( req, res ) => {
        if( req.url === '/old' ) {
          res.writeHead( 301, { Location: '/new' } )
          res.end()

          return
        }

        res.end( `at ${ req.url ?? '' }` )
      }

      const result = await fetchResource( `${ base }/old`, options )

      expect( result.body ).toBe( 'at /new' )
      expect( result.finalUrl ).toBe( `${ base }/new` )
    } )

    it( 'follows five redirects and refuses a sixth', async () => {
      handler = ( req, res ) => {
        const hop = Number( new URL( req.url ?? '/', base ).searchParams.get( 'hop' ) ?? 0 )
        const target = 5

        if( hop < target ) {
          res.writeHead( 302, { Location: `/?hop=${ hop + 1 }` } )
          res.end()

          return
        }

        res.end( 'done' )
      }

      await expect( fetchResource( `${ base }/?hop=0`, options ) )
        .resolves.toMatchObject( { body: 'done' } )

      await expect( fetchResource( `${ base }/?hop=-1`, options ) ).rejects.toThrow( RedirectError )
    } )

    it( 'refuses a redirect to a protocol that is not http or https', async () => {
      handler = ( _req, res ) => {
        res.writeHead( 302, { Location: 'ftp://example.com/file' } )
        res.end()
      }

      await expect( fetchResource( `${ base }/`, options ) ).rejects.toThrow( RedirectError )
    } )

    it( 'refuses a redirect with no Location', async () => {
      handler = ( _req, res ) => {
        res.writeHead( 302 )
        res.end()
      }

      await expect( fetchResource( `${ base }/`, options ) )
        .rejects.toThrow( new HttpStatusError( 302 ).message )
    } )
  } )

  describe( 'conditional requests', () => {
    it( 'sends the validators and returns 304 with an empty body', async () => {
      let seen: IncomingMessage[ 'headers' ] = {}
      handler = ( req, res ) => {
        seen = req.headers
        res.writeHead( 304, { ETag: '"v1"' } )
        res.end()
      }

      const result = await fetchResource( `${ base }/`, {
        ...options,
        etag: '"v1"',
        lastModified: 'Sat, 18 Oct 2026 10:00:00 GMT',
      } )

      expect( seen[ 'if-none-match' ] ).toBe( '"v1"' )
      expect( seen[ 'if-modified-since' ] ).toBe( 'Sat, 18 Oct 2026 10:00:00 GMT' )
      expect( result ).toMatchObject( { status: 304, body: '', etag: '"v1"' } )
    } )

    it( 'sends no validators when it has none', async () => {
      let seen: IncomingMessage[ 'headers' ] = {}
      handler = ( req, res ) => {
        seen = req.headers
        res.end( 'ok' )
      }

      await fetchResource( `${ base }/`, options )

      expect( seen ).not.toHaveProperty( 'if-none-match' )
      expect( seen ).not.toHaveProperty( 'if-modified-since' )
    } )
  } )

  describe( 'size cap', () => {
    it( 'refuses a body whose Content-Length is over the cap without reading it', async () => {
      handler = ( _req, res ) => {
        res.setHeader( 'Content-Length', '5000' )
        res.write( 'x'.repeat( 100 ) )
      }

      await expect( fetchResource( `${ base }/`, options ) ).rejects.toThrow( TooLargeError )
    } )

    it( 'stops a body with no Content-Length once it passes the cap', async () => {
      handler = ( _req, res ) => {
        res.write( 'x'.repeat( 600 ) )
        res.write( 'x'.repeat( 600 ) )
        res.end( 'x'.repeat( 600 ) )
      }

      await expect( fetchResource( `${ base }/`, options ) ).rejects.toThrow( TooLargeError )
    } )

    it( 'accepts a body of exactly the cap', async () => {
      handler = ( _req, res ) => {
        res.end( 'x'.repeat( 1024 ) )
      }

      const result = await fetchResource( `${ base }/`, options )

      expect( result.body ).toHaveLength( 1024 )
    } )
  } )

  describe( 'timeout and connection errors', () => {
    it( 'gives up on a server that never answers', async () => {
      handler = () => undefined

      await expect( fetchResource( `${ base }/`, { ...options, timeoutMs: 100 } ) )
        .rejects.toThrow( new UnreachableError().message )
    } )

    it( 'gives up on a body that stalls', async () => {
      handler = ( _req, res ) => {
        res.write( 'start' )
      }

      await expect( fetchResource( `${ base }/`, { ...options, timeoutMs: 100 } ) )
        .rejects.toThrow( UnreachableError )
    } )

    it( 'reports a refused connection as unreachable', async () => {
      await new Promise( ( resolve ) => server.close( resolve ) )

      await expect( fetchResource( `${ base }/`, options ) )
        .rejects.toThrow( "Couldn't reach the site" )
    } )

    it( 'reports an unsupported protocol as unreachable', async () => {
      await expect( fetchResource( 'ftp://example.com/x', options ) )
        .rejects.toBeInstanceOf( UnreachableError )
    } )
  } )

  describe( 'status codes', () => {
    it.each( [ 401, 402, 403 ] )( 'maps %s to the login or paywall message', async ( status ) => {
      handler = ( _req, res ) => {
        res.writeHead( status )
        res.end()
      }

      const error = await fetchResource( `${ base }/`, options )
        .catch( ( caught: unknown ) => caught )

      expect( error ).toBeInstanceOf( HttpStatusError )
      expect( ( error as HttpStatusError ).message )
        .toBe( 'The page needs a login or is paywalled' )
      expect( ( error as HttpStatusError ).status ).toBe( status )
    } )

    it.each( [ 404, 410, 500, 503 ] )( 'maps %s to "The site answered %s"', async ( status ) => {
      handler = ( _req, res ) => {
        res.writeHead( status )
        res.end()
      }

      await expect( fetchResource( `${ base }/`, options ) )
        .rejects.toThrow( `The site answered ${ status }` )
    } )
  } )

  describe( 'charset', () => {
    const latin1 = Buffer.from( 'café', 'latin1' )

    it( 'decodes the charset named in Content-Type', async () => {
      handler = ( _req, res ) => {
        res.setHeader( 'Content-Type', 'text/html; charset=ISO-8859-1' )
        res.end( latin1 )
      }

      expect( ( await fetchResource( `${ base }/`, options ) ).body ).toBe( 'café' )
    } )

    it( 'decodes UTF-8 when there is no charset', async () => {
      handler = ( _req, res ) => {
        res.setHeader( 'Content-Type', 'text/html' )
        res.end( 'café' )
      }

      expect( ( await fetchResource( `${ base }/`, options ) ).body ).toBe( 'café' )
    } )

    it( 'decodes UTF-8 when the charset is unknown', async () => {
      handler = ( _req, res ) => {
        res.setHeader( 'Content-Type', 'text/html; charset=nonsense-9' )
        res.end( 'café' )
      }

      expect( ( await fetchResource( `${ base }/`, options ) ).body ).toBe( 'café' )
    } )

    it( 'reports a missing content type as null', async () => {
      handler = ( _req, res ) => {
        res.end( 'ok' )
      }

      expect( ( await fetchResource( `${ base }/`, options ) ).contentType ).toBeNull()
    } )
  } )
} )
