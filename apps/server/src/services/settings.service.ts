// Packages
import { z } from 'zod'
// Shared
import {
  FeedCheckInterval,
  GetSettingsResponse,
  MeleteReviewMode,
  Settings,
  UpdateSettingsBody,
} from '@atlas/shared'
import type { ModuleId } from '@atlas/shared'
// Clients
import { AgentError, checkHealth, fetchInstructions } from '../clients/agent.client.js'
import { resolveFolder } from '../clients/vault.client.js'
// Config
import { config } from '../config.js'
// Repositories
import { getAppSetting, setAppSetting } from '../repositories/appSettings.repository.js'
import { findProfileBySeedKey } from '../repositories/promptProfiles.repository.js'
import { getSetting, setSetting } from '../repositories/settings.repository.js'
// Melete
import {
  LOCKED_INSTRUCTIONS_MELETE_GRADING,
  LOCKED_INSTRUCTIONS_MELETE_MAP,
  LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
  LOCKED_INSTRUCTIONS_MELETE_SUGGEST,
  LOCKED_INSTRUCTIONS_MELETE_SYLLABUS,
  MELETE_GRADING_SEED_KEY,
  MELETE_QUESTIONS_SEED_KEY,
} from '../melete/prompts.js'
import { resetScanClock } from '../melete/scanClock.js'
// Summarizer
import { SHIPPED_DEFAULT_MODEL } from '../summarizer/models.js'
import { LOCKED_INSTRUCTIONS_ARTICLE, LOCKED_INSTRUCTIONS_VIDEO } from '../summarizer/prompts.js'
// Services
import { assertKnownModel, listModels } from './models.service.js'
import { NotFoundError } from '../errors.js'
import { modulesFor } from './modules.service.js'
import { vaultRootFor } from './vault.service.js'
import {
  assertActiveProfile,
  resolveLinkerPrompt,
  resolvePrompt,
} from './prompts.service.js'
// Logging
import { logger } from '../logger.js'

const DEFAULT_FEED_INTERVAL = 60

const storedModel = ( userId: string, key: string ): string | undefined => {
  const stored = getSetting( userId, key )

  return typeof stored === 'string' ? stored : undefined
}

export const getDefaultModel = ( userId: string ): string => {
  return storedModel( userId, 'default_model' ) ?? SHIPPED_DEFAULT_MODEL
}

export const getFeedCheckInterval = (): FeedCheckInterval => {
  const interval = FeedCheckInterval.safeParse( getAppSetting( 'feed_check_interval_minutes' ) )

  return interval.success ? interval.data : DEFAULT_FEED_INTERVAL
}

export const isLinkingEnabled = ( userId: string ): boolean => {
  const stored = z.boolean().safeParse( getSetting( userId, 'linking_enabled' ) )

  return stored.success ? stored.data : true
}

// The model list comes newest first, so the first Haiku is the newest one (ADR 0047)
const resolveHaikuModel = async ( userId: string, key: string ): Promise< string > => {
  const stored = storedModel( userId, key )

  if( stored !== undefined ) {
    return stored
  }

  try {
    const { models } = await listModels( userId )

    return models.find( ( { id } ) => id.includes( 'haiku' ) )?.id ?? SHIPPED_DEFAULT_MODEL
  } catch( error ) {
    logger.error( { err: error, setting: key }, 'Could not pick a default model' )

    return SHIPPED_DEFAULT_MODEL
  }
}

export const resolveLinkingModel = ( userId: string ): Promise< string > => {
  return resolveHaikuModel( userId, 'linking_model' )
}

export const resolveMeleteQuestionModel = ( userId: string ): Promise< string > => {
  return resolveHaikuModel( userId, 'melete_question_model' )
}

export const resolveMeleteGradingModel = ( userId: string ): Promise< string > => {
  return resolveHaikuModel( userId, 'melete_grading_model' )
}

