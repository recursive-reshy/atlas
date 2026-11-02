// Packages
import { z } from 'zod'
// Shared
import { Role, UserStatus } from '@atlas/shared'
// Repositories
import { getDatabase } from './database.js'

export const StoredUser = z.object( {
  id: z.string(),
  email: z.string(),
  google_sub: z.string().nullable(),
  name: z.string(),
  role: Role,
  status: UserStatus,
  vault_dir: z.string().nullable(),
  last_signin_at: z.string().nullable(),
  created_at: z.string(),
} )
export type StoredUser = z.infer< typeof StoredUser >

export type NewUser = Pick< StoredUser, 'id' | 'email' | 'name' | 'role' | 'status' | 'created_at' >
export type UserChange = Partial< Pick< StoredUser, 'name' | 'status' > >

export type InsertUserResult = { ok: true } | { ok: false, reason: 'email_taken' }
export type BindResult = { ok: true } | { ok: false, reason: 'sub_taken' }
export type VaultResult = { ok: true } | { ok: false, reason: 'vault_taken' | 'vault_changed' }

const COLUMNS = `id, email, google_sub, name, role, status, vault_dir, last_signin_at, created_at`

// Which column a UNIQUE constraint failure names, or null when the error is something else
const uniqueColumn = ( error: unknown ): string | null => {
  const isUnique = error instanceof Error
    && 'code' in error
    && error.code === 'SQLITE_CONSTRAINT_UNIQUE'

  if( !isUnique ) {
    return null
  }

  return /UNIQUE constraint failed: users\.(\w+)/.exec( error.message )?.[ 1 ] ?? null
}

export const insertUser = ( user: NewUser ): InsertUserResult => {
  try {
    getDatabase().prepare( `INSERT INTO users ( id, email, name, role, status, created_at )
      VALUES ( @id, @email, @name, @role, @status, @created_at )` )
      .run( { ...user, email: user.email.toLowerCase() } )

    return { ok: true }
  } catch( error ) {
    if( uniqueColumn( error ) === 'email' ) {
      return { ok: false, reason: 'email_taken' }
    }

    throw error
  }
}

export const findUserById = ( id: string ): StoredUser | undefined => {
  const row = getDatabase().prepare( `SELECT ${ COLUMNS } FROM users WHERE id = ?` ).get( id )

  return row === undefined ? undefined : StoredUser.parse( row )
}

export const findUserByEmail = ( email: string ): StoredUser | undefined => {
  const row = getDatabase()
    .prepare( `SELECT ${ COLUMNS } FROM users WHERE email = ?` )
    .get( email.toLowerCase() )

  return row === undefined ? undefined : StoredUser.parse( row )
}

export const countUsers = (): number => {
  const row = getDatabase().prepare( 'SELECT COUNT(*) AS count FROM users' ).get() as {
    count: number
  }

  return row.count
}

export const listUsers = (): StoredUser[] => {
  return getDatabase()
    .prepare( `SELECT ${ COLUMNS } FROM users
      ORDER BY role = 'admin' DESC, lower( name ), created_at, rowid` )
    .all()
    .map( ( row ) => StoredUser.parse( row ) )
}

export const updateUser = ( id: string, change: UserChange ): boolean => {
  const sets = ( [ 'name', 'status' ] as const )
    .filter( ( column ) => change[ column ] !== undefined )
    .map( ( column ) => `${ column } = @${ column }` )

  if( sets.length === 0 ) {
    return false
  }

  const result = getDatabase()
    .prepare( `UPDATE users SET ${ sets.join( ', ' ) } WHERE id = @id` )
    .run( { name: null, status: null, ...change, id } )

  return result.changes > 0
}

export const bindGoogleSub = ( id: string, sub: string ): BindResult => {
  try {
    getDatabase().prepare( 'UPDATE users SET google_sub = ? WHERE id = ?' ).run( sub, id )

    return { ok: true }
  } catch( error ) {
    if( uniqueColumn( error ) === 'google_sub' ) {
      return { ok: false, reason: 'sub_taken' }
    }

    throw error
  }
}

// With `expected` (the folder the caller saw, or null for none) the update only happens if the
// user still has it, so two requests that both saw the same state can't both win (ADR 0070).
export const setVaultDir = (
  id: string,
  vaultDir: string,
  expected?: string | null,
): VaultResult => {
  try {
    const result = expected === undefined
      ? getDatabase().prepare( 'UPDATE users SET vault_dir = ? WHERE id = ?' ).run( vaultDir, id )
      : getDatabase().prepare( 'UPDATE users SET vault_dir = ? WHERE id = ? AND vault_dir IS ?' )
        .run( vaultDir, id, expected )

    return expected !== undefined && result.changes === 0
      ? { ok: false, reason: 'vault_changed' }
      : { ok: true }
  } catch( error ) {
    if( uniqueColumn( error ) === 'vault_dir' ) {
      return { ok: false, reason: 'vault_taken' }
    }

    throw error
  }
}

export const listClaimedVaultDirs = (): string[] => {
  return getDatabase().prepare( 'SELECT vault_dir FROM users WHERE vault_dir IS NOT NULL' )
    .all()
    .map( ( row ) => z.object( { vault_dir: z.string() } ).parse( row ).vault_dir )
}

export const clearVaultDir = ( id: string ): boolean => {
  return getDatabase().prepare( 'UPDATE users SET vault_dir = NULL WHERE id = ?' )
    .run( id ).changes > 0
}

export const touchSignIn = ( id: string, at: string ): void => {
  getDatabase().prepare( 'UPDATE users SET last_signin_at = ? WHERE id = ?' ).run( at, id )
}

export const deleteUser = ( id: string ): boolean => {
  return getDatabase().prepare( 'DELETE FROM users WHERE id = ?' ).run( id ).changes > 0
}
