// Express
import type { Request } from 'express'
// Config
import { config } from '../config.js'
// Errors
import { UnknownOriginError } from '../errors.js'

const LOOPBACK = new Set( [ '127.0.0.1', '::1', '::ffff:127.0.0.1' ] )
const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i

// 10/8, 172.16/12 and 192.168/16
const isPrivateIpv4 = ( address: string ): boolean => {
  const [ first, second ] = address.split( '.' ).map( Number )

  return first === 10
    || ( first === 172 && second !== undefined && second >= 16 && second <= 31 )
    || ( first === 192 && second === 168 )
}

// fc00::/7, the unique local addresses
const isUniqueLocalIpv6 = ( address: string ): boolean => {
  const first = Number.parseInt( address.split( ':' )[ 0 ] ?? '', 16 )

  return Number.isInteger( first ) && ( first & 0xfe00 ) === 0xfc00
}

// Loopback, or a private-network peer. Docker Desktop shows a request that came in through a
// published port, Tailscale Serve's included, as coming from its gateway (192.168.65.1 observed),
// so loopback alone would never match. Compose publishes the port on 127.0.0.1 only, so nothing
// else on a private network can reach it directly (ADR 0071).
export const isTrustedProxy = ( req: Request ): boolean => {
  const address = req.socket.remoteAddress ?? ''
  const unmapped = MAPPED_IPV4.exec( address )?.[ 1 ] ?? address

  return LOOPBACK.has( address ) || isPrivateIpv4( unmapped ) || isUniqueLocalIpv6( unmapped )
}

const firstValue = ( header: string | string[] | undefined ): string | undefined => {
  const value = Array.isArray( header ) ? header[ 0 ] : header
  const first = value?.split( ',' )[ 0 ]?.trim()

  return first === undefined || first === '' ? undefined : first
}

// http or https, as the person's browser used it: the socket's own, or what a trusted proxy says
export const requestScheme = ( req: Request ): 'http' | 'https' => {
  const forwarded = isTrustedProxy( req )
    ? firstValue( req.headers[ 'x-forwarded-proto' ] )?.toLowerCase()
    : undefined

  if( forwarded === 'http' || forwarded === 'https' ) {
    return forwarded
  }

  return 'encrypted' in req.socket && req.socket.encrypted === true ? 'https' : 'http'
}

// Forwarded headers are only believed from a loopback or private-network peer, where Tailscale
// Serve and a browser on the Mac connect from; anyone else could send them. The answer is always
// one of `origins`.
export const requestOrigin = ( req: Request, origins: string[] ): string => {
  const trusted = isTrustedProxy( req )
  const forwardedHost = trusted ? firstValue( req.headers[ 'x-forwarded-host' ] ) : undefined
  const host = ( forwardedHost ?? firstValue( req.headers.host ) )?.toLowerCase()
  const scheme = requestScheme( req )

  if( host !== undefined ) {
    // Tailscale Serve may pass Host unchanged with no forwarded headers; its address is https
    const candidates = trusted && forwardedHost === undefined
      ? [ `${ scheme }://${ host }`, `https://${ host }` ]
      : [ `${ scheme }://${ host }` ]

    for( const candidate of candidates ) {
      const match = origins.find( ( origin ) => origin.toLowerCase() === candidate )

      if( match !== undefined ) {
        return match
      }
    }
  }

  throw new UnknownOriginError()
}

export const currentOrigin = ( req: Request ): string => requestOrigin( req, config.appOrigins )