// Drafting and suggesting are Sonnet work; mapping is the cheap Haiku call (ADR 0089)
export const resolveMeleteSyllabusModel = ( userId: string ): Promise< string > => {
  return Promise.resolve( storedModel( userId, 'melete_syllabus_model' ) ?? SHIPPED_DEFAULT_MODEL )
}

export const resolveMeleteMapModel = ( userId: string ): Promise< string > => {
  return resolveHaikuModel( userId, 'melete_map_model' )
}

export const resolveMeleteSuggestModel = ( userId: string ): Promise< string > => {
  return Promise.resolve( storedModel( userId, 'melete_suggest_model' ) ?? SHIPPED_DEFAULT_MODEL )
}

export const getLearningRoot = ( userId: string ): string | null => {
  return z.string().min( 1 ).nullable().catch( null )
    .parse( getSetting( userId, 'melete_learning_root' ) )
}

const meleteProfileId = ( userId: string, seedKey: string ): string => {
  const record = findProfileBySeedKey( userId, seedKey )

  if( record === undefined ) {
    throw new Error( `The ${ seedKey } prompt profile is missing` )
  }

  return record.id
}

export const getSettings = async ( userId: string ): Promise< Settings > => {
  return {
    default_model: getDefaultModel( userId ),
    extraction_model: storedModel( userId, 'extraction_model' ) ?? SHIPPED_DEFAULT_MODEL,
    default_profile_id: resolvePrompt( userId, null ).profile.id,
    feed_check_interval_minutes: getFeedCheckInterval(),
    linking_enabled: isLinkingEnabled( userId ),
    linking_model: await resolveLinkingModel( userId ),
    linker_profile_id: resolveLinkerPrompt( userId ).profile.id,
    melete_learning_root: getLearningRoot( userId ),
    melete_question_model: await resolveMeleteQuestionModel( userId ),
    melete_grading_model: await resolveMeleteGradingModel( userId ),
    melete_review_mode: MeleteReviewMode.catch( 'typed' )
      .parse( getSetting( userId, 'melete_review_mode' ) ),
    melete_syllabus_model: await resolveMeleteSyllabusModel( userId ),
    melete_map_model: await resolveMeleteMapModel( userId ),
    melete_suggest_model: await resolveMeleteSuggestModel( userId ),
    melete_question_profile_id: meleteProfileId( userId, MELETE_QUESTIONS_SEED_KEY ),
    melete_grading_profile_id: meleteProfileId( userId, MELETE_GRADING_SEED_KEY ),
  }
}

export const getLockedInstructions = (): GetSettingsResponse[ 'locked_instructions' ] => ( {
  video: LOCKED_INSTRUCTIONS_VIDEO,
  article: LOCKED_INSTRUCTIONS_ARTICLE,
  melete_questions: LOCKED_INSTRUCTIONS_MELETE_QUESTIONS,
  melete_grading: LOCKED_INSTRUCTIONS_MELETE_GRADING,
  melete_syllabus: LOCKED_INSTRUCTIONS_MELETE_SYLLABUS,
  melete_map: LOCKED_INSTRUCTIONS_MELETE_MAP,
  melete_suggest: LOCKED_INSTRUCTIONS_MELETE_SUGGEST,
} )

const agentSection = async (): Promise<
  Pick< GetSettingsResponse, 'agent_status' | 'linker_locked_instructions' >
> => {
  if( config.agent === null ) {
    return { agent_status: 'not_configured', linker_locked_instructions: null }
  }

  if( await checkHealth() === 'unavailable' ) {
    return { agent_status: 'unavailable', linker_locked_instructions: null }
  }

  try {
    return { agent_status: 'ok', linker_locked_instructions: await fetchInstructions() }
  } catch( error ) {
    if( !( error instanceof AgentError ) ) {
      throw error
    }

    return { agent_status: 'ok', linker_locked_instructions: null }
  }
}

// A down or misbehaving agent never fails the settings request
export const getSettingsResponse = async ( userId: string ): Promise< GetSettingsResponse > => {
  return {
    settings: await getSettings( userId ),
    locked_instructions: getLockedInstructions(),
    ...await agentSection(),
  }
}

