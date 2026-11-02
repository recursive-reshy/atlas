// Node
import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  stat,
  symlink,
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
// Errors
import { NotFoundError, ValidationError } from '../errors.js'
// Repositories
import { findProfileBySeedKey } from '../repositories/promptProfiles.repository.js'
import { setAppSetting } from '../repositories/appSettings.repository.js'
import { getSetting, setSetting } from '../repositories/settings.repository.js'
// Melete
import {
  LOCKED_INSTRUCTIONS_MELETE_GRADING,
  LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
} from '../melete/prompts.js'
import { isScanFresh, markScanned, resetScanClock } from '../melete/scanClock.js'
// Summarizer
import { LOCKED_INSTRUCTIONS_ARTICLE, LOCKED_INSTRUCTIONS_VIDEO } from '../summarizer/prompts.js'
// Clients
import { AgentError, checkHealth, fetchInstructions } from '../clients/agent.client.js'
// Config
import { config } from '../config.js'
// Services
import { assertKnownModel, listModels } from './models.service.js'
import { deleteProfile, listProfiles, resolveLinkerPrompt } from './prompts.service.js'
import {
  getDefaultModel,
  getFeedCheckInterval,
  getLearningRoot,
  getLockedInstructions,
  getSettings,
  getSettingsResponse,
  resolveLinkingModel,
  resolveMeleteGradingModel,
  resolveMeleteQuestionModel,
  updateSettings,
} from './settings.service.js'
// Test support
import { DEFAULT_TEST_VAULT, createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( './models.service.js' )
vi.mock( '../clients/agent.client.js', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( '../clients/agent.client.js' ) >()

  return { ...original, checkHealth: vi.fn(), fetchInstructions: vi.fn() }
} )

const profileIdOf = ( seedKey: string ): string => findProfileBySeedKey( userId, seedKey )?.id ?? ''

const assertMock = vi.mocked( assertKnownModel )
const listModelsMock = vi.mocked( listModels )
const healthMock = vi.mocked( checkHealth )
const instructionsMock = vi.mocked( fetchInstructions )

const modelList = ( ...ids: string[] ): Awaited< ReturnType< typeof listModels > > => ( {
  models: ids.map( ( id ) => ( { id, display_name: id } ) ),
  source: 'api',
} )

const byName = ( name: string ): string => {
  return listProfiles( userId ).find( ( profile ) => profile.name === name )?.id ?? ''
}

beforeEach( () => {
  vi.resetAllMocks()
  assertMock.mockResolvedValue( undefined )
  listModelsMock.mockResolvedValue( modelList( 'claude-sonnet-5-5', 'claude-opus-5-5' ) )
} )

