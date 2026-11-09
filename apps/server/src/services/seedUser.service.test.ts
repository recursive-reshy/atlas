// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { insertUser } from '../repositories/users.repository.js'
// Services
import { seedAllUsers, seedUser } from './seedUser.service.js'
// Summarizer
import { DEFAULT_LINKER_GUIDANCE, SEEDED_PROFILES } from '../summarizer/prompts.js'
// Melete
import {
  DEFAULT_MELETE_GRADING_GUIDANCE,
  DEFAULT_MELETE_MAP_GUIDANCE,
  DEFAULT_MELETE_SUGGEST_GUIDANCE,
  DEFAULT_MELETE_SYLLABUS_GUIDANCE,
  DEFAULT_MELETE_QUESTIONS_GUIDANCE,
} from '../melete/prompts.js'

const NOW = '2026-10-24T10:00:00.000Z'

const addUser = ( id: string, role: 'admin' | 'member' = 'member' ): string => {
  insertUser( {
    id,
    email: `${ id }@x.test`,
    name: id,
    role,
    status: 'active',
    created_at: NOW,
  } )

  return id
}

type ProfileRow = {
  user_id: string
  name: string
  seed_key: string
  purpose: string
  guidance: string
  version: number
  source: string
}

const profiles = ( userId?: string ): ProfileRow[] => {
  const rows = getDatabase().prepare( `SELECT
      p.user_id, p.name, p.seed_key, p.purpose, v.guidance, v.version, v.source
    FROM prompt_profiles p JOIN prompt_versions v ON v.profile_id = p.id
    ORDER BY p.rowid` ).all() as ProfileRow[]

  return userId === undefined ? rows : rows.filter( ( row ) => row.user_id === userId )
}

const settingsOf = ( userId: string ): unknown[] => {
  return getDatabase().prepare( 'SELECT key, value FROM settings WHERE user_id = ?' ).all( userId )
}

describe( 'seedUser', () => {
  it( 'creates each seeded profile once, at version 1, owned by the user', () => {
    seedUser( addUser( 'a' ), NOW )

    const rows = profiles( 'a' )

    for( const seeded of SEEDED_PROFILES ) {
      expect( rows.filter( ( { seed_key } ) => seed_key === seeded.seedKey ) ).toEqual( [ {
        user_id: 'a',
        name: seeded.name,
        seed_key: seeded.seedKey,
        purpose: 'summary',
        guidance: seeded.guidance,
        version: 1,
        source: 'seed',
      } ] )
    }

    expect( rows.find( ( { seed_key } ) => seed_key === 'linker' ) ).toMatchObject( {
      name: 'Linker',
      purpose: 'linker',
      guidance: DEFAULT_LINKER_GUIDANCE,
    } )
    expect( rows.find( ( { seed_key } ) => seed_key === 'melete_questions' ) ).toMatchObject( {
      name: 'Melete questions',
      purpose: 'melete_questions',
      guidance: DEFAULT_MELETE_QUESTIONS_GUIDANCE,
    } )
    expect( rows.find( ( { seed_key } ) => seed_key === 'melete_grading' ) ).toMatchObject( {
      name: 'Melete grading',
      purpose: 'melete_grading',
      guidance: DEFAULT_MELETE_GRADING_GUIDANCE,
    } )
    expect( rows.find( ( { seed_key } ) => seed_key === 'melete_syllabus' ) ).toMatchObject( {
      name: 'Melete syllabus',
      purpose: 'melete_syllabus',
      guidance: DEFAULT_MELETE_SYLLABUS_GUIDANCE,
    } )
    expect( rows.find( ( { seed_key } ) => seed_key === 'melete_map' ) ).toMatchObject( {
      name: 'Melete mapping',
      purpose: 'melete_map',
      guidance: DEFAULT_MELETE_MAP_GUIDANCE,
    } )
    expect( rows.find( ( { seed_key } ) => seed_key === 'melete_suggest' ) ).toMatchObject( {
      name: 'Melete suggestions',
      purpose: 'melete_suggest',
      guidance: DEFAULT_MELETE_SUGGEST_GUIDANCE,
    } )
    expect( rows ).toHaveLength( SEEDED_PROFILES.length + 6 )
  } )

  it( 'makes Business ideas the default profile and sets nothing else', () => {
    seedUser( addUser( 'a' ), NOW )

    const business = getDatabase()
      .prepare( "SELECT id FROM prompt_profiles WHERE seed_key = 'business' AND user_id = 'a'" )
      .get() as { id: string }

    expect( settingsOf( 'a' ) ).toEqual( [
      { key: 'default_profile_id', value: JSON.stringify( business.id ) },
    ] )
  } )

  it( 'stamps the profiles with the time it is given and uuid ids', () => {
    seedUser( addUser( 'a' ), NOW )

    const row = getDatabase().prepare( 'SELECT id, created_at FROM prompt_profiles LIMIT 1' )
      .get() as { id: string, created_at: string }

    expect( row.id ).toMatch( /^[0-9a-f-]{36}$/ )
    expect( row.created_at ).toBe( NOW )
  } )

  it( 'gives a second user their own profiles and default, leaving the first alone', () => {
    seedUser( addUser( 'a' ), NOW )

    const before = profiles( 'a' )
    const settingsBefore = settingsOf( 'a' )

    seedUser( addUser( 'b' ), NOW )

    expect( profiles( 'a' ) ).toEqual( before )
    expect( settingsOf( 'a' ) ).toEqual( settingsBefore )
    expect( profiles( 'b' ) ).toHaveLength( before.length )
    expect( settingsOf( 'b' ) ).not.toEqual( settingsBefore )
  } )

  it( 'adds nothing when run again for the same user', () => {
    seedUser( addUser( 'a' ), NOW )

    const before = profiles( 'a' )

    seedUser( 'a', NOW )

    expect( profiles( 'a' ) ).toEqual( before )
  } )

  it( 'does not overwrite a changed default_profile_id', () => {
    seedUser( addUser( 'a' ), NOW )
    getDatabase().prepare( `UPDATE settings SET value = '"other"'
      WHERE key = 'default_profile_id' AND user_id = 'a'` ).run()

    seedUser( 'a', NOW )

    expect( settingsOf( 'a' ) ).toEqual( [ { key: 'default_profile_id', value: '"other"' } ] )
  } )

  it( 'suffixes a seeded name that a user profile already holds', () => {
    addUser( 'a' )
    getDatabase().prepare( `INSERT INTO prompt_profiles ( id, user_id, name, created_at )
      VALUES ( 'mine', 'a', 'Study', 'now' )` ).run()

    seedUser( 'a', NOW )

    expect( getDatabase().prepare( "SELECT name FROM prompt_profiles WHERE seed_key = 'study'" )
      .all() ).toEqual( [ { name: 'Study (seeded)' } ] )
    expect( getDatabase().prepare( "SELECT name FROM prompt_profiles WHERE id = 'mine'" ).get() )
      .toEqual( { name: 'Study' } )
  } )

  it( 'skips a profile whose seed key the user already has, even if renamed', () => {
    addUser( 'a' )
    getDatabase().prepare( `INSERT INTO prompt_profiles ( id, user_id, name, seed_key, created_at )
      VALUES ( 'mine', 'a', 'Renamed', 'study', 'now' )` ).run()

    seedUser( 'a', NOW )

    expect( getDatabase().prepare( `SELECT COUNT(*) AS count FROM prompt_profiles
      WHERE seed_key = 'study'` ).get() ).toEqual( { count: 1 } )
  } )

  it( 'writes nothing when it fails part-way', () => {
    addUser( 'a' )
    getDatabase().exec( `CREATE TRIGGER fail_linker BEFORE INSERT ON prompt_profiles
      WHEN NEW.seed_key = 'linker' BEGIN SELECT RAISE( ABORT, 'boom' ); END;` )

    expect( () => seedUser( 'a', NOW ) ).toThrow( 'boom' )
    expect( profiles() ).toEqual( [] )
    expect( settingsOf( 'a' ) ).toEqual( [] )
  } )
} )

