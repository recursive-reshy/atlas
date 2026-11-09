// Packages
import {
  beforeEach,
  describe,
  it,
  expect,
} from 'vitest'
// Repositories
import {
  countActiveProfiles,
  findLatestVersion,
  findProfileById,
  findProfileBySeedKey,
  findVersionById,
  insertProfile,
  insertVersion,
  listActiveProfiles,
  listVersions,
  markProfileDeleted,
  renameProfile,
  setLastFolder,
} from './promptProfiles.repository.js'
// Test support
import { createTestUser } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = createTestUser().id
} )

const now = '2026-10-17T10:00:00.000Z'

const addProfile = ( name: string ): string => {
  const id = crypto.randomUUID()
  const result = insertProfile( userId, { id, name, seed_key: null, created_at: now } )

  expect( result ).toEqual( { ok: true } )

  return id
}

const seededId = ( name: string ): string => {
  const profile = listActiveProfiles( userId ).find( ( candidate ) => candidate.name === name )

  return profile?.id ?? ''
}

describe( 'listActiveProfiles', () => {
  it( 'lists the four seeded summary profiles by name', () => {
    expect( listActiveProfiles( userId ).map( ( { name, seed_key } ) => ( { name, seed_key } ) ) )
      .toEqual( [
        { name: 'Business ideas', seed_key: 'business' },
        { name: 'Coding', seed_key: 'coding' },
        { name: 'General', seed_key: 'general' },
        { name: 'Study', seed_key: 'study' },
      ] )
  } )

  it( 'sorts new profiles in by name, ignoring case', () => {
    addProfile( 'alpha' )
    addProfile( 'Zulu' )

    expect( listActiveProfiles( userId ).map( ( { name } ) => name ) )
      .toEqual( [ 'alpha', 'Business ideas', 'Coding', 'General', 'Study', 'Zulu' ] )
  } )

  it( 'leaves out deleted profiles', () => {
    const id = addProfile( 'Temp' )

    markProfileDeleted( userId, id, now )

    expect( listActiveProfiles( userId ).map( ( { name } ) => name ) ).not.toContain( 'Temp' )
  } )
} )

describe( 'findProfileById', () => {
  it( 'finds a profile with its fields', () => {
    const id = addProfile( 'Mine' )

    expect( findProfileById( userId, id ) ).toEqual( {
      id,
      name: 'Mine',
      seed_key: null,
      purpose: 'summary',
      last_folder: null,
      created_at: now,
      deleted_at: null,
    } )
  } )

  it( 'still finds a deleted profile', () => {
    const id = addProfile( 'Gone' )

    markProfileDeleted( userId, id, now )

    expect( findProfileById( userId, id )?.deleted_at ).toBe( now )
  } )

  it( 'returns undefined for an unknown id', () => {
    expect( findProfileById( userId, crypto.randomUUID() ) ).toBeUndefined()
  } )
} )

describe( 'insertProfile and renameProfile', () => {
  it( 'reports a name taken by an active profile, ignoring case', () => {
    const result = insertProfile( userId, {
      id: crypto.randomUUID(),
      name: 'CODING',
      seed_key: null,
      created_at: now,
    } )

    expect( result ).toEqual( { ok: false, reason: 'name_taken' } )
    expect( countActiveProfiles( userId ) ).toBe( 4 )
  } )

  it( 'lets a deleted profile\'s name be used again', () => {
    markProfileDeleted( userId, seededId( 'Coding' ), now )

    expect( insertProfile( userId, {
      id: crypto.randomUUID(),
      name: 'coding',
      seed_key: null,
      created_at: now,
    } ) ).toEqual( { ok: true } )
  } )

  it( 'renames a profile', () => {
    const id = addProfile( 'Old' )

    expect( renameProfile( userId, id, 'New' ) ).toEqual( { ok: true } )
    expect( findProfileById( userId, id )?.name ).toBe( 'New' )
  } )

  it( 'reports a rename onto another active profile\'s name', () => {
    const id = addProfile( 'Other' )

    expect( renameProfile( userId, id, 'general' ) ).toEqual( { ok: false, reason: 'name_taken' } )
    expect( findProfileById( userId, id )?.name ).toBe( 'Other' )
  } )

  it( 'allows changing only the case of a profile\'s own name', () => {
    const id = addProfile( 'Mine' )

    expect( renameProfile( userId, id, 'MINE' ) ).toEqual( { ok: true } )
    expect( findProfileById( userId, id )?.name ).toBe( 'MINE' )
  } )
} )

describe( 'markProfileDeleted and countActiveProfiles', () => {
  it( 'stamps deleted_at and drops the profile from the count', () => {
    const id = addProfile( 'Temp' )

    expect( countActiveProfiles( userId ) ).toBe( 5 )

    markProfileDeleted( userId, id, now )

    expect( countActiveProfiles( userId ) ).toBe( 4 )
    expect( findProfileById( userId, id )?.deleted_at ).toBe( now )
  } )
} )

