// Node
import {
  mkdir,
  mkdtemp,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Shared
import { GetSettingsResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Test support
import { createTestUser, signedInRequest as request } from '../test-support/auth.js'
import { config } from '../config.js'
// Clients
import { AgentError, checkHealth, fetchInstructions } from '../clients/agent.client.js'
import { listSummaryModels } from '../clients/anthropicModels.client.js'
// Melete
import {
  LOCKED_INSTRUCTIONS_MELETE_GRADING,
  LOCKED_INSTRUCTIONS_MELETE_MAP,
  LOCKED_INSTRUCTIONS_MELETE_SUGGEST,
  LOCKED_INSTRUCTIONS_MELETE_SYLLABUS,
  LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
} from '../melete/prompts.js'
// Repositories
import { findProfileBySeedKey } from '../repositories/promptProfiles.repository.js'
// Services
import { clearModelCache } from '../services/models.service.js'
import { listProfiles, resolveLinkerPrompt } from '../services/prompts.service.js'
import { LOCKED_INSTRUCTIONS_ARTICLE, LOCKED_INSTRUCTIONS_VIDEO } from '../summarizer/prompts.js'
// Test support
import { DEFAULT_TEST_VAULT, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../clients/anthropicModels.client.js' )
vi.mock( '../clients/agent.client.js', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( '../clients/agent.client.js' ) >()

  return { ...original, checkHealth: vi.fn(), fetchInstructions: vi.fn() }
} )

const listMock = vi.mocked( listSummaryModels )
const healthMock = vi.mocked( checkHealth )
const instructionsMock = vi.mocked( fetchInstructions )

const profileId = ( name: string ): string => {
  return listProfiles( userId ).find( ( profile ) => profile.name === name )?.id ?? ''
}

beforeEach( () => {
  vi.resetAllMocks()
  clearModelCache()
  listMock.mockResolvedValue( [
    { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
    { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' },
  ] )
} )

describe( 'GET /api/settings', () => {
  it( 'returns the defaults and the locked instructions', async () => {
    const response = await request( app ).get( '/api/settings' )

    expect( response.status ).toBe( 200 )
    expect( GetSettingsResponse.parse( response.body ) ).toEqual( {
      settings: {
        default_model: 'claude-sonnet-5-5',
        extraction_model: 'claude-sonnet-5-5',
        default_profile_id: profileId( 'Business ideas' ),
        feed_check_interval_minutes: 60,
        linking_enabled: true,
        linking_model: 'claude-sonnet-5-5',
        linker_profile_id: resolveLinkerPrompt( userId ).profile.id,
        melete_learning_root: null,
        melete_question_model: 'claude-sonnet-5-5',
        melete_grading_model: 'claude-sonnet-5-5',
        melete_review_mode: 'typed',
        melete_syllabus_model: 'claude-sonnet-5-5',
        melete_map_model: 'claude-sonnet-5-5',
        melete_suggest_model: 'claude-sonnet-5-5',
        melete_mastery_days: 21,
        melete_question_profile_id: findProfileBySeedKey( userId, 'melete_questions' )?.id,
        melete_grading_profile_id: findProfileBySeedKey( userId, 'melete_grading' )?.id,
      },
      locked_instructions: {
        video: LOCKED_INSTRUCTIONS_VIDEO,
        article: LOCKED_INSTRUCTIONS_ARTICLE,
        melete_questions: LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
        melete_grading: LOCKED_INSTRUCTIONS_MELETE_GRADING,
        melete_syllabus: LOCKED_INSTRUCTIONS_MELETE_SYLLABUS,
        melete_map: LOCKED_INSTRUCTIONS_MELETE_MAP,
        melete_suggest: LOCKED_INSTRUCTIONS_MELETE_SUGGEST,
      },
      linker_locked_instructions: null,
      agent_status: 'not_configured',
    } )
  } )
} )

describe( 'GET /api/settings with an agent service', () => {
  const agent = { url: 'http://agent:8100', secret: 'x'.repeat( 32 ), timeoutMs: 1000 }

  beforeEach( () => {
    config.agent = agent
  } )

  afterEach( () => {
    config.agent = null
  } )

  it( 'reports the agent as ok and carries its locked instructions', async () => {
    healthMock.mockResolvedValue( 'ok' )
    instructionsMock.mockResolvedValue( 'You link notes.' )

    const body = GetSettingsResponse.parse( ( await request( app ).get( '/api/settings' ) ).body )

    expect( body ).toMatchObject( {
      agent_status: 'ok',
      linker_locked_instructions: 'You link notes.',
    } )
  } )

  it( 'still answers 200 when the agent is down', async () => {
    healthMock.mockResolvedValue( 'unavailable' )

    const response = await request( app ).get( '/api/settings' )

    expect( response.status ).toBe( 200 )
    expect( GetSettingsResponse.parse( response.body ) ).toMatchObject( {
      agent_status: 'unavailable',
      linker_locked_instructions: null,
    } )
  } )

  it( 'still answers 200 when the instructions cannot be fetched', async () => {
    healthMock.mockResolvedValue( 'ok' )
    instructionsMock.mockRejectedValue( new AgentError( 'Agent service unreachable' ) )

    const response = await request( app ).get( '/api/settings' )

    expect( response.status ).toBe( 200 )
    expect( GetSettingsResponse.parse( response.body ).linker_locked_instructions ).toBeNull()
  } )

  it( 'picks the newest Haiku as the linking model when none is saved', async () => {
    listMock.mockResolvedValue( [
      { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
      { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' },
    ] )
    healthMock.mockResolvedValue( 'ok' )
    instructionsMock.mockResolvedValue( 'x' )

    const { settings } = GetSettingsResponse.parse(
      ( await request( app ).get( '/api/settings' ) ).body,
    )

    expect( settings.linking_model ).toBe( 'claude-haiku-5-5' )
  } )
} )

describe( 'PATCH /api/settings for Melete', () => {
  let vaultsDir: string
  let vaultDir: string
  let originalVaultsPath: string

  beforeEach( async () => {
    vaultsDir = await mkdtemp( join( tmpdir(), 'atlas-settings-routes-' ) )
    vaultDir = join( vaultsDir, DEFAULT_TEST_VAULT )
    await mkdir( vaultDir )
    originalVaultsPath = config.vaultsPath
    config.vaultsPath = vaultsDir
  } )

  afterEach( async () => {
    config.vaultsPath = originalVaultsPath
    await rm( vaultsDir, { recursive: true, force: true } )
  } )

  it( 'saves the learning root, the models and the review mode', async () => {
    await mkdir( join( vaultDir, 'Learning' ) )

    const response = await request( app ).patch( '/api/settings' ).send( {
      melete_learning_root: 'Learning',
      melete_question_model: 'claude-opus-5-5',
      melete_grading_model: 'claude-sonnet-5-5',
      melete_review_mode: 'quick',
      melete_syllabus_model: 'claude-opus-5-5',
      melete_map_model: 'claude-sonnet-5-5',
      melete_suggest_model: 'claude-opus-5-5',
    } )

    expect( response.status ).toBe( 200 )
    expect( GetSettingsResponse.parse( response.body ).settings ).toMatchObject( {
      melete_learning_root: 'Learning',
      melete_question_model: 'claude-opus-5-5',
      melete_grading_model: 'claude-sonnet-5-5',
      melete_review_mode: 'quick',
      melete_syllabus_model: 'claude-opus-5-5',
      melete_map_model: 'claude-sonnet-5-5',
      melete_suggest_model: 'claude-opus-5-5',
    } )
  } )

  it( 'creates a learning root that is not in the vault yet', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { melete_learning_root: 'Learning' } )

    expect( response.status ).toBe( 200 )
    expect( GetSettingsResponse.parse( response.body ).settings.melete_learning_root )
      .toBe( 'Learning' )
    expect( ( await stat( join( vaultDir, 'Learning' ) ) ).isDirectory() ).toBe( true )
  } )

  it( 'returns 400 for a learning root that a file is in the way of', async () => {
    await writeFile( join( vaultDir, 'Learning' ), 'x' )

    const response = await request( app )
      .patch( '/api/settings' )
      .send( { melete_learning_root: 'Learning' } )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( { error: 'A file is in the way of folder "Learning"' } )
  } )

  it( 'returns 400 for a learning root outside the vault', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { melete_learning_root: '../Learning' } )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 400 for an unknown Melete model', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { melete_question_model: 'claude-nope' } )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( { error: 'Unknown model: claude-nope' } )
  } )

  it( 'does not accept the Melete profile ids', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { melete_question_profile_id: crypto.randomUUID() } )

    expect( response.status ).toBe( 400 )
  } )
} )

