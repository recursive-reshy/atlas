// Node
import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
// Packages
import { z } from 'zod'
// Shared
import { ModuleId } from '@atlas/shared'
import type { Me } from '@atlas/shared'
// Clients
import { SignInError, createGoogleSignInClient } from '../clients/googleSignIn.client.js'
import type { GoogleSignInClient } from '../clients/googleSignIn.client.js'
// Config
import { config } from '../config.js'
// Errors
import { NotFoundError } from '../errors.js'
// Logging
import { logger } from '../logger.js'
// Repositories
import { inTransaction } from '../repositories/database.js'
import { listModules } from '../repositories/userModules.repository.js'
import {
  bindGoogleSub,
  countUsers,
  findUserByEmail,
  findUserById,
  insertUser,
  touchSignIn,
} from '../repositories/users.repository.js'
// Services
import { studyDay } from '../themis/periods.js'
import { seedUser } from './seedUser.service.js'
import { vaultFolderMissing } from './vault.service.js'
import { createSession } from './session.service.js'

export const OAUTH_COOKIE = 'atlas_oauth'
export const OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000

type SignInFailure = 'not_allowed' | 'expired' | 'failed'

const Pending = z.object( {
  state: z.string(),
  verifier: z.string(),
  returnTo: z.string(),
  origin: z.string(),
  exp: z.number(),
} )

type Pending = z.infer< typeof Pending >

let client: GoogleSignInClient | undefined

const signInClient = (): GoogleSignInClient => {
  client ??= createGoogleSignInClient( {
    clientId: config.gmail.clientId,
    clientSecret: config.gmail.clientSecret,
  } )

  return client
}

// A key of its own, derived from the one that encrypts Gmail tokens, so the two uses are separate
const cookieKey = (): Buffer => {
  return Buffer.from( hkdfSync(
    'sha256',
    config.gmail.encryptionKey,
    Buffer.alloc( 0 ),
    'atlas-oauth-cookie',
    32,
  ) )
}

const sign = ( payload: string ): string => {
  return createHmac( 'sha256', cookieKey() ).update( payload ).digest( 'base64url' )
}

const random = (): string => randomBytes( 32 ).toString( 'base64url' )

// Only same-site paths: an absolute or protocol-relative URL would send the person elsewhere
const safeReturnTo = ( value: unknown ): string => {
  const isPath = typeof value === 'string'
    && value.startsWith( '/' )
    && !value.startsWith( '//' )
    && !value.startsWith( '/\\' )
    // eslint-disable-next-line no-control-regex -- line breaks and other control characters
    && !/[\u0000-\u001f\u007f]/.test( value )

  return isPath ? value : '/'
}

export const beginSignIn = (
  { origin, returnTo, now }: { origin: string, returnTo: unknown, now: Date },
): { url: string, cookie: string } => {
  const state = random()
  const verifier = random()
  const pending: Pending = {
    state,
    verifier,
    returnTo: safeReturnTo( returnTo ),
    origin,
    exp: now.getTime() + OAUTH_COOKIE_MAX_AGE_MS,
  }
  const payload = Buffer.from( JSON.stringify( pending ) ).toString( 'base64url' )

  return {
    url: signInClient().buildSignInUrl( {
      origin,
      state,
      codeChallenge: createHash( 'sha256' ).update( verifier ).digest( 'base64url' ),
    } ),
    cookie: `${ payload }.${ sign( payload ) }`,
  }
}

const readPending = ( cookie: string | undefined, now: Date ): Pending | SignInFailure => {
  if( cookie === undefined || cookie === '' ) {
    return 'expired'
  }

  const [ payload, signature, ...rest ] = cookie.split( '.' )

  if( payload === undefined || signature === undefined || rest.length > 0 ) {
    return 'failed'
  }

  const expected = Buffer.from( sign( payload ) )
  const given = Buffer.from( signature )

  if( expected.length !== given.length || !timingSafeEqual( expected, given ) ) {
    return 'failed'
  }

  try {
    const parsed = Pending.safeParse( JSON.parse( Buffer.from( payload, 'base64url' ).toString() ) )

    if( !parsed.success ) {
      return 'failed'
    }

    return parsed.data.exp < now.getTime() ? 'expired' : parsed.data
  } catch{
    return 'failed'
  }
}

export type CompleteResult =
  | { ok: true, token: string, returnTo: string }
  | { ok: false, error: SignInFailure }

const refuse = ( error: SignInFailure, reason: string ): CompleteResult => {
  logger.warn( { reason }, 'Sign-in refused' )

  return { ok: false, error }
}

// Finds or creates the user for a verified Google identity and starts a session, or says why not
const admit = (
  identity: { sub: string, email: string, name: string },
  now: Date,
): { token: string } | { refused: string } => {
  const email = identity.email.toLowerCase()
  const existing = findUserByEmail( email )

  if( existing !== undefined ) {
    if( existing.status !== 'active' ) {
      return { refused: 'removed user' }
    }

    if( existing.google_sub === null ) {
      if( !bindGoogleSub( existing.id, identity.sub ).ok ) {
        return { refused: 'sub held by another user' }
      }
    } else if( existing.google_sub !== identity.sub ) {
      return { refused: 'sub differs from the one bound' }
    }

    touchSignIn( existing.id, now.toISOString() )

    return createSession( existing.id, now )
  }

  if( countUsers() > 0 || email !== config.adminEmail ) {
    return { refused: 'unknown email' }
  }

  const id = crypto.randomUUID()

  insertUser( {
    id,
    email,
    name: identity.name,
    role: 'admin',
    status: 'active',
    created_at: now.toISOString(),
  } )
  bindGoogleSub( id, identity.sub )
  seedUser( id, now.toISOString() )
  touchSignIn( id, now.toISOString() )

  return createSession( id, now )
}

export const completeSignIn = async (
  { origin, code, state, cookie, now }: {
    origin: string
    code: string | undefined
    state: string | undefined
    cookie: string | undefined
    now: Date
  },
): Promise< CompleteResult > => {
  const pending = readPending( cookie, now )

  if( typeof pending === 'string' ) {
    return refuse( pending, `sign-in cookie ${ pending }` )
  }

  if( state === undefined || state !== pending.state || pending.origin !== origin ) {
    return refuse( 'failed', 'state or origin mismatch' )
  }

  if( code === undefined || code === '' ) {
    return refuse( 'failed', 'no code' )
  }

  let identity

  try {
    identity = await signInClient().exchangeSignInCode( {
      origin,
      code,
      codeVerifier: pending.verifier,
    } )
  } catch( error ) {
    if( error instanceof SignInError ) {
      return refuse( 'failed', error.message )
    }

    throw error
  }

  if( !identity.email_verified ) {
    return refuse( 'not_allowed', 'email not verified' )
  }

  try {
    const admitted = inTransaction( () => admit( identity, now ) )

    return 'refused' in admitted
      ? refuse( 'not_allowed', admitted.refused )
      : { ok: true, token: admitted.token, returnTo: pending.returnTo }
  } catch( error ) {
    logger.error( { err: error }, 'Sign-in failed while saving the user' )

    return { ok: false, error: 'failed' }
  }
}

export const getMe = ( userId: string ): Me => {
  const user = findUserById( userId )

  if( user === undefined ) {
    throw new NotFoundError( 'Not Found' )
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    modules: user.role === 'admin' ? ModuleId.options : listModules( user.id ),
    vault_dir: user.vault_dir,
    vault_missing: vaultFolderMissing( user.vault_dir ),
    study_today: studyDay( new Date() ),
  }
}