describe( 'versions', () => {
  it( 'starts a seeded profile at version 1', () => {
    const latest = findLatestVersion( userId, seededId( 'Coding' ) )

    expect( latest ).toMatchObject( { version: 1, source: 'seed' } )
  } )

  it( 'numbers new versions per profile, newest last assigned', () => {
    const coding = seededId( 'Coding' )
    const general = seededId( 'General' )

    const second = insertVersion( userId, coding, 'one', 'edit' )
    const third = insertVersion( userId, coding, 'two', 'restore' )
    const generalSecond = insertVersion( userId, general, 'other', 'edit' )

    expect( [ second.version, third.version, generalSecond.version ] ).toEqual( [ 2, 3, 2 ] )
    expect( third ).toMatchObject( {
      profile_id: coding,
      guidance: 'two',
      source: 'restore',
    } )
    expect( new Date( third.created_at ).toISOString() ).toBe( third.created_at )
  } )

  it( 'starts a brand new profile at version 1', () => {
    const id = addProfile( 'Fresh' )

    expect( insertVersion( userId, id, 'g', 'edit' ).version ).toBe( 1 )
  } )

  it( 'finds the latest version', () => {
    const coding = seededId( 'Coding' )
    insertVersion( userId, coding, 'one', 'edit' )
    const last = insertVersion( userId, coding, 'two', 'reset' )

    expect( findLatestVersion( userId, coding ) ).toEqual( last )
  } )

  it( 'lists versions newest first', () => {
    const coding = seededId( 'Coding' )
    insertVersion( userId, coding, 'one', 'edit' )
    insertVersion( userId, coding, 'two', 'edit' )

    expect( listVersions( userId, coding ).map( ( { version } ) => version ) )
      .toEqual( [ 3, 2, 1 ] )
  } )

  it( 'finds a version by id, and returns undefined for an unknown id', () => {
    const created = insertVersion( userId, seededId( 'Coding' ), 'one', 'edit' )

    expect( findVersionById( userId, created.id ) ).toEqual( created )
    expect( findVersionById( userId, 999_999 ) ).toBeUndefined()
  } )

  it( 'returns no latest version for an unknown profile', () => {
    expect( findLatestVersion( userId, crypto.randomUUID() ) ).toBeUndefined()
    expect( listVersions( userId, crypto.randomUUID() ) ).toEqual( [] )
  } )

  it( 'refuses a version for an unknown profile', () => {
    expect( () => insertVersion( userId, crypto.randomUUID(), 'g', 'edit' ) ).toThrow()
  } )
} )

describe( 'profile purposes', () => {
  it( 'lists only summary profiles by default', () => {
    expect( listActiveProfiles( userId ).map( ( { name } ) => name ) )
      .toEqual( [ 'Business ideas', 'Coding', 'General', 'Study' ] )
    expect( listActiveProfiles( userId, 'summary' ) ).toEqual( listActiveProfiles( userId ) )
  } )

  it( 'lists the seeded linker profile under the linker purpose', () => {
    expect( listActiveProfiles( userId, 'linker' ).map( ( { name, seed_key, purpose } ) => ( {
      name,
      seed_key,
      purpose,
    } ) ) ).toEqual( [ { name: 'Linker', seed_key: 'linker', purpose: 'linker' } ] )
  } )

  it( 'finds a profile by its seed key, or nothing', () => {
    expect( findProfileBySeedKey( userId, 'linker' )?.purpose ).toBe( 'linker' )
    expect( findProfileBySeedKey( userId, 'coding' )?.name ).toBe( 'Coding' )
    expect( findProfileBySeedKey( userId, 'melete_questions' )?.purpose ).toBe( 'melete_questions' )
    expect( findProfileBySeedKey( userId, 'melete_grading' )?.purpose ).toBe( 'melete_grading' )
    expect( findProfileBySeedKey( userId, 'melete_syllabus' )?.purpose ).toBe( 'melete_syllabus' )
    expect( findProfileBySeedKey( userId, 'melete_map' )?.purpose ).toBe( 'melete_map' )
    expect( findProfileBySeedKey( userId, 'melete_suggest' )?.purpose ).toBe( 'melete_suggest' )
    expect( findProfileBySeedKey( userId, 'nope' ) ).toBeUndefined()
  } )

  it( 'inserts a profile with the summary purpose unless told otherwise', () => {
    const id = addProfile( 'Plain' )

    expect( findProfileById( userId, id )?.purpose ).toBe( 'summary' )

    const other = crypto.randomUUID()

    expect( insertProfile( userId, {
      id: other,
      name: 'Other linker',
      seed_key: null,
      purpose: 'linker',
      created_at: now,
    } ) ).toEqual( { ok: true } )
    expect( findProfileById( userId, other )?.purpose ).toBe( 'linker' )
  } )

  it( 'lets a summary profile share its name with the linker profile', () => {
    expect( insertProfile( userId, {
      id: crypto.randomUUID(),
      name: 'linker',
      seed_key: null,
      created_at: now,
    } ) ).toEqual( { ok: true } )
  } )

  it( 'counts per purpose, so the last summary profile rule ignores the linker', () => {
    expect( countActiveProfiles( userId ) ).toBe( 4 )
    expect( countActiveProfiles( userId, 'summary' ) ).toBe( 4 )
    expect( countActiveProfiles( userId, 'linker' ) ).toBe( 1 )
  } )
} )