describe( 'getSettings', () => {
  it( 'defaults to the shipped model and the Business ideas profile', async () => {
    expect( await getSettings( userId ) ).toEqual( {
      default_model: 'claude-sonnet-5-5',
      extraction_model: 'claude-sonnet-5-5',
      default_profile_id: byName( 'Business ideas' ),
      feed_check_interval_minutes: 60,
      linking_enabled: true,
      linking_model: 'claude-sonnet-5-5',
      linker_profile_id: resolveLinkerPrompt( userId ).profile.id,
      melete_learning_root: null,
      melete_question_model: 'claude-sonnet-5-5',
      melete_grading_model: 'claude-sonnet-5-5',
      melete_review_mode: 'typed',
      melete_question_profile_id: profileIdOf( 'melete_questions' ),
      melete_grading_profile_id: profileIdOf( 'melete_grading' ),
    } )
  } )

  it( 'reads the Melete settings from the stored values when there are any', async () => {
    setSetting( userId, 'melete_learning_root', 'Learning' )
    setSetting( userId, 'melete_question_model', 'claude-haiku-5-5' )
    setSetting( userId, 'melete_grading_model', 'claude-opus-5-5' )
    setSetting( userId, 'melete_review_mode', 'quick' )

    expect( await getSettings( userId ) ).toMatchObject( {
      melete_learning_root: 'Learning',
      melete_question_model: 'claude-haiku-5-5',
      melete_grading_model: 'claude-opus-5-5',
      melete_review_mode: 'quick',
    } )
  } )

  it( 'reads the extraction model from the stored setting when there is one', async () => {
    setSetting( userId, 'extraction_model', 'claude-haiku-5-5' )

    expect( ( await getSettings( userId ) ).extraction_model ).toBe( 'claude-haiku-5-5' )
  } )

  it( 'reads the feed check interval from the stored setting when there is one', async () => {
    setAppSetting( 'feed_check_interval_minutes', 180 )

    expect( ( await getSettings( userId ) ).feed_check_interval_minutes ).toBe( 180 )
  } )

  it( 'turns linking on by default and reads the stored switch', async () => {
    expect( ( await getSettings( userId ) ).linking_enabled ).toBe( true )

    setSetting( userId, 'linking_enabled', false )

    expect( ( await getSettings( userId ) ).linking_enabled ).toBe( false )
  } )

  it( 'reads the linking model from the stored setting without asking for models', async () => {
    setSetting( userId, 'linking_model', 'claude-opus-5-5' )
    setSetting( userId, 'melete_question_model', 'claude-opus-5-5' )
    setSetting( userId, 'melete_grading_model', 'claude-opus-5-5' )

    expect( ( await getSettings( userId ) ).linking_model ).toBe( 'claude-opus-5-5' )
    expect( listModelsMock ).not.toHaveBeenCalled()
  } )

  it( 'gives the id of the seeded linker profile, not a summary profile', async () => {
    const { linker_profile_id, default_profile_id } = await getSettings( userId )

    expect( linker_profile_id ).toBe( resolveLinkerPrompt( userId ).profile.id )
    expect( linker_profile_id ).not.toBe( default_profile_id )
  } )
} )

describe( 'resolveLinkingModel', () => {
  it( 'defaults to the first Haiku the model list gives', async () => {
    listModelsMock.mockResolvedValue( modelList(
      'claude-opus-5-5',
      'claude-haiku-5-5',
      'claude-haiku-4-5',
    ) )

    expect( await resolveLinkingModel( userId ) ).toBe( 'claude-haiku-5-5' )
  } )

  it( 'falls back to the shipped default when the list has no Haiku', async () => {
    expect( await resolveLinkingModel( userId ) ).toBe( 'claude-sonnet-5-5' )
  } )

  it( 'falls back to the shipped default when the models cannot be listed', async () => {
    listModelsMock.mockRejectedValue( new Error( 'offline' ) )

    expect( await resolveLinkingModel( userId ) ).toBe( 'claude-sonnet-5-5' )
  } )

  it( 'prefers the stored model over any Haiku', async () => {
    listModelsMock.mockResolvedValue( modelList( 'claude-haiku-5-5' ) )
    setSetting( userId, 'linking_model', 'claude-opus-5-5' )

    expect( await resolveLinkingModel( userId ) ).toBe( 'claude-opus-5-5' )
  } )

  it( 'shows up in the settings when nothing is stored', async () => {
    listModelsMock.mockResolvedValue( modelList( 'claude-haiku-5-5', 'claude-sonnet-5-5' ) )

    expect( ( await getSettings( userId ) ).linking_model ).toBe( 'claude-haiku-5-5' )
  } )
} )

