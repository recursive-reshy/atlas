// Node
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const VERSION = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16

export class TokenDecryptError extends Error {
  constructor( message: string ) {
    super( message )
    this.name = 'TokenDecryptError'
  }
}

export const encryptToken = ( plain: string, key: Buffer ): string => {
  const iv = randomBytes( IV_BYTES )
  const cipher = createCipheriv( ALGORITHM, key, iv )
  const ciphertext = Buffer.concat( [ cipher.update( plain, 'utf8' ), cipher.final() ] )

  return [
    VERSION,
    iv.toString( 'base64' ),
    cipher.getAuthTag().toString( 'base64' ),
    ciphertext.toString( 'base64' ),
  ].join( ':' )
}

export const decryptToken = ( stored: string, key: Buffer ): string => {
  const [ version, iv, tag, ciphertext, ...rest ] = stored.split( ':' )

  if(
    version !== VERSION
    || iv === undefined
    || tag === undefined
    || ciphertext === undefined
    || rest.length > 0
  ) {
    throw new TokenDecryptError( 'The stored token has an unknown format' )
  }

  try {
    const ivBytes = Buffer.from( iv, 'base64' )
    const tagBytes = Buffer.from( tag, 'base64' )

    if( ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES ) {
      throw new TokenDecryptError( 'The stored token has an unknown format' )
    }

    const decipher = createDecipheriv( ALGORITHM, key, ivBytes )

    decipher.setAuthTag( tagBytes )
    return Buffer.concat( [
      decipher.update( Buffer.from( ciphertext, 'base64' ) ),
      decipher.final(),
    ] ).toString( 'utf8' )
  } catch( error ) {
    if( error instanceof TokenDecryptError ) {
      throw error
    }
    throw new TokenDecryptError( 'The stored token could not be decrypted' )
  }
}
