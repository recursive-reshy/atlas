// Packages
import { z } from 'zod'
// Shared
import type { ModuleId } from '@atlas/shared'
import { PromptProfile, PromptPurpose, PromptVersion } from '@atlas/shared'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
import { modulesFor } from './modules.service.js'
// Melete
import {
  DEFAULT_MELETE_GRADING_GUIDANCE,
  DEFAULT_MELETE_QUESTIONS_GUIDANCE,
  MELETE_GRADING_SEED_KEY,
  MELETE_QUESTIONS_SEED_KEY,
} from '../melete/prompts.js'
// Repositories
import {
  ProfileRecord,
  countActiveProfiles,
  findLatestVersion,
  findProfileById,
  findProfileBySeedKey,
  findVersionById,
  insertProfile,
  insertVersion,
  listActiveProfiles,
  listVersions as listStoredVersions,
  markProfileDeleted,
  renameProfile as renameStoredProfile,
} from '../repositories/promptProfiles.repository.js'
import { getSetting } from '../repositories/settings.repository.js'
// Summarizer
import {
  DEFAULT_LINKER_GUIDANCE,
  LINKER_SEED_KEY,
  SEEDED_PROFILES,
} from '../summarizer/prompts.js'
// Logging
import { logger } from '../logger.js'

const NAME_TAKEN = 'A profile with that name already exists'
const LINKER_LOCKED = 'The linker prompt can\'t be renamed or deleted'
const MELETE_LOCKED = 'The Melete prompts can\'t be renamed or deleted'

const toProfile = ( userId: string, record: ProfileRecord ): PromptProfile => {
  const current = findLatestVersion( userId, record.id )

  if( current === undefined ) {
    throw new Error( `Profile ${ record.id } has no versions` )
  }

  return {
    id: record.id,
    name: record.name,
    can_reset: record.seed_key !== null,
    purpose: record.purpose,
    current_version: current,
    created_at: record.created_at,
  }
}

// A profile belongs to the module that uses it (TRD §5.3): the summary and linker prompts to
// Transcriber, the two Melete prompts to Melete
const PURPOSE_MODULE: Record< PromptPurpose, ModuleId > = {
  summary: 'transcriber',
  linker: 'transcriber',
  melete_questions: 'melete',
  melete_grading: 'melete',
}

const allows = ( userId: string, purpose: PromptPurpose ): boolean => {
  return modulesFor( userId ).includes( PURPOSE_MODULE[ purpose ] )
}

const requireActive = ( userId: string, id: string ): ProfileRecord => {
  const record = findProfileById( userId, id )

  if( record === undefined || record.deleted_at !== null || !allows( userId, record.purpose ) ) {
    throw new NotFoundError( 'Prompt profile not found' )
  }

  return record
}

const defaultProfileId = ( userId: string ): string => {
  return z.string().parse( getSetting( userId, 'default_profile_id' ) )
}

const PURPOSE_ORDER: PromptPurpose[] = [
  'summary',
  'linker',
  'melete_questions',
  'melete_grading',
]

// Summary profiles unless asked: the pickers use this list and know no other purpose
export const listProfiles = (
  userId: string,
  purpose: PromptPurpose | 'all' = 'summary',
): PromptProfile[] => {
  const purposes = ( purpose === 'all' ? PURPOSE_ORDER : [ purpose ] )
    .filter( ( each ) => allows( userId, each ) )

  return purposes.flatMap( ( each ) => {
    return listActiveProfiles( userId, each ).map( ( record ) => toProfile( userId, record ) )
  } )
}

export const findProfile = ( userId: string, id: string ): PromptProfile => {
  return toProfile( userId, requireActive( userId, id ) )
}

export const assertActiveProfile = ( userId: string, id: string ): void => {
  if( !listActiveProfiles( userId ).some( ( record ) => record.id === id ) ) {
    throw new ValidationError( 'Unknown prompt profile' )
  }
}

export const createProfile = (
  userId: string,
  { name, guidance }: { name: string, guidance: string },
): PromptProfile => {
  if( !allows( userId, 'summary' ) ) {
    throw new NotFoundError( 'Not Found' )
  }

  const id = crypto.randomUUID()
  const result = insertProfile( userId, {
    id,
    name,
    seed_key: null,
    created_at: new Date().toISOString(),
  } )

  if( !result.ok ) {
    throw new ConflictError( NAME_TAKEN )
  }

  insertVersion( userId, id, guidance, 'edit' )

  return findProfile( userId, id )
}