describe( 'the Melete models', () => {
  it( 'default to the first Haiku the model list gives', async () => {
    listModelsMock.mockResolvedValue( modelList( 'claude-opus-5-5', 'claude-haiku-5-5' ) )

    expect( await getSettings( userId ) ).toMatchObject( {
      melete_question_model: 'claude-haiku-5-5',
      melete_grading_model: 'claude-haiku-5-5',
    } )
    expect( await resolveMeleteQuestionModel( userId ) ).toBe( 'claude-haiku-5-5' )
    expect( await resolveMeleteGradingModel( userId ) ).toBe( 'claude-haiku-5-5' )
  } )

  it( 'prefer the stored model, each on its own', async () => {
    listModelsMock.mockResolvedValue( modelList( 'claude-haiku-5-5' ) )
    setSetting( userId, 'melete_grading_model', 'claude-opus-5-5' )

    expect( await resolveMeleteQuestionModel( userId ) ).toBe( 'claude-haiku-5-5' )
    expect( await resolveMeleteGradingModel( userId ) ).toBe( 'claude-opus-5-5' )
  } )

  it( 'fall back to the shipped default when the models cannot be listed', async () => {
    listModelsMock.mockRejectedValue( new Error( 'offline' ) )

    expect( await resolveMeleteQuestionModel( userId ) ).toBe( 'claude-sonnet-5-5' )
    expect( await resolveMeleteGradingModel( userId ) ).toBe( 'claude-sonnet-5-5' )
  } )
} )

describe( 'updateSettings for Melete', () => {
  let vaultsDir: string
  let vaultDir: string
  let originalVaultsPath: string

  beforeEach( async () => {
    vaultsDir = await mkdtemp( join( tmpdir(), 'atlas-settings-' ) )
    vaultDir = join( vaultsDir, DEFAULT_TEST_VAULT )
    await mkdir( vaultDir )
    originalVaultsPath = config.vaultsPath
    config.vaultsPath = vaultsDir
    resetScanClock()
  } )

  afterEach( async () => {
    config.vaultsPath = originalVaultsPath
    await rm( vaultsDir, { recursive: true, force: true } )
  } )

  it( 'saves a learning root that exists in the vault and forgets the last scan', async () => {
    await mkdir( join( vaultDir, 'Notes/Learning' ), { recursive: true } )
    markScanned( userId, new Date() )

    const settings = await updateSettings(
      userId,
      true,
      { melete_learning_root: 'Notes/Learning' },
    )

    expect( settings.melete_learning_root ).toBe( 'Notes/Learning' )
    expect( getSetting( userId, 'melete_learning_root' ) ).toBe( 'Notes/Learning' )
    expect( isScanFresh( userId, new Date() ) ).toBe( false )
  } )

  it( 'creates a learning root that is not in the vault yet', async () => {
    const settings = await updateSettings(
      userId,
      true,
      { melete_learning_root: 'Notes/Learning' },
    )

    expect( settings.melete_learning_root ).toBe( 'Notes/Learning' )
    expect( getSetting( userId, 'melete_learning_root' ) ).toBe( 'Notes/Learning' )
    expect( ( await stat( join( vaultDir, 'Notes/Learning' ) ) ).isDirectory() ).toBe( true )
  } )

  it( 'refuses a folder name that a file already holds', async () => {
    await writeFile( join( vaultDir, 'Learning' ), 'x' )

    await expect( updateSettings( userId, true, { melete_learning_root: 'Learning' } ) )
      .rejects.toThrow( new ValidationError( 'A file is in the way of folder "Learning"' ) )

    expect( getSetting( userId, 'melete_learning_root' ) ).toBeUndefined()
  } )

  it( 'refuses a path that leaves the vault, and creates nothing', async () => {
    await expect( updateSettings( userId, true, { melete_learning_root: '../Elsewhere' } ) )
      .rejects.toThrow( ValidationError )

    expect( await readdir( vaultDir ) ).toEqual( [] )
    expect( getSetting( userId, 'melete_learning_root' ) ).toBeUndefined()
  } )

  it( 'refuses a folder that leads out of the vault', async () => {
    const outside = await mkdtemp( join( tmpdir(), 'atlas-outside-' ) )

    try {
      await symlink( outside, join( vaultDir, 'Learning' ) )

      await expect( updateSettings( userId, true, { melete_learning_root: 'Learning' } ) )
        .rejects.toThrow( ValidationError )
    } finally {
      await rm( outside, { recursive: true, force: true } )
    }
  } )

  it( 'clears the learning root with null', async () => {
    await mkdir( join( vaultDir, 'Learning' ) )
    await updateSettings( userId, true, { melete_learning_root: 'Learning' } )

    const settings = await updateSettings( userId, true, { melete_learning_root: null } )

    expect( settings.melete_learning_root ).toBeNull()
    expect( getLearningRoot( userId ) ).toBeNull()
  } )

  it( 'saves known models and the review mode', async () => {
    const settings = await updateSettings( userId, true, {
      melete_question_model: 'claude-opus-5-5',
      melete_grading_model: 'claude-sonnet-5-5',
      melete_review_mode: 'quick',
    } )

    expect( assertMock ).toHaveBeenCalledWith( userId, 'claude-opus-5-5' )
    expect( assertMock ).toHaveBeenCalledWith( userId, 'claude-sonnet-5-5' )
    expect( settings ).toMatchObject( {
      melete_question_model: 'claude-opus-5-5',
      melete_grading_model: 'claude-sonnet-5-5',
      melete_review_mode: 'quick',
    } )
    expect( getSetting( userId, 'melete_review_mode' ) ).toBe( 'quick' )
  } )

  it( 'rejects an unknown model and saves nothing, not even the other keys', async () => {
    assertMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )
    await mkdir( join( vaultDir, 'Learning' ) )

    await expect( updateSettings( userId, true, {
      melete_grading_model: 'nope',
      melete_review_mode: 'quick',
      melete_learning_root: 'Learning',
    } ) ).rejects.toThrow( 'Unknown model: nope' )

    expect( getSetting( userId, 'melete_grading_model' ) ).toBeUndefined()
    expect( getSetting( userId, 'melete_review_mode' ) ).toBeUndefined()
    expect( getSetting( userId, 'melete_learning_root' ) ).toBeUndefined()
  } )

  it( 'saves nothing when the learning root is refused', async () => {
    await expect( updateSettings( userId, true, {
      melete_review_mode: 'quick',
      melete_learning_root: '../Nowhere',
    } ) ).rejects.toThrow( ValidationError )

    expect( getSetting( userId, 'melete_review_mode' ) ).toBeUndefined()
  } )
} )

