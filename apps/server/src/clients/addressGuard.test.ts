// Packages
import { describe, it, expect } from 'vitest'
// Errors
import { ValidationError } from '../errors.js'
// Clients
import { assertPublicUrl, isBlockedAddress } from './addressGuard.js'
import type { Lookup } from './addressGuard.js'

describe( 'isBlockedAddress', () => {
  it.each( [
    [ '127.0.0.1', 'loopback' ],
    [ '127.255.255.254', 'loopback' ],
    [ '::1', 'loopback v6' ],
    [ '0.0.0.0', 'unspecified' ],
    [ '::', 'unspecified v6' ],
    [ '10.1.2.3', 'RFC1918 10/8' ],
    [ '172.16.0.1', 'RFC1918 172.16/12 start' ],
    [ '172.31.255.255', 'RFC1918 172.16/12 end' ],
    [ '192.168.65.1', 'RFC1918 192.168/16' ],
    [ '169.254.169.254', 'link-local metadata' ],
    [ 'fe80::1', 'link-local v6' ],
    [ 'febf::1', 'link-local v6 end' ],
    [ 'fc00::1', 'unique-local v6' ],
    [ 'fd12:3456::1', 'unique-local v6 fd' ],
    [ '::ffff:10.0.0.1', 'mapped private' ],
    [ '::ffff:127.0.0.1', 'mapped loopback' ],
    [ '::ffff:a9fe:a9fe', 'mapped link-local, hex form' ],
  ] )( 'blocks %s (%s)', ( address ) => {
    expect( isBlockedAddress( address ) ).toBe( true )
  } )

  it.each( [
    '8.8.8.8',
    '172.15.255.255',
    '172.32.0.1',
    '192.169.0.1',
    '169.253.0.1',
    '100.64.0.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ] )( 'allows %s', ( address ) => {
    expect( isBlockedAddress( address ) ).toBe( false )
  } )
} )

const lookupTo = ( ...addresses: string[] ) => (): ReturnType< Lookup > => {
  return Promise.resolve(
    addresses.map( ( address ) => ( { address, family: address.includes( ':' ) ? 6 : 4 } ) ),
  )
}

describe( 'assertPublicUrl', () => {
  const refused = new ValidationError( "That address can't be fetched" )

  it( 'passes a hostname that resolves to a public address', async () => {
    await expect( assertPublicUrl( new URL( 'https://example.com/a' ), lookupTo( '93.184.216.34' ) ) )
      .resolves.toBeUndefined()
  } )

  it( 'refuses a hostname that resolves to a private address', async () => {
    await expect( assertPublicUrl( new URL( 'http://agent:8100/' ), lookupTo( '172.18.0.3' ) ) )
      .rejects.toThrow( refused )
  } )

  it( 'refuses when any one of several addresses is private', async () => {
    await expect(
      assertPublicUrl( new URL( 'http://mixed.example/' ), lookupTo( '93.184.216.34', '10.0.0.5' ) ),
    ).rejects.toThrow( refused )
  } )

  it( 'checks an IPv4 literal without a lookup', async () => {
    const lookup = (): never => {
      throw new Error( 'should not look up a literal' )
    }

    await expect( assertPublicUrl( new URL( 'http://169.254.169.254/latest' ), lookup ) )
      .rejects.toThrow( refused )
  } )

  it( 'checks a bracketed IPv6 literal without a lookup', async () => {
    const lookup = (): never => {
      throw new Error( 'should not look up a literal' )
    }

    await expect( assertPublicUrl( new URL( 'http://[::1]:3100/' ), lookup ) ).rejects.toThrow( refused )
    await expect( assertPublicUrl( new URL( 'http://[fe80::1]/' ), lookup ) ).rejects.toThrow( refused )
  } )

  it( 'is a ValidationError', async () => {
    await expect( assertPublicUrl( new URL( 'http://localhost/' ), lookupTo( '127.0.0.1' ) ) )
      .rejects.toBeInstanceOf( ValidationError )
  } )
} )
