// Packages
import { describe, it, expect } from 'vitest'
// Summarizer
import {
  AppSettingKey,
  CreatePromptProfileBody,
  GetSettingsResponse,
  Guidance,
  ListModelsResponse,
  ListPromptProfilesResponse,
  ListPromptVersionsResponse,
  ModelOption,
  ProfileName,
  PromptProfile,
  PromptProfileResponse,
  PromptVersion,
  PromptVersionSource,
  RegenerateSummaryBody,
  RenamePromptProfileBody,
  SavePromptVersionBody,
  Settings,
  SummaryRun,
  SummaryUsage,
  UpdateSettingsBody,
  UserSettingKey,
} from './summarizer.js'

const profileId = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'
const now = '2026-10-17T10:00:00.000Z'

const version = {
  id: 1,
  profile_id: profileId,
  version: 1,
  guidance: 'Focus on ideas.',
  source: 'seed',
  created_at: now,
}

const profile = {
  id: profileId,
  name: 'Business ideas',
  can_reset: true,
  purpose: 'summary',
  current_version: version,
  created_at: now,
}

const run = {
  model: 'claude-sonnet-5-5',
  profile_id: profileId,
  profile_name: 'Business ideas',
  prompt_version: 3,
  input_tokens: 31200,
  output_tokens: 1400,
  cost_usd: 0.12,
  outcome: 'succeeded',
  created_at: now,
}