describe( 'getDefaultModel and getFeedCheckInterval', () => {
  it( 'read the stored values without asking for models', () => {
    expect( getDefaultModel( userId ) ).toBe( 'claude-sonnet-5-5' )
    expect( getFeedCheckInterval() ).toBe( 60 )

    setSetting( userId, 'default_model', 'claude-opus-5-5' )
    setAppSetting( 'feed_check_interval_minutes', 15 )

    expect( getDefaultModel( userId ) ).toBe( 'claude-opus-5-5' )
    expect( getFeedCheckInterval() ).toBe( 15 )
    expect( listModelsMock ).not.toHaveBeenCalled()
  } )
} )

describe( 'getSettingsResponse', () => {
  const agent = { url: 'http://agent:8100', secret: 'x'.repeat( 32 ), timeoutMs: 1000 }

  afterEach( () => {
    config.agent = null
  } )

  it( 'says not configured, and asks the agent nothing, without an agent', async () => {
    const response = await getSettingsResponse( userId )

    expect( response ).toMatchObject( {
      linker_locked_instructions: null,
      agent_status: 'not_configured',
      locked_instructions: getLockedInstructions(),
    } )
    expect( healthMock ).not.toHaveBeenCalled()
    expect( instructionsMock ).not.toHaveBeenCalled()
  } )

  it( 'carries the agent\'s locked instructions when it is up', async () => {
    config.agent = agent
    healthMock.mockResolvedValue( 'ok' )
    instructionsMock.mockResolvedValue( 'You link notes.' )

    expect( await getSettingsResponse( userId ) ).toMatchObject( {
      linker_locked_instructions: 'You link notes.',
      agent_status: 'ok',
    } )
  } )

  it( 'says unavailable, with no instructions asked for, when the agent is down', async () => {
    config.agent = agent
    healthMock.mockResolvedValue( 'unavailable' )

    expect( await getSettingsResponse( userId ) ).toMatchObject( {
      linker_locked_instructions: null,
      agent_status: 'unavailable',
    } )
    expect( instructionsMock ).not.toHaveBeenCalled()
  } )

  it( 'still answers, with no instructions, when fetching them fails', async () => {
    config.agent = agent
    healthMock.mockResolvedValue( 'ok' )
    instructionsMock.mockRejectedValue( new AgentError( 'Agent service rejected the secret' ) )

    expect( await getSettingsResponse( userId ) ).toMatchObject( {
      linker_locked_instructions: null,
      agent_status: 'ok',
    } )
  } )
} )

