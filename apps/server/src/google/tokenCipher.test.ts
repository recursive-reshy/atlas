// Node
import { randomBytes } from 'node:crypto'
// Packages
import { describe, it, expect } from 'vitest'
// Gmail
import { TokenDecryptError, decryptToken, encryptToken } from './tokenCipher.js'

const key = randomBytes( 32 )
const token = '1//0g-refresh-token-value'

const flip = ( base64: string ): string => {
  const bytes = Buffer.from( base64, 'base64' )

  bytes[ 0 ] = bytes[ 0 ] ^ 1
  return bytes.toString( 'base64' )
}

describe( 'tokenCipher', () => {
  it( 'round-trips a token', () => {
    expect( decryptToken( encryptToken( token, key ), key ) ).toBe( token )
  } )

  it( 'writes v1:<iv>:<tag>:<ciphertext> with a 12-byte IV and no plain token', () => {
    const stored = encryptToken( token, key )
    const [ version, iv, tag, ciphertext ] = stored.split( ':' )

    expect( version ).toBe( 'v1' )
    expect( Buffer.from( iv, 'base64' ) ).toHaveLength( 12 )
    expect( Buffer.from( tag, 'base64' ) ).toHaveLength( 16 )
    expect( ciphertext ).toBeTruthy()
    expect( stored ).not.toContain( token )
  } )

  it( 'uses a different IV on every call', () => {
    expect( encryptToken( token, key ) ).not.toBe( encryptToken( token, key ) )
  } )

  it( 'throws TokenDecryptError for the wrong key', () => {
    expect( () => decryptToken( encryptToken( token, key ), randomBytes( 32 ) ) ).toThrow(
      TokenDecryptError,
    )
  } )

  it( 'throws TokenDecryptError for a tampered ciphertext', () => {
    const [ version, iv, tag, ciphertext ] = encryptToken( token, key ).split( ':' )

    expect( () => decryptToken( [ version, iv, tag, flip( ciphertext ) ].join( ':' ), key ) )
      .toThrow( TokenDecryptError )
  } )

  it( 'throws TokenDecryptError for a tampered tag', () => {
    const [ version, iv, tag, ciphertext ] = encryptToken( token, key ).split( ':' )

    expect( () => decryptToken( [ version, iv, flip( tag ), ciphertext ].join( ':' ), key ) )
      .toThrow( TokenDecryptError )
  } )

  it.each( [
    [ 'an unknown version', 'v2:AAAA:AAAA:AAAA' ],
    [ 'too few parts', 'v1:AAAA:AAAA' ],
    [ 'too many parts', 'v1:AAAA:AAAA:AAAA:AAAA' ],
    [ 'an empty value', '' ],
    [ 'a plain token', token ],
  ] )( 'throws TokenDecryptError for %s', ( _name, stored ) => {
    expect( () => decryptToken( stored, key ) ).toThrow( TokenDecryptError )
  } )

  it( 'names the error and does not leak the stored value', () => {
    const stored = encryptToken( token, key )

    try {
      decryptToken( stored, randomBytes( 32 ) )
      expect.unreachable()
    } catch( error ) {
      expect( error ).toBeInstanceOf( TokenDecryptError )
      expect( ( error as Error ).name ).toBe( 'TokenDecryptError' )
      expect( ( error as Error ).message ).not.toContain( stored )
    }
  } )
} )