describe( 'seedUser for an unknown user', () => {
  it( 'throws not found and seeds nothing', () => {
    expect( () => seedUser( 'ghost', NOW ) ).toThrow( 'User not found' )
    expect( profiles() ).toEqual( [] )
  } )
} )

describe( 'seedAllUsers (a release that adds profiles)', () => {
  const removeNewMeleteProfiles = ( userId: string ): void => {
    const db = getDatabase()
    const ids = ( db.prepare( `SELECT id FROM prompt_profiles
      WHERE user_id = ? AND seed_key IN ( 'melete_syllabus', 'melete_map', 'melete_suggest' )` )
      .all( userId ) as { id: string }[] ).map( ( { id } ) => id )

    for( const id of ids ) {
      db.prepare( 'DELETE FROM prompt_versions WHERE profile_id = ?' ).run( id )
      db.prepare( 'DELETE FROM prompt_profiles WHERE id = ?' ).run( id )
    }
  }

  it( 'gives every existing user the profiles they lack and changes nothing else', () => {
    seedUser( addUser( 'a' ), NOW )
    seedUser( addUser( 'b', 'admin' ), NOW )
    removeNewMeleteProfiles( 'a' )
    removeNewMeleteProfiles( 'b' )
    getDatabase().prepare( `INSERT INTO prompt_versions
      ( user_id, profile_id, version, guidance, source, created_at )
      SELECT user_id, id, 2, 'My own guidance.', 'edit', 'now' FROM prompt_profiles
      WHERE user_id = 'a' AND seed_key = 'melete_questions'` ).run()

    const before = profiles( 'a' ).filter( ( { seed_key } ) => seed_key === 'melete_questions' )

    seedAllUsers( NOW )

    for( const id of [ 'a', 'b' ] ) {
      const keys = new Set( profiles( id ).map( ( { seed_key } ) => seed_key ) )

      for( const key of [ 'melete_syllabus', 'melete_map', 'melete_suggest' ] ) {
        expect( keys.has( key ), `${ id } has ${ key }` ).toBe( true )
      }

      expect( keys.size ).toBe( SEEDED_PROFILES.length + 6 )
    }

    expect( profiles( 'a' ).filter( ( { seed_key } ) => seed_key === 'melete_questions' ) )
      .toEqual( before )
  } )

  it( 'is quiet when everyone already has everything', () => {
    seedUser( addUser( 'a' ), NOW )

    const before = profiles( 'a' )

    seedAllUsers( NOW )
    seedAllUsers( NOW )

    expect( profiles( 'a' ) ).toEqual( before )
  } )

  it( 'skips a removed user', () => {
    addUser( 'a' )
    getDatabase().prepare( "UPDATE users SET status = 'removed' WHERE id = 'a'" ).run()

    seedAllUsers( NOW )

    expect( profiles( 'a' ) ).toEqual( [] )
  } )
} )