describe( 'getLockedInstructions', () => {
  it( 'returns the locked instructions for videos and articles', () => {
    expect( getLockedInstructions() ).toEqual( {
      video: LOCKED_INSTRUCTIONS_VIDEO,
      article: LOCKED_INSTRUCTIONS_ARTICLE,
      melete_questions: LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
      melete_grading: LOCKED_INSTRUCTIONS_MELETE_GRADING,
    } )
  } )
} )

describe( 'updateSettings', () => {
  it( 'saves a known model', async () => {
    const settings = await updateSettings( userId, true, { default_model: 'claude-opus-5-5' } )

    expect( assertMock ).toHaveBeenCalledWith( userId, 'claude-opus-5-5' )
    expect( settings.default_model ).toBe( 'claude-opus-5-5' )
    expect( ( await getSettings( userId ) ).default_model ).toBe( 'claude-opus-5-5' )
  } )

  it( 'saves a known linking model and the linking switch', async () => {
    const settings = await updateSettings( userId, true, {
      linking_model: 'claude-opus-5-5',
      linking_enabled: false,
    } )

    expect( assertMock ).toHaveBeenCalledWith( userId, 'claude-opus-5-5' )
    expect( settings ).toMatchObject( { linking_model: 'claude-opus-5-5', linking_enabled: false } )
    expect( getSetting( userId, 'linking_model' ) ).toBe( 'claude-opus-5-5' )
    expect( getSetting( userId, 'linking_enabled' ) ).toBe( false )
  } )

  it( 'rejects an unknown linking model and saves nothing', async () => {
    assertMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

    await expect( updateSettings(
      userId,
      true,
      { linking_model: 'nope', linking_enabled: false },
    ) )
      .rejects.toThrow( 'Unknown model: nope' )
    expect( getSetting( userId, 'linking_model' ) ).toBeUndefined()
    expect( getSetting( userId, 'linking_enabled' ) ).toBeUndefined()
  } )

  it( 'saves a known extraction model', async () => {
    const settings = await updateSettings( userId, true, { extraction_model: 'claude-haiku-5-5' } )

    expect( assertMock ).toHaveBeenCalledWith( userId, 'claude-haiku-5-5' )
    expect( settings.extraction_model ).toBe( 'claude-haiku-5-5' )
    expect( getSetting( userId, 'extraction_model' ) ).toBe( 'claude-haiku-5-5' )
    expect( settings.default_model ).toBe( 'claude-sonnet-5-5' )
  } )

  it( 'rejects an unknown extraction model and saves nothing', async () => {
    assertMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

    await expect( updateSettings( userId, true, { extraction_model: 'nope' } ) )
      .rejects.toThrow( 'Unknown model: nope' )
    expect( getSetting( userId, 'extraction_model' ) ).toBeUndefined()
  } )

  it( 'saves an active profile', async () => {
    const coding = byName( 'Coding' )

    await updateSettings( userId, true, { default_profile_id: coding } )

    expect( ( await getSettings( userId ) ).default_profile_id ).toBe( coding )
  } )

  it( 'saves both together', async () => {
    const coding = byName( 'Coding' )

    const settings = await updateSettings( userId, true, {
      default_model: 'claude-opus-5-5',
      default_profile_id: coding,
    } )

    expect( settings ).toEqual( {
      default_model: 'claude-opus-5-5',
      extraction_model: 'claude-sonnet-5-5',
      default_profile_id: coding,
      feed_check_interval_minutes: 60,
      linking_enabled: true,
      linking_model: 'claude-sonnet-5-5',
      linker_profile_id: resolveLinkerPrompt( userId ).profile.id,
      melete_learning_root: null,
      melete_question_model: 'claude-sonnet-5-5',
      melete_grading_model: 'claude-sonnet-5-5',
      melete_review_mode: 'typed',
      melete_question_profile_id: profileIdOf( 'melete_questions' ),
      melete_grading_profile_id: profileIdOf( 'melete_grading' ),
    } )
  } )

  it( 'rejects an unknown model and saves nothing', async () => {
    assertMock.mockRejectedValue( new ValidationError( 'Unknown model: nope' ) )

    await expect( updateSettings( userId, true, {
      default_model: 'nope',
      default_profile_id: byName( 'Coding' ),
    } ) ).rejects.toThrow( 'Unknown model: nope' )
    expect( getSetting( userId, 'default_model' ) ).toBeUndefined()
    expect( ( await getSettings( userId ) ).default_profile_id ).toBe( byName( 'Business ideas' ) )
  } )

  it( 'rejects an unknown profile', async () => {
    await expect( updateSettings( userId, true, { default_profile_id: crypto.randomUUID() } ) )
      .rejects.toThrow( ValidationError )
  } )

  it( 'rejects the linker profile as the default summary profile', async () => {
    await expect( updateSettings(
      userId,
      true,
      { default_profile_id: resolveLinkerPrompt( userId ).profile.id },
    ) )
      .rejects.toThrow( ValidationError )
  } )

  it( 'rejects a deleted profile', async () => {
    const coding = byName( 'Coding' )
    deleteProfile( userId, coding )

    await expect( updateSettings( userId, true, { default_profile_id: coding } ) )
      .rejects.toThrow( ValidationError )
  } )
} )