describe( 'last_folder', () => {
  it( 'starts empty on every profile', () => {
    expect( listActiveProfiles( userId ).map( ( { last_folder } ) => last_folder ) )
      .toEqual( [ null, null, null, null ] )
    expect( findProfileBySeedKey( userId, 'linker' )?.last_folder ).toBeNull()
  } )

  it( 'is remembered per profile and replaced by the next save', () => {
    const coding = seededId( 'Coding' )
    const general = seededId( 'General' )

    setLastFolder( userId, coding, 'Learning/TypeScript' )

    expect( findProfileById( userId, coding )?.last_folder ).toBe( 'Learning/TypeScript' )
    expect( findProfileById( userId, general )?.last_folder ).toBeNull()

    setLastFolder( userId, coding, 'Learning/React' )

    expect( findProfileById( userId, coding )?.last_folder ).toBe( 'Learning/React' )
  } )

  it( 'does nothing for an unknown profile', () => {
    expect( () => setLastFolder( userId, crypto.randomUUID(), 'Learning' ) ).not.toThrow()
  } )

  it( 'stays null for a profile added later', () => {
    expect( findProfileById( userId, addProfile( 'Mine' ) )?.last_folder ).toBeNull()
  } )
} )

describe( 'the Melete profiles', () => {
  it( 'are listed by their own purpose and not with the summary profiles', () => {
    expect( listActiveProfiles( userId, 'melete_questions' ).map( ( { name } ) => name ) )
      .toEqual( [ 'Melete questions' ] )
    expect( listActiveProfiles( userId, 'melete_grading' ).map( ( { name } ) => name ) )
      .toEqual( [ 'Melete grading' ] )
    expect( listActiveProfiles( userId, 'melete_syllabus' ).map( ( { name } ) => name ) )
      .toEqual( [ 'Melete syllabus' ] )
    expect( listActiveProfiles( userId ).map( ( { name } ) => name ) )
      .not.toContain( 'Melete questions' )
  } )

  it( 'are counted per purpose', () => {
    expect( countActiveProfiles( userId, 'melete_questions' ) ).toBe( 1 )
    expect( countActiveProfiles( userId, 'melete_grading' ) ).toBe( 1 )
  } )

  it( 'let a summary profile carry the same name', () => {
    expect( () => addProfile( 'Melete questions' ) ).not.toThrow()
  } )
} )

describe( 'ownership', () => {
  it( 'gives every user their own seeded profiles', () => {
    const other = createTestUser().id

    expect( listActiveProfiles( other ).map( ( { name } ) => name ) )
      .toEqual( listActiveProfiles( userId ).map( ( { name } ) => name ) )
    expect( listActiveProfiles( other ).map( ( { id } ) => id ) )
      .not.toEqual( listActiveProfiles( userId ).map( ( { id } ) => id ) )
  } )

  it( 'never shows, finds or counts another user\'s profiles', () => {
    const other = createTestUser().id
    const mine = addProfile( 'Mine only' )

    expect( listActiveProfiles( other ).map( ( { name } ) => name ) ).not.toContain( 'Mine only' )
    expect( findProfileById( other, mine ) ).toBeUndefined()
    expect( countActiveProfiles( other ) ).toBe( 4 )
    expect( findProfileBySeedKey( other, 'coding' )?.id )
      .not.toBe( findProfileBySeedKey( userId, 'coding' )?.id )
  } )

  it( 'lets two users hold the same profile name', () => {
    const other = createTestUser().id

    expect( insertProfile( other, {
      id: crypto.randomUUID(),
      name: 'Mine',
      seed_key: null,
      created_at: now,
    } ) ).toEqual( { ok: true } )
    expect( addProfile( 'Mine' ) ).toBeTruthy()
  } )

  it( 'does not rename, delete or set the folder of another user\'s profile', () => {
    const other = createTestUser().id
    const mine = addProfile( 'Mine' )

    renameProfile( other, mine, 'Stolen' )
    markProfileDeleted( other, mine, now )
    setLastFolder( other, mine, 'Elsewhere' )

    expect( findProfileById( userId, mine ) ).toMatchObject( {
      name: 'Mine',
      deleted_at: null,
      last_folder: null,
    } )
  } )

  it( 'does not show or add versions of another user\'s profile', () => {
    const other = createTestUser().id
    const mine = seededId( 'Coding' )

    expect( findLatestVersion( other, mine ) ).toBeUndefined()
    expect( listVersions( other, mine ) ).toEqual( [] )
    expect( findVersionById( other, findLatestVersion( userId, mine )?.id ?? 0 ) ).toBeUndefined()
    expect( () => insertVersion( other, mine, 'g', 'edit' ) ).toThrow()
  } )
} )
