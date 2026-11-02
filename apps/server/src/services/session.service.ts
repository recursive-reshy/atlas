// Node
import { createHash, randomBytes } from 'node:crypto'
import type { CookieOptions } from 'express'
// Shared
import { ModuleId } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Repositories
import {
  deleteExpiredSessions,
  deleteSession,
  findSession,
  insertSession,
  touchSession,
} from '../repositories/sessions.repository.js'
import { listModules } from '../repositories/userModules.repository.js'
import { findUserById } from '../repositories/users.repository.js'
import type { StoredUser } from '../repositories/users.repository.js'

export const SESSION_COOKIE = 'atlas_session'

const DAY_MS = 24 * 60 * 60 * 1000
const REFRESH_AFTER_MS = 60 * 60 * 1000

export type SessionUser = Pick< StoredUser, 'id' | 'role' | 'vault_dir' > & {
  modules: ModuleId[]
}

export const hashToken = ( token: string ): string => {
  return createHash( 'sha256' ).update( token ).digest( 'hex' )
}

const expiryFrom = ( now: Date ): string => {
  return new Date( now.getTime() + config.sessionDays * DAY_MS ).toISOString()
}

// Only the hash is stored, so a copy of the database can't be used to sign in
export const createSession = ( userId: string, now: Date ): { token: string } => {
  const token = randomBytes( 32 ).toString( 'base64url' )
  const at = now.toISOString()

  insertSession( {
    token_hash: hashToken( token ),
    user_id: userId,
    created_at: at,
    last_seen_at: at,
    expires_at: expiryFrom( now ),
  } )

  return { token }
}

export const cookieOptions = ( secure: boolean ): CookieOptions => {
  return {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure,
    maxAge: config.sessionDays * DAY_MS,
  }
}

// `refreshed` tells the caller to send the cookie again with its new lifetime
export const resolveSession = (
  token: string | undefined,
  now: Date,
): { user: SessionUser, refreshed: boolean } | null => {
  if( token === undefined || token === '' ) {
    return null
  }

  const hash = hashToken( token )
  const session = findSession( hash )

  if( session === undefined || session.expires_at <= now.toISOString() ) {
    return null
  }

  const user = findUserById( session.user_id )

  if( user === undefined || user.status !== 'active' ) {
    return null
  }

  const refreshed = now.getTime() - new Date( session.last_seen_at ).getTime() >= REFRESH_AFTER_MS

  if( refreshed ) {
    touchSession( hash, now.toISOString(), expiryFrom( now ) )
  }

  return {
    user: {
      id: user.id,
      role: user.role,
      vault_dir: user.vault_dir,
      modules: user.role === 'admin' ? ModuleId.options : listModules( user.id ),
    },
    refreshed,
  }
}

export const endSession = ( token: string | undefined ): void => {
  if( token !== undefined && token !== '' ) {
    deleteSession( hashToken( token ) )
  }
}

export const sweepSessions = ( now: Date ): number => {
  return deleteExpiredSessions( now.toISOString() )
}