describe( 'updateSettings by module', () => {
  it( 'refuses a key of a module the user lacks, saving nothing of the request', async () => {
    const transcriber = createTestUser( { modules: [ 'transcriber' ] } ).id

    await expect( updateSettings(
      transcriber,
      false,
      { linking_enabled: false, melete_review_mode: 'quick' },
    ) ).rejects.toThrow( NotFoundError )

    expect( getSetting( transcriber, 'linking_enabled' ) ).toBeUndefined()
    expect( getSetting( transcriber, 'melete_review_mode' ) ).toBeUndefined()
  } )

  it( 'refuses a Transcriber key to a user with only Melete', async () => {
    const melete = createTestUser( { modules: [ 'melete' ] } ).id

    await expect( updateSettings( melete, false, { linking_enabled: false } ) )
      .rejects.toThrow( NotFoundError )
    await expect( updateSettings( melete, false, { default_profile_id: crypto.randomUUID() } ) )
      .rejects.toThrow( NotFoundError )
  } )

  it( 'accepts the keys of the user\'s own modules', async () => {
    const both = createTestUser().id

    await updateSettings( both, false, { linking_enabled: false, melete_review_mode: 'quick' } )

    expect( getSetting( both, 'linking_enabled' ) ).toBe( false )
    expect( getSetting( both, 'melete_review_mode' ) ).toBe( 'quick' )
  } )

  it( 'lets the admin set any key', async () => {
    await updateSettings( userId, true, { linking_enabled: false, melete_review_mode: 'quick' } )

    expect( getSetting( userId, 'melete_review_mode' ) ).toBe( 'quick' )
  } )
} )