// The settings of each module; a user can only change those of the modules they have
const MODULE_KEYS: Record< ModuleId, ( keyof UpdateSettingsBody )[] > = {
  transcriber: [
    'default_model',
    'extraction_model',
    'linking_model',
    'linking_enabled',
    'default_profile_id',
    'feed_check_interval_minutes',
  ],
  melete: [
    'melete_learning_root',
    'melete_question_model',
    'melete_grading_model',
    'melete_review_mode',
    'melete_syllabus_model',
    'melete_map_model',
    'melete_suggest_model',
  ],
}

const CONCEPT_MODEL_KEYS = [
  'melete_syllabus_model',
  'melete_map_model',
  'melete_suggest_model',
] as const

// The feed interval is the app's, not a user's: only the admin may set it (ADR 0065). A request
// that touches a setting the user may not change is refused whole (a 404), saving nothing.
export const updateSettings = async (
  userId: string,
  isAdmin: boolean,
  body: UpdateSettingsBody,
): Promise< Settings > => {
  const modules = modulesFor( userId )
  const refused = ( Object.keys( MODULE_KEYS ) as ModuleId[] )
    .filter( ( module ) => !modules.includes( module ) )
    .flatMap( ( module ) => MODULE_KEYS[ module ] )

  if( refused.some( ( key ) => body[ key ] !== undefined )
    || ( body.feed_check_interval_minutes !== undefined && !isAdmin ) ) {
    throw new NotFoundError( 'Not Found' )
  }

  if( body.default_model !== undefined ) {
    await assertKnownModel( userId, body.default_model )
  }

  if( body.extraction_model !== undefined ) {
    await assertKnownModel( userId, body.extraction_model )
  }

  if( body.linking_model !== undefined ) {
    await assertKnownModel( userId, body.linking_model )
  }

  if( body.melete_question_model !== undefined ) {
    await assertKnownModel( userId, body.melete_question_model )
  }

  if( body.melete_grading_model !== undefined ) {
    await assertKnownModel( userId, body.melete_grading_model )
  }

  for( const key of CONCEPT_MODEL_KEYS ) {
    const model = body[ key ]

    if( model !== undefined ) {
      await assertKnownModel( userId, model )
    }
  }

  if( body.default_profile_id !== undefined ) {
    assertActiveProfile( userId, body.default_profile_id )
  }

  if( typeof body.melete_learning_root === 'string' ) {
    await resolveFolder( vaultRootFor( userId ), body.melete_learning_root )
  }

  if( body.default_model !== undefined ) {
    setSetting( userId, 'default_model', body.default_model )
  }

  if( body.extraction_model !== undefined ) {
    setSetting( userId, 'extraction_model', body.extraction_model )
  }

  if( body.linking_model !== undefined ) {
    setSetting( userId, 'linking_model', body.linking_model )
  }

  if( body.linking_enabled !== undefined ) {
    setSetting( userId, 'linking_enabled', body.linking_enabled )
  }

  if( body.default_profile_id !== undefined ) {
    setSetting( userId, 'default_profile_id', body.default_profile_id )
  }

  if( body.feed_check_interval_minutes !== undefined ) {
    setAppSetting( 'feed_check_interval_minutes', body.feed_check_interval_minutes )
  }

  if( body.melete_question_model !== undefined ) {
    setSetting( userId, 'melete_question_model', body.melete_question_model )
  }

  if( body.melete_grading_model !== undefined ) {
    setSetting( userId, 'melete_grading_model', body.melete_grading_model )
  }

  for( const key of CONCEPT_MODEL_KEYS ) {
    const model = body[ key ]

    if( model !== undefined ) {
      setSetting( userId, key, model )
    }
  }

  if( body.melete_review_mode !== undefined ) {
    setSetting( userId, 'melete_review_mode', body.melete_review_mode )
  }

  if( body.melete_learning_root !== undefined ) {
    setSetting( userId, 'melete_learning_root', body.melete_learning_root )
    resetScanClock( userId )
  }

  return getSettings( userId )
}