describe( 'PATCH /api/settings', () => {
  it( 'saves the linking switch and the linking model', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { linking_enabled: false, linking_model: 'claude-opus-5-5' } )

    expect( response.status ).toBe( 200 )
    expect( GetSettingsResponse.parse( response.body ) ).toMatchObject( {
      settings: { linking_enabled: false, linking_model: 'claude-opus-5-5' },
      agent_status: 'not_configured',
    } )
  } )

  it( 'returns 400 for an unknown linking model', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { linking_model: 'claude-nope' } )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( { error: 'Unknown model: claude-nope' } )
  } )

  it( 'does not accept the linker profile id', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { linker_profile_id: crypto.randomUUID() } )

    expect( response.status ).toBe( 400 )
  } )

  it( 'saves the model and returns the new settings', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { default_model: 'claude-opus-5-5' } )

    expect( response.status ).toBe( 200 )
    expect( GetSettingsResponse.parse( response.body ).settings.default_model )
      .toBe( 'claude-opus-5-5' )
    expect( GetSettingsResponse.parse(
      ( await request( app ).get( '/api/settings' ) ).body,
    ).settings.default_model ).toBe( 'claude-opus-5-5' )
  } )

  it( 'saves the default profile', async () => {
    const coding = profileId( 'Coding' )

    const response = await request( app )
      .patch( '/api/settings' )
      .send( { default_profile_id: coding } )

    expect( response.status ).toBe( 200 )
    expect( GetSettingsResponse.parse( response.body ).settings.default_profile_id ).toBe( coding )
  } )

  it( 'saves the feed check interval', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { feed_check_interval_minutes: 180 } )

    expect( response.status ).toBe( 200 )
    expect( GetSettingsResponse.parse( response.body ).settings.feed_check_interval_minutes )
      .toBe( 180 )
    expect( GetSettingsResponse.parse(
      ( await request( app ).get( '/api/settings' ) ).body,
    ).settings.feed_check_interval_minutes ).toBe( 180 )
  } )

  it( 'saves the interval together with another setting', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { default_model: 'claude-opus-5-5', feed_check_interval_minutes: 15 } )

    expect( GetSettingsResponse.parse( response.body ).settings ).toMatchObject( {
      default_model: 'claude-opus-5-5',
      feed_check_interval_minutes: 15,
    } )
  } )

  it( 'returns 400 for an interval that is not on the list', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { feed_check_interval_minutes: 10 } )

    expect( response.status ).toBe( 400 )
  } )

  it.each( [
    [ 'an empty body', {} ],
    [ 'an empty model', { default_model: '' } ],
    [ 'a profile id that is not a uuid', { default_profile_id: 'x' } ],
  ] )( 'returns 400 for %s', async ( _name, body ) => {
    const response = await request( app ).patch( '/api/settings' ).send( body )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 400 for an unknown model', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { default_model: 'claude-nope' } )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( { error: 'Unknown model: claude-nope' } )
  } )

  it( 'returns 400 for an unknown profile', async () => {
    const response = await request( app )
      .patch( '/api/settings' )
      .send( { default_profile_id: crypto.randomUUID() } )

    expect( response.status ).toBe( 400 )
  } )
} )

