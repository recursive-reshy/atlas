// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Errors
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../errors.js'
// Repositories
import { getSetting, setSetting } from '../repositories/settings.repository.js'
// Summarizer
import {
  DEFAULT_LINKER_GUIDANCE,
  SEEDED_PROFILES,
  STUDY_GUIDANCE,
} from '../summarizer/prompts.js'
// Melete
import {
  DEFAULT_MELETE_GRADING_GUIDANCE,
  DEFAULT_MELETE_MAP_GUIDANCE,
  DEFAULT_MELETE_SUGGEST_GUIDANCE,
  DEFAULT_MELETE_SYLLABUS_GUIDANCE,
  DEFAULT_MELETE_QUESTIONS_GUIDANCE,
} from '../melete/prompts.js'
// Services
import {
  assertActiveProfile,
  createProfile,
  deleteProfile,
  findProfile,
  listProfiles,
  listVersions,
  renameProfile,
  resetProfile,
  resolveLinkerPrompt,
  resolveMeletePrompt,
  resolvePrompt,
  restoreVersion,
  saveVersion,
} from './prompts.service.js'
// Logging
import { logger } from '../logger.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const byName = ( name: string ): string => {
  const profile = listProfiles( userId ).find( ( candidate ) => candidate.name === name )

  return profile?.id ?? ''
}

const defaultId = (): string => String( getSetting( userId, 'default_profile_id' ) )

