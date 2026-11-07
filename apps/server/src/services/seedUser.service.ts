// Packages
import type Database from 'better-sqlite3'
// Errors
import { NotFoundError } from '../errors.js'
// Repositories
import { getDatabase, inTransaction } from '../repositories/database.js'
import { findUserById, listUsers } from '../repositories/users.repository.js'
// Summarizer
import {
  DEFAULT_LINKER_GUIDANCE,
  LINKER_SEED_KEY,
  SEEDED_PROFILES,
} from '../summarizer/prompts.js'
// Melete
import {
  DEFAULT_MELETE_GRADING_GUIDANCE,
  DEFAULT_MELETE_MAP_GUIDANCE,
  DEFAULT_MELETE_QUESTIONS_GUIDANCE,
  DEFAULT_MELETE_SUGGEST_GUIDANCE,
  DEFAULT_MELETE_SYLLABUS_GUIDANCE,
  MELETE_GRADING_SEED_KEY,
  MELETE_MAP_SEED_KEY,
  MELETE_QUESTIONS_SEED_KEY,
  MELETE_SUGGEST_SEED_KEY,
  MELETE_SYLLABUS_SEED_KEY,
} from '../melete/prompts.js'

type SeedProfile = {
  name: string
  seedKey: string
  purpose: string
  guidance: string
}

const seedProfile = (
  db: Database.Database,
  userId: string,
  profile: SeedProfile,
  now: string,
): string => {
  const exists = db.prepare( 'SELECT id FROM prompt_profiles WHERE user_id = ? AND seed_key = ?' )
    .get( userId, profile.seedKey ) as { id: string } | undefined

  if( exists !== undefined ) {
    return exists.id
  }

  const taken = db.prepare( `SELECT 1 FROM prompt_profiles
    WHERE user_id = ? AND purpose = ? AND lower( name ) = lower( ? ) AND deleted_at IS NULL` )
    .get( userId, profile.purpose, profile.name )
  const id = crypto.randomUUID()
  const name = taken === undefined ? profile.name : `${ profile.name } (seeded)`

  db.prepare( `INSERT INTO prompt_profiles ( id, user_id, name, seed_key, purpose, created_at )
    VALUES ( ?, ?, ?, ?, ?, ? )` )
    .run( id, userId, name, profile.seedKey, profile.purpose, now )
  db.prepare( `INSERT INTO prompt_versions
    ( user_id, profile_id, version, guidance, source, created_at )
    VALUES ( ?, ?, 1, ?, 'seed', ? )` )
    .run( userId, id, profile.guidance, now )

  return id
}

// Gives a new user their prompt profiles and default (ADR 0065), all in one transaction
export const seedUser = ( userId: string, now: string ): void => {
  if( findUserById( userId ) === undefined ) {
    throw new NotFoundError( 'User not found' )
  }

  inTransaction( () => {
    const db = getDatabase()
    let businessId = ''

    for( const profile of SEEDED_PROFILES ) {
      const id = seedProfile( db, userId, { ...profile, purpose: 'summary' }, now )

      if( profile.seedKey === 'business' ) {
        businessId = id
      }
    }

    seedProfile( db, userId, {
      name: 'Linker',
      seedKey: LINKER_SEED_KEY,
      purpose: 'linker',
      guidance: DEFAULT_LINKER_GUIDANCE,
    }, now )
    seedProfile( db, userId, {
      name: 'Melete questions',
      seedKey: MELETE_QUESTIONS_SEED_KEY,
      purpose: 'melete_questions',
      guidance: DEFAULT_MELETE_QUESTIONS_GUIDANCE,
    }, now )
    seedProfile( db, userId, {
      name: 'Melete grading',
      seedKey: MELETE_GRADING_SEED_KEY,
      purpose: 'melete_grading',
      guidance: DEFAULT_MELETE_GRADING_GUIDANCE,
    }, now )
    seedProfile( db, userId, {
      name: 'Melete syllabus',
      seedKey: MELETE_SYLLABUS_SEED_KEY,
      purpose: 'melete_syllabus',
      guidance: DEFAULT_MELETE_SYLLABUS_GUIDANCE,
    }, now )
    seedProfile( db, userId, {
      name: 'Melete mapping',
      seedKey: MELETE_MAP_SEED_KEY,
      purpose: 'melete_map',
      guidance: DEFAULT_MELETE_MAP_GUIDANCE,
    }, now )
    seedProfile( db, userId, {
      name: 'Melete suggestions',
      seedKey: MELETE_SUGGEST_SEED_KEY,
      purpose: 'melete_suggest',
      guidance: DEFAULT_MELETE_SUGGEST_GUIDANCE,
    }, now )

    db.prepare( 'INSERT OR IGNORE INTO settings ( user_id, key, value ) VALUES ( ?, ?, ? )' )
      .run( userId, 'default_profile_id', JSON.stringify( businessId ) )
  } )
}

// A release that ships new profiles gives them to the users it already has. seedUser skips what
// a user holds (by seed key, even renamed or edited), so this changes nothing else.
export const seedAllUsers = ( now: string ): void => {
  for( const { id } of listUsers().filter( ( { status } ) => status === 'active' ) ) {
    seedUser( id, now )
  }
}