describe( 'settings are per user', () => {
  it( 'keeps each user\'s default model apart', async () => {
    listMock.mockResolvedValue( [
      { id: 'claude-opus-5-5', display_name: 'Opus' },
      { id: 'claude-sonnet-5-5', display_name: 'Sonnet' },
    ] )

    const member = createTestUser()

    await request( app ).patch( '/api/settings' ).send( { default_model: 'claude-opus-5-5' } )
    await request( app, member ).patch( '/api/settings' )
      .send( { default_model: 'claude-sonnet-5-5' } )

    const read = async ( user?: ReturnType< typeof createTestUser > ): Promise< string > => {
      return GetSettingsResponse.parse(
        ( await request( app, user ).get( '/api/settings' ) ).body,
      ).settings.default_model
    }

    expect( await read() ).toBe( 'claude-opus-5-5' )
    expect( await read( member ) ).toBe( 'claude-sonnet-5-5' )
  } )

  it( 'gives each user their own default profile', async () => {
    const member = createTestUser()
    const read = async ( user?: ReturnType< typeof createTestUser > ): Promise< string > => {
      return GetSettingsResponse.parse(
        ( await request( app, user ).get( '/api/settings' ) ).body,
      ).settings.default_profile_id
    }

    expect( await read( member ) ).not.toBe( await read() )
  } )

  it( 'refuses another user\'s profile as the default', async () => {
    const member = createTestUser()
    const coding = profileId( 'Coding' )

    const response = await request( app, member )
      .patch( '/api/settings' )
      .send( { default_profile_id: coding } )

    expect( response.status ).toBe( 400 )
  } )

  it( 'refuses a member the feed interval and saves nothing', async () => {
    listMock.mockResolvedValue( [ { id: 'claude-opus-5-5', display_name: 'Opus' } ] )

    const member = createTestUser()
    const response = await request( app, member )
      .patch( '/api/settings' )
      .send( { default_model: 'claude-opus-5-5', feed_check_interval_minutes: 180 } )
    const after = GetSettingsResponse.parse(
      ( await request( app, member ).get( '/api/settings' ) ).body,
    ).settings

    expect( response.status ).toBe( 404 )
    expect( after.feed_check_interval_minutes ).toBe( 60 )
    expect( after.default_model ).not.toBe( 'claude-opus-5-5' )
  } )

  it( 'shares the interval the admin set with every user', async () => {
    await request( app ).patch( '/api/settings' ).send( { feed_check_interval_minutes: 180 } )

    const member = createTestUser()
    const response = await request( app, member ).get( '/api/settings' )

    expect( GetSettingsResponse.parse( response.body ).settings.feed_check_interval_minutes )
      .toBe( 180 )
  } )
} )