describe( 'listProfiles and findProfile', () => {
  it( 'lists the seeded profiles with their current version and reset flag', () => {
    const profiles = listProfiles( userId )

    expect( profiles.map( ( { name, can_reset } ) => ( { name, can_reset } ) ) ).toEqual( [
      { name: 'Business ideas', can_reset: true },
      { name: 'Coding', can_reset: true },
      { name: 'General', can_reset: true },
      { name: 'Study', can_reset: true },
    ] )
    expect( profiles.every( ( { purpose } ) => purpose === 'summary' ) ).toBe( true )
    expect( profiles[ 0 ]?.current_version ).toMatchObject( {
      version: 1,
      source: 'seed',
      guidance: SEEDED_PROFILES[ 0 ]?.guidance,
    } )
  } )

  it( 'finds a profile by id', () => {
    expect( findProfile( userId, byName( 'Coding' ) ).name ).toBe( 'Coding' )
  } )

  it( 'throws NotFoundError for an unknown profile', () => {
    expect( () => findProfile( userId, crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )

  it( 'throws NotFoundError for a deleted profile', () => {
    deleteProfile( userId, byName( 'Coding' ) )

    expect( () => findProfile( userId, byName( 'Coding' ) ) ).toThrow( NotFoundError )
  } )
} )

describe( 'createProfile', () => {
  it( 'creates a profile with version 1 from an edit', () => {
    const profile = createProfile( userId, { name: 'Research', guidance: 'Find sources.' } )

    expect( profile ).toMatchObject( { name: 'Research', can_reset: false } )
    expect( profile.current_version ).toMatchObject( {
      version: 1,
      source: 'edit',
      guidance: 'Find sources.',
    } )
    expect( listProfiles( userId ).map( ( { name } ) => name ) ).toContain( 'Research' )
  } )

  it( 'rejects a name that is taken, ignoring case', () => {
    const create = (): unknown => createProfile( userId, { name: 'coding', guidance: 'x' } )

    expect( create ).toThrow( ConflictError )
    expect( create ).toThrow( 'A profile with that name already exists' )
    expect( listProfiles( userId ) ).toHaveLength( 4 )
  } )

  it( 'lets a deleted profile\'s name be used again', () => {
    deleteProfile( userId, byName( 'Coding' ) )

    expect( createProfile( userId, { name: 'Coding', guidance: 'new' } ).name ).toBe( 'Coding' )
  } )
} )

describe( 'renameProfile', () => {
  it( 'renames a profile', () => {
    expect( renameProfile( userId, byName( 'Coding' ), 'Code' ).name ).toBe( 'Code' )
  } )

  it( 'rejects a taken name', () => {
    expect( () => renameProfile( userId, byName( 'Coding' ), 'GENERAL' ) ).toThrow( ConflictError )
    expect( () => renameProfile( userId, byName( 'Coding' ), 'GENERAL' ) )
      .toThrow( 'A profile with that name already exists' )
  } )

  it( 'throws NotFoundError for an unknown or deleted profile', () => {
    const id = byName( 'Coding' )
    deleteProfile( userId, id )

    expect( () => renameProfile( userId, id, 'X' ) ).toThrow( NotFoundError )
    expect( () => renameProfile( userId, crypto.randomUUID(), 'X' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'deleteProfile', () => {
  it( 'soft deletes a profile and keeps its history readable', () => {
    const id = byName( 'Coding' )

    deleteProfile( userId, id )

    expect( listProfiles( userId ).map( ( { name } ) => name ) ).not.toContain( 'Coding' )
    expect( resolvePrompt( userId, id ).version.version ).toBe( 1 )
  } )

  it( 'refuses to delete the default profile', () => {
    expect( () => deleteProfile( userId, defaultId() ) ).toThrow( ConflictError )
  } )

  it( 'refuses to delete the last active profile', () => {
    const business = defaultId()
    deleteProfile( userId, byName( 'Coding' ) )
    deleteProfile( userId, byName( 'General' ) )
    createProfile( userId, { name: 'Other', guidance: 'x' } )
    setSetting( userId, 'default_profile_id', byName( 'Other' ) )
    deleteProfile( userId, business )

    expect( () => deleteProfile( userId, byName( 'Other' ) ) ).toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown profile', () => {
    expect( () => deleteProfile( userId, crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )

describe( 'saveVersion', () => {
  it( 'saves changed guidance as a new edit version', () => {
    const profile = saveVersion( userId, byName( 'Coding' ), 'New guidance' )

    expect( profile.current_version ).toMatchObject( {
      version: 2,
      source: 'edit',
      guidance: 'New guidance',
    } )
  } )

  it( 'does nothing when the guidance is unchanged, after trimming', () => {
    const id = byName( 'Coding' )
    const before = findProfile( userId, id )

    const profile = saveVersion( userId, id, `  ${ before.current_version.guidance }\n\n` )

    expect( profile ).toEqual( before )
    expect( listVersions( userId, id ) ).toHaveLength( 1 )
  } )

  it( 'throws NotFoundError for an unknown profile', () => {
    expect( () => saveVersion( userId, crypto.randomUUID(), 'x' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'restoreVersion', () => {
  it( 'inserts a copy of the old version as the newest', () => {
    const id = byName( 'Coding' )
    const first = findProfile( userId, id ).current_version
    saveVersion( userId, id, 'Second' )

    const profile = restoreVersion( userId, id, first.id )

    expect( profile.current_version ).toMatchObject( {
      version: 3,
      source: 'restore',
      guidance: first.guidance,
    } )
    expect( listVersions( userId, id ).map( ( { version } ) => version ) ).toEqual( [ 3, 2, 1 ] )
  } )

  it( 'throws NotFoundError for a version of another profile or an unknown one', () => {
    const other = findProfile( userId, byName( 'General' ) ).current_version

    expect( () => restoreVersion( userId, byName( 'Coding' ), other.id ) ).toThrow( NotFoundError )
    expect( () => restoreVersion( userId, byName( 'Coding' ), 999_999 ) ).toThrow( NotFoundError )
  } )

  it( 'throws NotFoundError for an unknown profile', () => {
    expect( () => restoreVersion( userId, crypto.randomUUID(), 1 ) ).toThrow( NotFoundError )
  } )
} )

describe( 'resetProfile', () => {
  it( 'inserts the shipped guidance as a reset version', () => {
    const id = byName( 'Coding' )
    saveVersion( userId, id, 'Changed' )

    const profile = resetProfile( userId, id )

    expect( profile.current_version ).toMatchObject( {
      version: 3,
      source: 'reset',
      guidance: SEEDED_PROFILES[ 1 ]?.guidance,
    } )
  } )

  it( 'restores the Study guidance after an edit', () => {
    const id = byName( 'Study' )
    saveVersion( userId, id, 'Changed' )

    expect( resetProfile( userId, id ).current_version ).toMatchObject( {
      version: 3,
      source: 'reset',
      guidance: STUDY_GUIDANCE,
    } )
  } )

  it( 'refuses a profile that did not ship', () => {
    const { id } = createProfile( userId, { name: 'Mine', guidance: 'x' } )

    expect( () => resetProfile( userId, id ) ).toThrow( ConflictError )
  } )

  it( 'throws NotFoundError for an unknown profile', () => {
    expect( () => resetProfile( userId, crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )

describe( 'listVersions', () => {
  it( 'lists versions newest first', () => {
    const id = byName( 'Coding' )
    saveVersion( userId, id, 'Two' )

    expect( listVersions( userId, id ).map( ( { version } ) => version ) ).toEqual( [ 2, 1 ] )
  } )

  it( 'throws NotFoundError for an unknown profile', () => {
    expect( () => listVersions( userId, crypto.randomUUID() ) ).toThrow( NotFoundError )
  } )
} )

describe( 'resolvePrompt', () => {
  beforeEach( () => {
    vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )
  } )

  afterEach( () => {
    vi.restoreAllMocks()
  } )

  it( 'resolves null to the default profile\'s current version', () => {
    const { profile, version } = resolvePrompt( userId, null )

    expect( profile.id ).toBe( defaultId() )
    expect( version.guidance ).toBe( SEEDED_PROFILES[ 0 ]?.guidance )
  } )

  it( 'resolves a profile to its current version', () => {
    const id = byName( 'Coding' )
    saveVersion( userId, id, 'Latest' )

    const { profile, version } = resolvePrompt( userId, id )

    expect( profile.id ).toBe( id )
    expect( version.guidance ).toBe( 'Latest' )
  } )

  it( 'still resolves a deleted profile', () => {
    const id = byName( 'Coding' )
    deleteProfile( userId, id )

    expect( resolvePrompt( userId, id ).profile.name ).toBe( 'Coding' )
  } )

  it( 'falls back to the default profile for a missing one, and logs', () => {
    const { profile } = resolvePrompt( userId, crypto.randomUUID() )

    expect( profile.id ).toBe( defaultId() )
    expect( logger.error ).toHaveBeenCalled()
  } )
} )

describe( 'assertActiveProfile', () => {
  it( 'accepts an active profile', () => {
    expect( () => assertActiveProfile( userId, byName( 'Coding' ) ) ).not.toThrow()
  } )

  it( 'rejects an unknown and a deleted profile with a ValidationError', () => {
    const id = byName( 'Coding' )
    deleteProfile( userId, id )

    expect( () => assertActiveProfile( userId, id ) ).toThrow( ValidationError )
    expect( () => assertActiveProfile( userId, crypto.randomUUID() ) ).toThrow( ValidationError )
  } )
} )

describe( 'resolveLinkerPrompt', () => {
  it( 'returns the linker profile and its current version', () => {
    const { profile, version } = resolveLinkerPrompt( userId )

    expect( profile.name ).toBe( 'Linker' )
    expect( version.guidance ).toBe( DEFAULT_LINKER_GUIDANCE )
    expect( version.id ).toBe( profile.current_version.id )
  } )

  it( 'follows a newer version of the linker prompt', () => {
    const { profile } = resolveLinkerPrompt( userId )

    saveVersion( userId, profile.id, 'Link fewer things.' )

    expect( resolveLinkerPrompt( userId ).version ).toMatchObject( {
      version: 2,
      guidance: 'Link fewer things.',
    } )
  } )
} )

describe( 'resolveMeletePrompt', () => {
  it( 'returns each Melete profile with its current version', () => {
    const questions = resolveMeletePrompt( userId, 'melete_questions' )
    const grading = resolveMeletePrompt( userId, 'melete_grading' )

    expect( questions.profile.purpose ).toBe( 'melete_questions' )
    expect( questions.version.guidance ).toBe( DEFAULT_MELETE_QUESTIONS_GUIDANCE )
    expect( questions.version.id ).toBe( questions.profile.current_version.id )
    expect( grading.profile.purpose ).toBe( 'melete_grading' )
    expect( grading.version.guidance ).toBe( DEFAULT_MELETE_GRADING_GUIDANCE )
  } )

  it( 'follows a newer version', () => {
    saveVersion( userId, resolveMeletePrompt( userId, 'melete_questions' ).profile.id, 'Ask less.' )

    expect( resolveMeletePrompt( userId, 'melete_questions' ).version ).toMatchObject( {
      version: 2,
      guidance: 'Ask less.',
    } )
  } )
} )

describe( 'the linker profile', () => {
  const linkerId = (): string => resolveLinkerPrompt( userId ).profile.id

  it( 'is left out of the profile list and does not take a summary profile\'s name', () => {
    expect( listProfiles( userId ).map( ( { name } ) => name ) ).not.toContain( 'Linker' )
    expect( createProfile( userId, { name: 'Linker', guidance: 'Mine.' } ).name ).toBe( 'Linker' )
    expect( resolveLinkerPrompt( userId ).profile.name ).toBe( 'Linker' )
  } )

  it( 'can reset, so the app can show a reset action', () => {
    expect( findProfile( userId, linkerId() ) ).toMatchObject( { name: 'Linker', can_reset: true } )
    expect( findProfile( userId, linkerId() ).purpose ).toBe( 'linker' )
  } )

  it( 'cannot be renamed or deleted', () => {
    const message = 'The linker prompt can\'t be renamed or deleted'

    expect( () => renameProfile( userId, linkerId(), 'Other' ) )
      .toThrow( new ConflictError( message ) )
    expect( () => deleteProfile( userId, linkerId() ) ).toThrow( new ConflictError( message ) )
    expect( findProfile( userId, linkerId() ).name ).toBe( 'Linker' )
  } )

  it( 'keeps its history: save, list, restore', () => {
    saveVersion( userId, linkerId(), 'Link only people.' )
    const versions = listVersions( userId, linkerId() )

    expect( versions.map( ( { version, source } ) => ( { version, source } ) ) )
      .toEqual( [ { version: 2, source: 'edit' }, { version: 1, source: 'seed' } ] )

    const restored = restoreVersion( userId, linkerId(), versions[ 1 ]?.id ?? 0 )

    expect( restored.current_version )
      .toMatchObject( { version: 3, source: 'restore', guidance: DEFAULT_LINKER_GUIDANCE } )
  } )

  it( 'resets to the default linker guidance', () => {
    saveVersion( userId, linkerId(), 'Link only people.' )

    expect( resetProfile( userId, linkerId() ).current_version ).toMatchObject( {
      version: 3,
      source: 'reset',
      guidance: DEFAULT_LINKER_GUIDANCE,
    } )
  } )

  it( 'is refused where a summary profile is chosen', () => {
    expect( () => assertActiveProfile( userId, linkerId() ) ).toThrow( ValidationError )
  } )

  it( 'is never used for a summary: resolvePrompt falls back to the default profile', () => {
    vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )

    expect( resolvePrompt( userId, linkerId() ).profile.id ).toBe( defaultId() )
  } )
} )

describe( 'resolveMeletePrompt for the concept layer', () => {
  it.each( [
    [ 'melete_syllabus', DEFAULT_MELETE_SYLLABUS_GUIDANCE ],
    [ 'melete_map', DEFAULT_MELETE_MAP_GUIDANCE ],
    [ 'melete_suggest', DEFAULT_MELETE_SUGGEST_GUIDANCE ],
  ] as const )( 'returns the %s profile with its default guidance', ( purpose, guidance ) => {
    const { profile, version } = resolveMeletePrompt( userId, purpose )

    expect( profile.purpose ).toBe( purpose )
    expect( profile.can_reset ).toBe( true )
    expect( version.guidance ).toBe( guidance )
    expect( version.id ).toBe( profile.current_version.id )
  } )

  it.each( [ 'melete_syllabus', 'melete_map', 'melete_suggest' ] as const )(
    'keeps the %s profile fixed and resettable',
    ( purpose ) => {
      const id = listProfiles( userId, purpose )[ 0 ]?.id ?? ''

      expect( () => renameProfile( userId, id, 'Other' ) ).toThrow( ConflictError )
      expect( () => deleteProfile( userId, id ) ).toThrow( ConflictError )

      saveVersion( userId, id, 'Be brief.' )

      expect( resetProfile( userId, id ).current_version ).toMatchObject( { source: 'reset' } )
      expect( () => assertActiveProfile( userId, id ) ).toThrow( ValidationError )
    },
  )
} )

describe( 'listProfiles by purpose', () => {
  it( 'lists summary profiles unless told otherwise', () => {
    expect( listProfiles( userId ).every( ( { purpose } ) => purpose === 'summary' ) ).toBe( true )
    expect( listProfiles( userId, 'summary' ) ).toEqual( listProfiles( userId ) )
  } )

  it( 'lists one other purpose', () => {
    expect( listProfiles( userId, 'melete_grading' ).map( ( { name } ) => name ) )
      .toEqual( [ 'Melete grading' ] )
    expect( listProfiles( userId, 'linker' ).map( ( { name } ) => name ) ).toEqual( [ 'Linker' ] )
  } )

  it( 'lists every purpose, summary first, with the purpose on each', () => {
    expect( listProfiles( userId, 'all' ).map( ( { name, purpose } ) => [ name, purpose ] ) )
      .toEqual( [
        [ 'Business ideas', 'summary' ],
        [ 'Coding', 'summary' ],
        [ 'General', 'summary' ],
        [ 'Study', 'summary' ],
        [ 'Linker', 'linker' ],
        [ 'Melete questions', 'melete_questions' ],
        [ 'Melete grading', 'melete_grading' ],
        [ 'Melete syllabus', 'melete_syllabus' ],
        [ 'Melete mapping', 'melete_map' ],
        [ 'Melete suggestions', 'melete_suggest' ],
      ] )
  } )
} )

describe( 'the Melete profiles', () => {
  const questionsId = (): string => listProfiles( userId, 'melete_questions' )[ 0 ]?.id ?? ''
  const gradingId = (): string => listProfiles( userId, 'melete_grading' )[ 0 ]?.id ?? ''
  const message = 'The Melete prompts can\'t be renamed or deleted'

  it( 'cannot be renamed or deleted', () => {
    expect( () => renameProfile( userId, questionsId(), 'Other' ) )
      .toThrow( new ConflictError( message ) )
    expect( () => deleteProfile( userId, gradingId() ) ).toThrow( new ConflictError( message ) )
    expect( findProfile( userId, gradingId() ).name ).toBe( 'Melete grading' )
  } )

  it( 'save, restore and reset like any profile', () => {
    const id = questionsId()
    const first = findProfile( userId, id ).current_version

    saveVersion( userId, id, 'Ask about trade-offs.' )
    restoreVersion( userId, id, first.id )

    expect( findProfile( userId, id ).current_version )
      .toMatchObject( { source: 'restore', guidance: DEFAULT_MELETE_QUESTIONS_GUIDANCE } )

    saveVersion( userId, id, 'Ask about trade-offs.' )

    expect( resetProfile( userId, id ).current_version )
      .toMatchObject( { source: 'reset', guidance: DEFAULT_MELETE_QUESTIONS_GUIDANCE } )
    expect( resetProfile( userId, gradingId() ).current_version )
      .toMatchObject( { source: 'reset', guidance: DEFAULT_MELETE_GRADING_GUIDANCE } )
    expect( listVersions( userId, id ) ).toHaveLength( 5 )
  } )

  it( 'are not summary profiles', () => {
    expect( () => assertActiveProfile( userId, questionsId() ) )
      .toThrow( new ValidationError( 'Unknown prompt profile' ) )
  } )

  it( 'are not used as a summary prompt, which falls back to the default', () => {
    const error = vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )

    expect( resolvePrompt( userId, gradingId() ).profile.id ).toBe( defaultId() )
    expect( error ).toHaveBeenCalled()
  } )
} )

const MELETE_PURPOSES = [
  'melete_questions',
  'melete_grading',
  'melete_syllabus',
  'melete_map',
  'melete_suggest',
]

describe( 'profiles by module', () => {
  const purposes = ( id: string ): string[] => {
    return [ ...new Set( listProfiles( id, 'all' ).map( ( { purpose } ) => purpose ) ) ]
  }

  it( 'lists the purposes of the user\'s modules only', () => {
    const transcriber = createTestUser( { modules: [ 'transcriber' ] } ).id
    const melete = createTestUser( { modules: [ 'melete' ] } ).id
    const nothing = createTestUser( { modules: [] } ).id

    expect( purposes( transcriber ) ).toEqual( [ 'summary', 'linker' ] )
    expect( purposes( melete ) ).toEqual( MELETE_PURPOSES )
    expect( purposes( nothing ) ).toEqual( [] )
    expect( purposes( userId ) ).toEqual( [ 'summary', 'linker', ...MELETE_PURPOSES ] )
  } )

  it( 'lists nothing for a purpose the user\'s modules do not cover', () => {
    const melete = createTestUser( { modules: [ 'melete' ] } ).id

    expect( listProfiles( melete, 'summary' ) ).toEqual( [] )
    expect( listProfiles( melete, 'linker' ) ).toEqual( [] )
  } )

  it( 'answers not found for a profile of a module the user does not have', () => {
    const melete = createTestUser( { modules: [ 'melete' ] } ).id
    const summary = listProfiles( melete, 'all' ).length
    const transcriber = createTestUser( { modules: [ 'transcriber' ] } ).id
    const mine = listProfiles( transcriber, 'summary' )[ 0 ]?.id ?? ''

    expect( summary ).toBe( 5 )
    expect( () => findProfile( melete, mine ) ).toThrow( NotFoundError )
    expect( () => findProfile( transcriber, mine ) ).not.toThrow()
  } )

  it( 'refuses to create a summary profile without the Transcriber module', () => {
    const melete = createTestUser( { modules: [ 'melete' ] } ).id

    expect( () => createProfile( melete, { name: 'Mine', guidance: 'x' } ) )
      .toThrow( NotFoundError )
    expect( purposes( melete ) ).toEqual( MELETE_PURPOSES )
  } )

  it( 'still resolves a prompt the user\'s own module needs', () => {
    const melete = createTestUser( { modules: [ 'melete' ] } ).id

    expect( resolveMeletePrompt( melete, 'melete_questions' ).profile.purpose )
      .toBe( 'melete_questions' )
  } )
} )
