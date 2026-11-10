// Node
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIPv4, isIPv6 } from 'node:net'
// Errors
import { ValidationError } from '../errors.js'

export type Lookup = (
  host: string,
  options: { all: true },
) => Promise< { address: string; family: number }[] >

const MAPPED_DOTTED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i
const MAPPED_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i

const blockedIpv4 = ( address: string ): boolean => {
  const [ a = 0, b = 0 ] = address.split( '.' ).map( Number )

  return a === 127
    || a === 10
    || a === 0
    || ( a === 169 && b === 254 )
    || ( a === 172 && b >= 16 && b <= 31 )
    || ( a === 192 && b === 168 )
}

const unmapIpv4 = ( address: string ): string | null => {
  const dotted = MAPPED_DOTTED.exec( address )?.[ 1 ]

  if( dotted !== undefined ) {
    return dotted
  }

  const hex = MAPPED_HEX.exec( address )

  if( hex === null ) {
    return null
  }

  const high = parseInt( hex[ 1 ] ?? '0', 16 )
  const low = parseInt( hex[ 2 ] ?? '0', 16 )

  return `${ high >> 8 }.${ high & 255 }.${ low >> 8 }.${ low & 255 }`
}

// Loopback, unspecified, RFC1918, link-local and unique-local, in IPv4, IPv6 and IPv4-mapped form
export const isBlockedAddress = ( address: string ): boolean => {
  const lower = address.toLowerCase()
  const mapped = unmapIpv4( lower )

  if( mapped !== null ) {
    return blockedIpv4( mapped )
  }

  if( isIPv4( lower ) ) {
    return blockedIpv4( lower )
  }

  if( !isIPv6( lower ) ) {
    return true
  }

  const first = parseInt( lower.split( ':' )[ 0 ] || '0', 16 )

  return lower === '::1'
    || lower === '::'
    || ( first & 0xffc0 ) === 0xfe80
    || ( first & 0xfe00 ) === 0xfc00
}

// Run before every request, redirect hops included (ADR 0096)
export const assertPublicUrl = async (
  url: URL,
  lookup: Lookup = dnsLookup,
): Promise< void > => {
  const host = url.hostname.replace( /^\[|\]$/g, '' )
  const addresses = isIPv4( host ) || isIPv6( host )
    ? [ { address: host } ]
    : await lookup( host, { all: true } )

  if( addresses.some( ( { address } ) => isBlockedAddress( address ) ) ) {
    throw new ValidationError( "That address can't be fetched" )
  }
}
