// Packages
import { z } from 'zod'
// Shared
import { PromptPurpose, PromptVersion, PromptVersionSource } from '@atlas/shared'
// Repositories
import { getDatabase } from './database.js'

export const ProfilePurpose = PromptPurpose
export type ProfilePurpose = z.infer< typeof ProfilePurpose >

export const ProfileRecord = z.object( {
  id: z.string(),
  name: z.string(),
  seed_key: z.string().nullable(),
  purpose: ProfilePurpose,
  last_folder: z.string().nullable(),
  created_at: z.string(),
  deleted_at: z.string().nullable(),
} )
export type ProfileRecord = z.infer< typeof ProfileRecord >

export type NewProfile = Omit< ProfileRecord, 'deleted_at' | 'purpose' | 'last_folder' > & {
  purpose?: ProfilePurpose
}
export type WriteResult = { ok: true } | { ok: false, reason: 'name_taken' }

const isUniqueViolation = ( error: unknown ): boolean => {
  return error instanceof Error
    && 'code' in error
    && error.code === 'SQLITE_CONSTRAINT_UNIQUE'
}

const writeProfile = ( write: () => void ): WriteResult => {
  try {
    write()
  } catch( error ) {
    if( isUniqueViolation( error ) ) {
      return { ok: false, reason: 'name_taken' }
    }

    throw error
  }

  return { ok: true }
}

export const listActiveProfiles = (
  userId: string,
  purpose: ProfilePurpose = 'summary',
): ProfileRecord[] => {
  return z.array( ProfileRecord ).parse( getDatabase()
    .prepare( `SELECT * FROM prompt_profiles
      WHERE user_id = ? AND deleted_at IS NULL AND purpose = ?
      ORDER BY lower( name ), rowid` )
    .all( userId, purpose ) )
}

export const findProfileById = ( userId: string, id: string ): ProfileRecord | undefined => {
  const row = getDatabase()
    .prepare( 'SELECT * FROM prompt_profiles WHERE id = ? AND user_id = ?' )
    .get( id, userId )

  return row === undefined ? undefined : ProfileRecord.parse( row )
}

export const findProfileBySeedKey = (
  userId: string,
  seedKey: string,
): ProfileRecord | undefined => {
  const row = getDatabase()
    .prepare( `SELECT * FROM prompt_profiles
      WHERE seed_key = ? AND user_id = ? AND deleted_at IS NULL` )
    .get( seedKey, userId )

  return row === undefined ? undefined : ProfileRecord.parse( row )
}

export const insertProfile = ( userId: string, profile: NewProfile ): WriteResult => {
  return writeProfile( () => {
    getDatabase()
      .prepare( `INSERT INTO prompt_profiles ( id, user_id, name, seed_key, purpose, created_at )
        VALUES ( @id, @user_id, @name, @seed_key, @purpose, @created_at )` )
      .run( { purpose: 'summary', ...profile, user_id: userId } )
  } )
}

export const renameProfile = ( userId: string, id: string, name: string ): WriteResult => {
  return writeProfile( () => {
    getDatabase()
      .prepare( 'UPDATE prompt_profiles SET name = ? WHERE id = ? AND user_id = ?' )
      .run( name, id, userId )
  } )
}

export const setLastFolder = ( userId: string, profileId: string, folder: string ): void => {
  getDatabase()
    .prepare( 'UPDATE prompt_profiles SET last_folder = ? WHERE id = ? AND user_id = ?' )
    .run( folder, profileId, userId )
}

export const markProfileDeleted = ( userId: string, id: string, deletedAt: string ): void => {
  getDatabase()
    .prepare( 'UPDATE prompt_profiles SET deleted_at = ? WHERE id = ? AND user_id = ?' )
    .run( deletedAt, id, userId )
}

export const countActiveProfiles = (
  userId: string,
  purpose: ProfilePurpose = 'summary',
): number => {
  const row = getDatabase()
    .prepare( `SELECT COUNT(*) AS count FROM prompt_profiles
      WHERE user_id = ? AND deleted_at IS NULL AND purpose = ?` )
    .get( userId, purpose ) as { count: number }

  return row.count
}

export const findLatestVersion = (
  userId: string,
  profileId: string,
): PromptVersion | undefined => {
  const row = getDatabase()
    .prepare( `SELECT * FROM prompt_versions WHERE profile_id = ? AND user_id = ?
      ORDER BY version DESC LIMIT 1` )
    .get( profileId, userId )

  return row === undefined ? undefined : PromptVersion.parse( row )
}

export const listVersions = ( userId: string, profileId: string ): PromptVersion[] => {
  return z.array( PromptVersion ).parse( getDatabase()
    .prepare( `SELECT * FROM prompt_versions WHERE profile_id = ? AND user_id = ?
      ORDER BY version DESC` )
    .all( profileId, userId ) )
}

export const findVersionById = ( userId: string, id: number ): PromptVersion | undefined => {
  const row = getDatabase()
    .prepare( 'SELECT * FROM prompt_versions WHERE id = ? AND user_id = ?' )
    .get( id, userId )

  return row === undefined ? undefined : PromptVersion.parse( row )
}

export const insertVersion = (
  userId: string,
  profileId: string,
  guidance: string,
  source: PromptVersionSource,
): PromptVersion => {
  const db = getDatabase()

  return db.transaction( () => {
    const owned = db
      .prepare( 'SELECT 1 FROM prompt_profiles WHERE id = ? AND user_id = ?' )
      .get( profileId, userId )

    if( owned === undefined ) {
      throw new Error( `Profile ${ profileId } not found for the user` )
    }

    const { next } = db
      .prepare( `SELECT COALESCE( MAX( version ), 0 ) + 1 AS next
        FROM prompt_versions WHERE profile_id = ? AND user_id = ?` )
      .get( profileId, userId ) as { next: number }
    const { lastInsertRowid } = db
      .prepare( `INSERT INTO prompt_versions
        ( user_id, profile_id, version, guidance, source, created_at )
        VALUES ( ?, ?, ?, ?, ?, ? )` )
      .run( userId, profileId, next, guidance, source, new Date().toISOString() )

    return PromptVersion.parse( db
      .prepare( 'SELECT * FROM prompt_versions WHERE id = ? AND user_id = ?' )
      .get( lastInsertRowid, userId ) )
  } )()
}
