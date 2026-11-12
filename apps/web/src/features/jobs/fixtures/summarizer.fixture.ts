// Shared
import type {
  GetSettingsResponse,
  ListModelsResponse,
  PromptProfile,
  PromptVersion,
} from '@atlas/shared'

export const BUSINESS_ID = '0b7c1c3e-5d4a-4e6f-9a7b-1c2d3e4f5a01'
export const LINKER_ID = '0b7c1c3e-5d4a-4e6f-9a7b-1c2d3e4f5a09'
export const MELETE_QUESTIONS_ID = '0b7c1c3e-5d4a-4e6f-9a7b-1c2d3e4f5a0a'
export const MELETE_GRADING_ID = '0b7c1c3e-5d4a-4e6f-9a7b-1c2d3e4f5a0b'
export const MELETE_SYLLABUS_ID = '0b7c1c3e-5d4a-4e6f-9a7b-1c2d3e4f5a0c'
export const MELETE_MAP_ID = '0b7c1c3e-5d4a-4e6f-9a7b-1c2d3e4f5a0d'
export const MELETE_SUGGEST_ID = '0b7c1c3e-5d4a-4e6f-9a7b-1c2d3e4f5a0e'
export const CODING_ID = '0b7c1c3e-5d4a-4e6f-9a7b-1c2d3e4f5a02'
const GENERAL_ID = '0b7c1c3e-5d4a-4e6f-9a7b-1c2d3e4f5a03'

export const versionFixture = ( overrides: Partial< PromptVersion > = {} ): PromptVersion => {
  return {
    id: 1,
    profile_id: BUSINESS_ID,
    version: 1,
    guidance: 'Focus on ideas worth exploring.',
    source: 'seed',
    created_at: '2026-10-17T10:00:00.000Z',
    ...overrides,
  }
}

export const profileFixture = ( overrides: Partial< PromptProfile > = {} ): PromptProfile => {
  return {
    id: BUSINESS_ID,
    name: 'Business ideas',
    can_reset: true,
    purpose: 'summary',
    current_version: versionFixture(),
    created_at: '2026-10-17T10:00:00.000Z',
    ...overrides,
  }
}

export const profilesFixture = (): PromptProfile[] => [
  profileFixture(),
  profileFixture( {
    id: CODING_ID,
    name: 'Coding',
    current_version: versionFixture( {
      id: 2,
      profile_id: CODING_ID,
      guidance: 'Focus on techniques.',
    } ),
  } ),
  profileFixture( {
    id: GENERAL_ID,
    name: 'General',
    current_version: versionFixture( {
      id: 3,
      profile_id: GENERAL_ID,
      guidance: 'Write a few paragraphs.',
    } ),
  } ),
]

const MELETE_PROFILES: [ string, string, PromptProfile[ 'purpose' ], string ][] = [
  [ MELETE_QUESTIONS_ID, 'Melete questions', 'melete_questions', 'Ask me to explain.' ],
  [ MELETE_GRADING_ID, 'Melete grading', 'melete_grading', 'Be strict about the core idea.' ],
  [ MELETE_SYLLABUS_ID, 'Melete syllabus', 'melete_syllabus', 'Put the foundations first.' ],
  [ MELETE_MAP_ID, 'Melete mapping', 'melete_map', 'Prefer one or two concepts.' ],
  [ MELETE_SUGGEST_ID, 'Melete suggestions', 'melete_suggest', 'Prefer free resources.' ],
]

export const meleteProfilesFixture = (): PromptProfile[] => {
  return MELETE_PROFILES.map( ( [ id, name, purpose, guidance ], index ) => profileFixture( {
    id,
    name,
    purpose,
    current_version: versionFixture( { id: 20 + index, profile_id: id, guidance } ),
  } ) )
}

export const modelsFixture = (
  overrides: Partial< ListModelsResponse > = {},
): ListModelsResponse => {
  return {
    models: [
      { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
      { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' },
    ],
    source: 'api',
    ...overrides,
  }
}

export const settingsFixture = (
  overrides: Partial< GetSettingsResponse[ 'settings' ] > = {},
): GetSettingsResponse => {
  return {
    settings: {
      default_model: 'claude-sonnet-5-5',
      extraction_model: 'claude-haiku-5-5',
      default_profile_id: BUSINESS_ID,
      feed_check_interval_minutes: 60,
      linking_enabled: true,
      linking_model: 'claude-haiku-5-5',
      linker_profile_id: LINKER_ID,
      melete_learning_root: null,
      melete_question_model: 'claude-haiku-5-5',
      melete_grading_model: 'claude-haiku-5-5',
      melete_review_mode: 'typed',
      melete_syllabus_model: 'claude-sonnet-5-5',
      melete_map_model: 'claude-haiku-5-5',
      melete_suggest_model: 'claude-sonnet-5-5',
      melete_mastery_days: 21,
      melete_session_gap_minutes: 5,
      melete_final_card_seconds: 30,
      melete_question_profile_id: MELETE_QUESTIONS_ID,
      melete_grading_profile_id: MELETE_GRADING_ID,
      ...overrides,
    },
    locked_instructions: {
      video: 'You summarize the transcript of a video.',
      article: 'You summarize an article.',
      melete_questions: 'You write questions.',
      melete_grading: 'You grade answers.',
      melete_map: 'You map a note.',
      melete_suggest: 'You suggest resources.',
    },
    linker_locked_instructions: 'You propose links.',
    syllabus_locked_instructions: 'You draft a syllabus.',
    agent_status: 'ok',
  }
}