describe( 'ModelOption and ListModelsResponse', () => {
  it( 'accepts a model option', () => {
    const option = { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' }

    expect( ModelOption.safeParse( option ).success ).toBe( true )
  } )

  it.each( [ 'api', 'fallback' ] )( 'accepts source %s', ( source ) => {
    expect( ListModelsResponse.safeParse( { models: [], source } ).success ).toBe( true )
  } )

  it( 'rejects an unknown source', () => {
    expect( ListModelsResponse.safeParse( { models: [], source: 'cache' } ).success ).toBe( false )
  } )
} )

describe( 'UserSettingKey and AppSettingKey', () => {
  it( 'list the per-user keys and the app-wide key', () => {
    expect( UserSettingKey.options ).toEqual( [
      'default_model',
      'default_profile_id',
      'linking_enabled',
      'linking_model',
      'extraction_model',
      'melete_learning_root',
      'melete_question_model',
      'melete_grading_model',
      'melete_review_mode',
      'melete_syllabus_model',
      'melete_map_model',
      'melete_suggest_model',
      'melete_mastery_days',
    ] )
    expect( AppSettingKey.options ).toEqual( [ 'feed_check_interval_minutes' ] )
  } )

  it( 'keep the two sets apart', () => {
    expect( UserSettingKey.safeParse( 'feed_check_interval_minutes' ).success ).toBe( false )
    expect( AppSettingKey.safeParse( 'default_model' ).success ).toBe( false )
  } )
} )

describe( 'Settings', () => {
  const settings = {
    default_model: 'm',
    extraction_model: 'h',
    default_profile_id: profileId,
    feed_check_interval_minutes: 60,
    linking_enabled: true,
    linking_model: 'h',
    linker_profile_id: profileId,
    melete_learning_root: 'Learning',
    melete_question_model: 'h',
    melete_grading_model: 'h',
    melete_review_mode: 'typed',
    melete_syllabus_model: 's',
    melete_map_model: 'h',
    melete_suggest_model: 's',
    melete_mastery_days: 21,
    melete_question_profile_id: profileId,
    melete_grading_profile_id: profileId,
  }

  it( 'accepts a model, a profile id and a feed interval', () => {
    expect( Settings.safeParse( settings ).success ).toBe( true )
  } )

  it( 'needs a non-empty extraction model', () => {
    const without: Record< string, unknown > = { ...settings }
    delete without.extraction_model

    expect( Settings.safeParse( without ).success ).toBe( false )
    expect( Settings.safeParse( { ...settings, extraction_model: '' } ).success ).toBe( false )
  } )

  it( 'rejects a profile id that is not a uuid', () => {
    expect( Settings.safeParse( { ...settings, default_profile_id: 'x' } ).success ).toBe( false )
  } )

  it.each( [ 'linking_enabled', 'linking_model', 'linker_profile_id' ] )(
    'rejects a missing %s',
    ( key ) => {
      const without: Record< string, unknown > = { ...settings }
      delete without[ key ]

      expect( Settings.safeParse( without ).success ).toBe( false )
    },
  )

  it( 'rejects an empty linking model and a linker profile id that is not a uuid', () => {
    expect( Settings.safeParse( { ...settings, linking_model: '' } ).success ).toBe( false )
    expect( Settings.safeParse( { ...settings, linker_profile_id: 'x' } ).success ).toBe( false )
  } )

  it.each( [ 15, 30, 60, 180, 360, 1440 ] )( 'accepts a feed interval of %s', ( minutes ) => {
    expect( Settings.safeParse( { ...settings, feed_check_interval_minutes: minutes } ).success )
      .toBe( true )
  } )

  it.each( [ 0, 5, 45, '60' ] )( 'rejects a feed interval of %s', ( minutes ) => {
    expect( Settings.safeParse( { ...settings, feed_check_interval_minutes: minutes } ).success )
      .toBe( false )
  } )

  it.each( [
    'melete_learning_root',
    'melete_question_model',
    'melete_grading_model',
    'melete_review_mode',
    'melete_syllabus_model',
    'melete_map_model',
    'melete_suggest_model',
    'melete_mastery_days',
    'melete_question_profile_id',
    'melete_grading_profile_id',
  ] )( 'rejects a missing %s', ( key ) => {
    const without: Record< string, unknown > = { ...settings }
    delete without[ key ]

    expect( Settings.safeParse( without ).success ).toBe( false )
  } )

  it( 'accepts a null learning root and both review modes', () => {
    expect( Settings.safeParse( { ...settings, melete_learning_root: null } ).success )
      .toBe( true )
    expect( Settings.safeParse( { ...settings, melete_review_mode: 'quick' } ).success )
      .toBe( true )
    expect( Settings.safeParse( { ...settings, melete_review_mode: 'fast' } ).success )
      .toBe( false )
  } )

  it( 'rejects empty Melete models and Melete profile ids that are not uuids', () => {
    expect( Settings.safeParse( { ...settings, melete_question_model: '' } ).success ).toBe( false )
    expect( Settings.safeParse( { ...settings, melete_grading_model: '' } ).success ).toBe( false )
    expect( Settings.safeParse( { ...settings, melete_syllabus_model: '' } ).success ).toBe( false )
    expect( Settings.safeParse( { ...settings, melete_map_model: '' } ).success ).toBe( false )
    expect( Settings.safeParse( { ...settings, melete_suggest_model: '' } ).success ).toBe( false )
    expect( Settings.safeParse( { ...settings, melete_mastery_days: 6 } ).success ).toBe( false )
    expect( Settings.safeParse( { ...settings, melete_mastery_days: 91 } ).success ).toBe( false )
    expect( Settings.safeParse( { ...settings, melete_mastery_days: 20.5 } ).success ).toBe( false )
    expect( Settings.safeParse( { ...settings, melete_question_profile_id: 'x' } ).success )
      .toBe( false )
    expect( Settings.safeParse( { ...settings, melete_grading_profile_id: 'x' } ).success )
      .toBe( false )
  } )

  it( 'GetSettingsResponse carries the locked instructions for videos and articles', () => {
    const body = {
      settings,
      locked_instructions: {
        video: 'video text',
        article: 'article text',
        melete_questions: 'questions text',
        melete_grading: 'grading text',
        melete_syllabus: 'syllabus text',
        melete_map: 'map text',
        melete_suggest: 'suggest text',
      },
      linker_locked_instructions: 'linker text',
      agent_status: 'ok',
    }

    expect( GetSettingsResponse.safeParse( body ).success ).toBe( true )
    expect( GetSettingsResponse.safeParse( { settings } ).success ).toBe( false )
    expect( GetSettingsResponse.safeParse( { ...body, linker_locked_instructions: null } ).success )
      .toBe( true )
    expect( GetSettingsResponse.safeParse( { ...body, agent_status: 'unavailable' } ).success )
      .toBe( true )
    expect( GetSettingsResponse.safeParse( { ...body, agent_status: 'not_configured' } ).success )
      .toBe( true )
    expect( GetSettingsResponse.safeParse( { ...body, agent_status: 'down' } ).success )
      .toBe( false )
    expect( GetSettingsResponse.safeParse( {
      settings,
      locked_instructions: body.locked_instructions,
    } ).success ).toBe( false )
    expect( GetSettingsResponse.safeParse( { ...body, locked_instructions: 'text' } ).success )
      .toBe( false )
    expect( GetSettingsResponse.safeParse( {
      ...body,
      locked_instructions: { video: 'only' },
    } ).success ).toBe( false )
    expect( GetSettingsResponse.safeParse( {
      ...body,
      locked_instructions: { video: 'v', article: 'a' },
    } ).success ).toBe( false )
  } )
} )

describe( 'UpdateSettingsBody', () => {
  it( 'accepts a model alone', () => {
    expect( UpdateSettingsBody.safeParse( { default_model: 'm' } ).success ).toBe( true )
  } )

  it( 'accepts a profile alone', () => {
    expect( UpdateSettingsBody.safeParse( { default_profile_id: profileId } ).success ).toBe( true )
  } )

  it( 'accepts an extraction model alone', () => {
    expect( UpdateSettingsBody.safeParse( { extraction_model: 'h' } ).success ).toBe( true )
    expect( UpdateSettingsBody.safeParse( { extraction_model: '' } ).success ).toBe( false )
  } )

  it( 'accepts a feed interval alone', () => {
    expect( UpdateSettingsBody.safeParse( { feed_check_interval_minutes: 180 } ).success )
      .toBe( true )
  } )

  it( 'rejects an interval that is not on the list', () => {
    expect( UpdateSettingsBody.safeParse( { feed_check_interval_minutes: 10 } ).success )
      .toBe( false )
  } )

  it( 'accepts the linking switch and the linking model, each alone', () => {
    expect( UpdateSettingsBody.safeParse( { linking_enabled: false } ).success ).toBe( true )
    expect( UpdateSettingsBody.safeParse( { linking_model: 'h' } ).success ).toBe( true )
    expect( UpdateSettingsBody.safeParse( { linking_model: '' } ).success ).toBe( false )
    expect( UpdateSettingsBody.safeParse( { linking_enabled: 'yes' } ).success ).toBe( false )
  } )

  it( 'does not accept the linker profile id', () => {
    expect( UpdateSettingsBody.safeParse( { linker_profile_id: profileId } ).success ).toBe( false )
  } )

  it( 'accepts each Melete setting alone', () => {
    expect( UpdateSettingsBody.safeParse( { melete_learning_root: 'Learning' } ).success )
      .toBe( true )
    expect( UpdateSettingsBody.safeParse( { melete_learning_root: 'Learning/School' } ).success )
      .toBe( true )
    expect( UpdateSettingsBody.safeParse( { melete_learning_root: null } ).success ).toBe( true )
    expect( UpdateSettingsBody.safeParse( { melete_question_model: 'h' } ).success ).toBe( true )
    expect( UpdateSettingsBody.safeParse( { melete_grading_model: 'h' } ).success ).toBe( true )
    expect( UpdateSettingsBody.safeParse( { melete_syllabus_model: 's' } ).success ).toBe( true )
    expect( UpdateSettingsBody.safeParse( { melete_map_model: 'h' } ).success ).toBe( true )
    expect( UpdateSettingsBody.safeParse( { melete_suggest_model: 's' } ).success ).toBe( true )
    expect( UpdateSettingsBody.safeParse( { melete_review_mode: 'quick' } ).success ).toBe( true )
    expect( UpdateSettingsBody.safeParse( { melete_mastery_days: 7 } ).success ).toBe( true )
    expect( UpdateSettingsBody.safeParse( { melete_mastery_days: 90 } ).success ).toBe( true )
  } )

  it( 'rejects a bad learning root, empty Melete models and an unknown review mode', () => {
    expect( UpdateSettingsBody.safeParse( { melete_learning_root: '../x' } ).success )
      .toBe( false )
    expect( UpdateSettingsBody.safeParse( { melete_learning_root: '' } ).success ).toBe( false )
    expect( UpdateSettingsBody.safeParse( { melete_learning_root: 'a//b' } ).success )
      .toBe( false )
    expect( UpdateSettingsBody.safeParse( { melete_question_model: '' } ).success ).toBe( false )
    expect( UpdateSettingsBody.safeParse( { melete_grading_model: '' } ).success ).toBe( false )
    expect( UpdateSettingsBody.safeParse( { melete_syllabus_model: '' } ).success ).toBe( false )
    expect( UpdateSettingsBody.safeParse( { melete_map_model: '' } ).success ).toBe( false )
    expect( UpdateSettingsBody.safeParse( { melete_suggest_model: '' } ).success ).toBe( false )
    expect( UpdateSettingsBody.safeParse( { melete_review_mode: 'fast' } ).success ).toBe( false )
    expect( UpdateSettingsBody.safeParse( { melete_mastery_days: 6 } ).success ).toBe( false )
    expect( UpdateSettingsBody.safeParse( { melete_mastery_days: 91 } ).success ).toBe( false )
    expect( UpdateSettingsBody.safeParse( { melete_mastery_days: 21.5 } ).success ).toBe( false )
  } )

  it( 'does not accept the Melete profile ids', () => {
    expect( UpdateSettingsBody.safeParse( { melete_question_profile_id: profileId } ).success )
      .toBe( false )
    expect( UpdateSettingsBody.safeParse( { melete_grading_profile_id: profileId } ).success )
      .toBe( false )
  } )

  it( 'rejects an empty body, naming every key it accepts', () => {
    const result = UpdateSettingsBody.safeParse( {} )
    const message = result.error?.issues[ 0 ]?.message

    expect( result.success ).toBe( false )
    expect( message ).toContain( 'extraction_model' )
    expect( message ).toContain( 'linking_enabled' )
    expect( message ).toContain( 'linking_model' )
    expect( message ).toContain( 'melete_learning_root' )
    expect( message ).toContain( 'melete_question_model' )
    expect( message ).toContain( 'melete_grading_model' )
    expect( message ).toContain( 'melete_review_mode' )
    expect( message ).toContain( 'melete_syllabus_model' )
  } )

  it( 'rejects an empty model', () => {
    expect( UpdateSettingsBody.safeParse( { default_model: '' } ).success ).toBe( false )
  } )
} )

describe( 'Guidance', () => {
  it( 'trims', () => {
    expect( Guidance.parse( '  focus  ' ) ).toBe( 'focus' )
  } )

  it( 'rejects empty and whitespace-only text', () => {
    expect( Guidance.safeParse( '' ).success ).toBe( false )
    expect( Guidance.safeParse( '   \n ' ).success ).toBe( false )
  } )

  it( 'accepts 20000 characters and rejects 20001', () => {
    expect( Guidance.safeParse( 'a'.repeat( 20_000 ) ).success ).toBe( true )
    expect( Guidance.safeParse( 'a'.repeat( 20_001 ) ).success ).toBe( false )
  } )
} )

describe( 'ProfileName', () => {
  it( 'trims', () => {
    expect( ProfileName.parse( '  Coding ' ) ).toBe( 'Coding' )
  } )

  it( 'rejects empty text', () => {
    expect( ProfileName.safeParse( '  ' ).success ).toBe( false )
  } )

  it( 'accepts 60 characters and rejects 61', () => {
    expect( ProfileName.safeParse( 'a'.repeat( 60 ) ).success ).toBe( true )
    expect( ProfileName.safeParse( 'a'.repeat( 61 ) ).success ).toBe( false )
  } )
} )

describe( 'PromptVersion', () => {
  it.each( [ 'seed', 'edit', 'restore', 'reset' ] )( 'accepts source %s', ( source ) => {
    expect( PromptVersionSource.safeParse( source ).success ).toBe( true )
    expect( PromptVersion.safeParse( { ...version, source } ).success ).toBe( true )
  } )

  it( 'rejects an unknown source', () => {
    expect( PromptVersionSource.safeParse( 'import' ).success ).toBe( false )
  } )

  it( 'rejects a version below 1', () => {
    expect( PromptVersion.safeParse( { ...version, version: 0 } ).success ).toBe( false )
  } )
} )

describe( 'PromptProfile and its responses', () => {
  it.each( [
    'summary',
    'linker',
    'melete_questions',
    'melete_grading',
    'melete_syllabus',
    'melete_map',
    'melete_suggest',
  ] )(
    'accepts the purpose %s',
    ( purpose ) => {
      expect( PromptProfile.safeParse( { ...profile, purpose } ).success ).toBe( true )
    },
  )

  it( 'needs a known purpose', () => {
    const rest: Record< string, unknown > = { ...profile }
    delete rest.purpose

    expect( PromptProfile.safeParse( rest ).success ).toBe( false )
    expect( PromptProfile.safeParse( { ...profile, purpose: 'other' } ).success ).toBe( false )
  } )

  it( 'accepts a profile', () => {
    expect( PromptProfile.safeParse( profile ).success ).toBe( true )
  } )

  it( 'rejects a profile without a current version', () => {
    const rest: Record< string, unknown > = { ...profile }
    delete rest.current_version

    expect( PromptProfile.safeParse( rest ).success ).toBe( false )
  } )

  it( 'wraps profiles and versions in their responses', () => {
    expect( ListPromptProfilesResponse.safeParse( { profiles: [ profile ] } ).success ).toBe( true )
    expect( PromptProfileResponse.safeParse( { profile } ).success ).toBe( true )
    expect( ListPromptVersionsResponse.safeParse( { versions: [ version ] } ).success ).toBe( true )
  } )
} )

describe( 'profile request bodies', () => {
  it( 'CreatePromptProfileBody trims name and guidance', () => {
    const parsed = CreatePromptProfileBody.parse( { name: ' A ', guidance: ' g ' } )

    expect( parsed ).toEqual( { name: 'A', guidance: 'g' } )
  } )

  it( 'CreatePromptProfileBody needs both fields', () => {
    expect( CreatePromptProfileBody.safeParse( { name: 'A' } ).success ).toBe( false )
    expect( CreatePromptProfileBody.safeParse( { guidance: 'g' } ).success ).toBe( false )
  } )

  it( 'RenamePromptProfileBody rejects an empty name', () => {
    expect( RenamePromptProfileBody.safeParse( { name: ' ' } ).success ).toBe( false )
  } )

  it( 'SavePromptVersionBody rejects empty guidance', () => {
    expect( SavePromptVersionBody.safeParse( { guidance: '' } ).success ).toBe( false )
  } )
} )

describe( 'SummaryRun and SummaryUsage', () => {
  it( 'accepts a succeeded run', () => {
    expect( SummaryRun.safeParse( run ).success ).toBe( true )
  } )

  it( 'accepts a failed run with no tokens and no cost', () => {
    const failed = {
      ...run,
      input_tokens: null,
      output_tokens: null,
      cost_usd: null,
      outcome: 'failed',
    }

    expect( SummaryRun.safeParse( failed ).success ).toBe( true )
  } )

  it( 'rejects an unknown outcome', () => {
    expect( SummaryRun.safeParse( { ...run, outcome: 'pending' } ).success ).toBe( false )
  } )

  it( 'accepts usage with a total cost', () => {
    const usage = {
      last_run: run,
      run_count: 2,
      total_input_tokens: 60000,
      total_output_tokens: 2800,
      total_cost_usd: 0.24,
    }

    expect( SummaryUsage.safeParse( usage ).success ).toBe( true )
  } )

  it( 'accepts a null total cost', () => {
    const usage = {
      last_run: run,
      run_count: 1,
      total_input_tokens: 1,
      total_output_tokens: 1,
      total_cost_usd: null,
    }

    expect( SummaryUsage.safeParse( usage ).success ).toBe( true )
  } )
} )

describe( 'RegenerateSummaryBody', () => {
  it( 'accepts an empty body', () => {
    expect( RegenerateSummaryBody.safeParse( {} ).success ).toBe( true )
  } )

  it( 'accepts a model and a profile', () => {
    const body = { model: 'm', profile_id: profileId }

    expect( RegenerateSummaryBody.safeParse( body ).success ).toBe( true )
  } )

  it( 'rejects a bad profile id and an empty model', () => {
    expect( RegenerateSummaryBody.safeParse( { profile_id: 'x' } ).success ).toBe( false )
    expect( RegenerateSummaryBody.safeParse( { model: '' } ).success ).toBe( false )
  } )
} )