const requireRenamable = ( record: ProfileRecord ): void => {
  if( record.purpose === 'linker' ) {
    throw new ConflictError( LINKER_LOCKED )
  }

  if( record.purpose !== 'summary' ) {
    throw new ConflictError( MELETE_LOCKED )
  }
}

export const renameProfile = ( userId: string, id: string, name: string ): PromptProfile => {
  requireRenamable( requireActive( userId, id ) )

  if( !renameStoredProfile( userId, id, name ).ok ) {
    throw new ConflictError( NAME_TAKEN )
  }

  return findProfile( userId, id )
}

export const deleteProfile = ( userId: string, id: string ): void => {
  requireRenamable( requireActive( userId, id ) )

  if( id === defaultProfileId( userId ) ) {
    throw new ConflictError( 'The default profile cannot be deleted' )
  }

  if( countActiveProfiles( userId ) <= 1 ) {
    throw new ConflictError( 'The last remaining profile cannot be deleted' )
  }

  markProfileDeleted( userId, id, new Date().toISOString() )
}

export const saveVersion = ( userId: string, id: string, guidance: string ): PromptProfile => {
  const profile = findProfile( userId, id )

  if( guidance.trim() === profile.current_version.guidance.trim() ) {
    return profile
  }

  insertVersion( userId, id, guidance, 'edit' )

  return findProfile( userId, id )
}

export const restoreVersion = (
  userId: string,
  id: string,
  versionId: number,
): PromptProfile => {
  requireActive( userId, id )
  const version = findVersionById( userId, versionId )

  if( version === undefined || version.profile_id !== id ) {
    throw new NotFoundError( 'Prompt version not found' )
  }

  insertVersion( userId, id, version.guidance, 'restore' )

  return findProfile( userId, id )
}

const resetGuidance = ( { purpose, seed_key }: ProfileRecord ): string | undefined => {
  switch( purpose ) {
    case 'linker':
      return DEFAULT_LINKER_GUIDANCE
    case 'melete_questions':
      return DEFAULT_MELETE_QUESTIONS_GUIDANCE
    case 'melete_grading':
      return DEFAULT_MELETE_GRADING_GUIDANCE
    case 'summary':
      return SEEDED_PROFILES.find( ( { seedKey } ) => seedKey === seed_key )?.guidance
  }
}

export const resetProfile = ( userId: string, id: string ): PromptProfile => {
  const record = requireActive( userId, id )
  const guidance = resetGuidance( record )

  if( guidance === undefined ) {
    throw new ConflictError( 'Only the profiles the app ships can be reset' )
  }

  insertVersion( userId, id, guidance, 'reset' )

  return findProfile( userId, id )
}

export const listVersions = ( userId: string, id: string ): PromptVersion[] => {
  requireActive( userId, id )

  return listStoredVersions( userId, id )
}

export const resolvePrompt = (
  userId: string,
  profileId: string | null,
): { profile: PromptProfile, version: PromptVersion } => {
  let record = profileId === null ? undefined : findProfileById( userId, profileId )

  // The linker and Melete prompts are never summary prompts
  if( record !== undefined && record.purpose !== 'summary' ) {
    record = undefined
  }

  if( profileId !== null && record === undefined ) {
    logger.error(
      { profile_id: profileId },
      'Prompt profile not found; using the default profile',
    )
  }

  record ??= findProfileById( userId, defaultProfileId( userId ) )

  if( record === undefined ) {
    throw new Error( 'The default prompt profile is missing' )
  }

  const profile = toProfile( userId, record )

  return { profile, version: profile.current_version }
}

export const resolveLinkerPrompt = (
  userId: string,
): { profile: PromptProfile, version: PromptVersion } => {
  const record = findProfileBySeedKey( userId, LINKER_SEED_KEY )

  if( record === undefined ) {
    throw new Error( 'The linker prompt profile is missing' )
  }

  const profile = toProfile( userId, record )

  return { profile, version: profile.current_version }
}

export const resolveMeletePrompt = (
  userId: string,
  purpose: 'melete_questions' | 'melete_grading',
): { profile: PromptProfile, version: PromptVersion } => {
  const seedKey = purpose === 'melete_questions'
    ? MELETE_QUESTIONS_SEED_KEY
    : MELETE_GRADING_SEED_KEY
  const record = findProfileBySeedKey( userId, seedKey )

  if( record === undefined ) {
    throw new Error( `The ${ purpose } prompt profile is missing` )
  }

  const profile = toProfile( userId, record )

  return { profile, version: profile.current_version }
}
