// Node
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import { z } from 'zod'
// Shared
import { isValidFolderName } from '@atlas/shared'

const emptyAsUnset = ( value: unknown ): unknown => ( value === '' ? undefined : value )

const defaultDataDir = join( tmpdir(), 'atlas-data' )
const portSchema = z.coerce.number().int().min( 1 ).max( 65535 ).default( 3100 )
const summaryTimeoutSchema = z.coerce.number().int().positive().default( 300_000 )
const reviewTtlSchema = z.coerce.number().positive().default( 24 )
const cleanupIntervalSchema = z.coerce.number().positive().default( 15 )
const statusIntervalSchema = z.coerce.number().positive().default( 2 )
const logLevelSchema = z
  .enum( [ 'fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent' ] )
  .default( 'info' )
const agentTimeoutSchema = z.coerce.number().int().positive().default( 120_000 )
// Above the agent's own 180 s, so the agent reports its own timeout (ADR 0105)
const agentSyllabusTimeoutSchema = z.coerce.number().int().positive().default( 200_000 )

const calendarLookbackSchema = z.coerce.number().int().min( 1 ).max( 90 ).default( 14 )

const isTimeZone = ( value: string ): boolean => {
  try {
    new Intl.DateTimeFormat( 'en', { timeZone: value } )

    return true
  } catch{
    return false
  }
}

const timeZoneSchema = z
  .string()
  .refine( isTimeZone, 'must be an IANA time zone, like Asia/Singapore' )
  .default( 'Asia/Singapore' )
const requestRetentionSchema = z.coerce.number().gt( 0.7 ).lte( 0.99 ).default( 0.9 )
const dayStartHourSchema = z.coerce.number().int().min( 0 ).max( 23 ).default( 4 )
const gradingTimeoutSchema = z.coerce.number().int().positive().default( 20_000 )
const generationTimeoutSchema = z.coerce.number().int().positive().default( 120_000 )

const isFolderPath = ( value: string ): boolean => {
  return value.split( '/' ).every( isValidFolderName )
}

const noteFolderSchema = z
  .string()
  .refine( isFolderPath, 'must be a folder path inside the vault, like Notes/Videos' )
  .default( 'Mnemosyne' )

const KEY_MESSAGE = 'TOKEN_ENCRYPTION_KEY must be 32 bytes in base64 (openssl rand -base64 32)'

const isKey = ( value: string ): boolean => {
  return /^[A-Za-z0-9+/]+={0,2}$/.test( value ) && Buffer.from( value, 'base64' ).length === 32
}

const encryptionKeySchema = z
  .string()
  .refine( isKey, KEY_MESSAGE )
  .transform( ( value ) => Buffer.from( value, 'base64' ) )

const sessionDaysSchema = z.coerce.number().int().min( 1 ).max( 365 ).default( 30 )

// Each entry is scheme://host[:port] with nothing after it, so a request's origin can be compared as text
const toOrigin = ( entry: string ): string | null => {
  const url = URL.canParse( entry ) ? new URL( entry ) : null

  if( url === null || ![ 'http:', 'https:' ].includes( url.protocol ) ) {
    return null
  }

  if( url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username !== '' ) {
    return null
  }

  return url.origin
}

const originsSchema = z
  .string()
  .transform( ( value, ctx ) => {
    const origins: string[] = []

    for( const raw of value.split( ',' ) ) {
      const origin = toOrigin( raw.trim() )

      if( origin === null ) {
        ctx.addIssue( {
          code: 'custom',
          message: 'must be comma-separated origins like http://localhost:3100 (no path)',
        } )

        return z.NEVER
      }

      if( !origins.includes( origin ) ) {
        origins.push( origin )
      }
    }

    return origins
  } )

// Removed variables that are still read by nothing; a leftover value is reported at startup
const IGNORED_VARIABLES = [
  'GOOGLE_REDIRECT_URI',
  'VAULT_PATH',
  'OBSIDIAN_VAULT_NAME',
  'WHISPER_URL',
  'WHISPER_MODEL',
  'BACKUP_DIR',
  'BACKUP_HOST_PATH',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'TRANSCRIPTION_MODEL',
  'POT_PROVIDER_URL',
  'WORK_DIR',
  'GOOGLE_CLOUD_PROJECT',
  'GEMINI_LOCATION',
  'GEMINI_ACCESS_TOKEN',
]

export const ignoredEnv = ( env: NodeJS.ProcessEnv ): string[] => {
  return IGNORED_VARIABLES.filter( ( name ) => env[ name ] !== undefined && env[ name ] !== '' )
}

const FEDERATION_VARIABLES = [
  'ANTHROPIC_FEDERATION_RULE_ID',
  'ANTHROPIC_ORGANIZATION_ID',
  'ANTHROPIC_SERVICE_ACCOUNT_ID',
  'ANTHROPIC_WORKSPACE_ID',
  'ANTHROPIC_IDENTITY_TOKEN_FILE',
] as const

type ClaudeVariable = 'ANTHROPIC_API_KEY' | typeof FEDERATION_VARIABLES[ number ]
type ClaudeEnv = { [ name in ClaudeVariable ]?: string }

export type ClaudeAuth = { kind: 'api_key', key: string } | { kind: 'federation' }

const isSet = ( value: string | undefined ): boolean => value !== undefined && value !== ''

// Exactly one mode (ADR 0110). An empty key beside federation is refused because the SDK treats
// an empty key as the key path.
const claudeAuthProblem = ( env: ClaudeEnv ): { variable: string, message: string } | null => {
  const federation = FEDERATION_VARIABLES.filter( ( name ) => isSet( env[ name ] ) )
  const hasKey = isSet( env.ANTHROPIC_API_KEY )
  const modes = `set ANTHROPIC_API_KEY, or all of ${  FEDERATION_VARIABLES.join( ', ' )}`

  if( hasKey && federation.length > 0 ) {
    return {
      variable: 'ANTHROPIC_API_KEY',
      message: 'Set either ANTHROPIC_API_KEY or the federation variables, not both '
        + `(found ${ federation.join( ', ' ) })`,
    }
  }

  if( env.ANTHROPIC_API_KEY === '' && federation.length > 0 ) {
    return {
      variable: 'ANTHROPIC_API_KEY',
      message: 'ANTHROPIC_API_KEY is empty beside federation: unset it, don\'t blank it',
    }
  }

  if( hasKey ) return null

  if( federation.length === 0 ) {
    return { variable: 'ANTHROPIC_API_KEY', message: `No Claude credential: ${ modes }` }
  }

  const missing = FEDERATION_VARIABLES.find( ( name ) => !isSet( env[ name ] ) )

  if( missing !== undefined ) {
    return { variable: missing, message: `Federation is partly set: ${ missing } is missing` }
  }

  if( !existsSync( env.ANTHROPIC_IDENTITY_TOKEN_FILE ?? '' ) ) {
    return {
      variable: 'ANTHROPIC_IDENTITY_TOKEN_FILE',
      message: 'ANTHROPIC_IDENTITY_TOKEN_FILE does not exist: has the identity-token helper run?',
    }
  }

  return null
}

const claudeAuthOf = ( env: ClaudeEnv ): ClaudeAuth => {
  return isSet( env.ANTHROPIC_API_KEY )
    ? { kind: 'api_key', key: env.ANTHROPIC_API_KEY as string }
    : { kind: 'federation' }
}

const EnvSchema = z
  .object( {
    PORT: z.preprocess( emptyAsUnset, portSchema ),
    DATA_DIR: z.preprocess( emptyAsUnset, z.string().min( 1 ).default( defaultDataDir ) ),
    WEB_DIR: z.preprocess( emptyAsUnset, z.string().min( 1 ).optional() ),
    // Claude credentials (ADR 0110): a key (the Mac) or federation (the VM), checked together below
    ANTHROPIC_API_KEY: z.string().optional(),
    ANTHROPIC_FEDERATION_RULE_ID: z.string().optional(),
    ANTHROPIC_ORGANIZATION_ID: z.string().optional(),
    ANTHROPIC_SERVICE_ACCOUNT_ID: z.string().optional(),
    ANTHROPIC_WORKSPACE_ID: z.string().optional(),
    ANTHROPIC_IDENTITY_TOKEN_FILE: z.string().optional(),
    GEMINI_MODEL: z.string().min( 1 ),
    GEMINI_API_KEY: z.string().min( 1 ),
    YOUTUBE_API_KEY: z.string().min( 1 ),
    LITESTREAM_METRICS_URL: z.preprocess( emptyAsUnset, z.url().optional() ),
    GEMINI_BASE_URL: z.preprocess( emptyAsUnset, z.url().optional() ),
    YOUTUBE_API_BASE_URL: z.preprocess( emptyAsUnset, z.url().optional() ),
    VAULT_CREATE_ENABLED: z.preprocess(
      emptyAsUnset,
      z.enum( [ 'true', 'false', '1', '0' ] ).default( 'true' ),
    ),
    VAULT_SYNC_STATUS_DIR: z.preprocess( emptyAsUnset, z.string().min( 1 ).optional() ),
    DEFAULT_NOTE_FOLDER: z.preprocess( emptyAsUnset, noteFolderSchema ),
    LOG_LEVEL: z.preprocess( emptyAsUnset, logLevelSchema ),
    SUMMARY_TIMEOUT_MS: z.preprocess( emptyAsUnset, summaryTimeoutSchema ),
    REVIEW_TTL_HOURS: z.preprocess( emptyAsUnset, reviewTtlSchema ),
    CLEANUP_INTERVAL_MINUTES: z.preprocess( emptyAsUnset, cleanupIntervalSchema ),
    STATUS_CHECK_INTERVAL_MINUTES: z.preprocess( emptyAsUnset, statusIntervalSchema ),
    ADMIN_EMAIL: z.email().transform( ( value ) => value.toLowerCase() ),
    APP_ORIGINS: originsSchema,
    SESSION_DAYS: z.preprocess( emptyAsUnset, sessionDaysSchema ),
    E2E_TEST_SIGNIN: z.preprocess( emptyAsUnset, z.enum( [ '1' ] ).optional() ),
    FETCH_ALLOW_PRIVATE: z.preprocess( emptyAsUnset, z.enum( [ '1' ] ).optional() ),
    VAULTS_PATH: z.preprocess( emptyAsUnset, z.string().min( 1 ).default( '/vaults' ) ),
    GOOGLE_CLIENT_ID: z.string().min( 1 ),
    GOOGLE_CLIENT_SECRET: z.string().min( 1 ),
    TOKEN_ENCRYPTION_KEY: encryptionKeySchema,
    AGENT_URL: z.preprocess( emptyAsUnset, z.url().default( 'http://localhost:8100' ) ),
    AGENT_SECRET: z.preprocess( emptyAsUnset, z.string().min( 32 ).optional() ),
    AGENT_TIMEOUT_MS: z.preprocess( emptyAsUnset, agentTimeoutSchema ),
    AGENT_SYLLABUS_TIMEOUT_MS: z.preprocess( emptyAsUnset, agentSyllabusTimeoutSchema ),
    // Google Calendar (ADR 0108). Without a redirect URI the feature is "not configured"
    CALENDAR_REDIRECT_URI: z.preprocess( emptyAsUnset, z.url().optional() ),
    CALENDAR_LOOKBACK_DAYS: z.preprocess( emptyAsUnset, calendarLookbackSchema ),
    CALENDAR_API_BASE_URL: z.preprocess( emptyAsUnset, z.url().optional() ),
    APP_TIME_ZONE: z.preprocess( emptyAsUnset, timeZoneSchema ),
    MELETE_DAY_START_HOUR: z.preprocess( emptyAsUnset, dayStartHourSchema ),
    MELETE_REQUEST_RETENTION: z.preprocess( emptyAsUnset, requestRetentionSchema ),
    MELETE_GRADING_TIMEOUT_MS: z.preprocess( emptyAsUnset, gradingTimeoutSchema ),
    MELETE_GENERATION_TIMEOUT_MS: z.preprocess( emptyAsUnset, generationTimeoutSchema ),
  } )
  .superRefine( ( env, context ) => {
    const problem = claudeAuthProblem( env )

    if( problem !== null ) {
      context.addIssue( { code: 'custom', path: [ problem.variable ], message: problem.message } )
    }
  } )
  .transform( ( env ) => ( {
    port: env.PORT,
    dataDir: env.DATA_DIR,
    webDir: env.WEB_DIR,
    claudeAuth: claudeAuthOf( env ),
    // Gemini (Developer API, ADR 0083) reads YouTube links; the YouTube Data API gives the metadata
    geminiModel: env.GEMINI_MODEL,
    geminiApiKey: env.GEMINI_API_KEY,
    youtubeApiKey: env.YOUTUBE_API_KEY,
    vaultsPath: env.VAULTS_PATH,
    litestreamMetricsUrl: env.LITESTREAM_METRICS_URL ?? null,
    // Test doubles for the e2e stack (ADR 0053): other hosts for Gemini and the YouTube Data API.
    // Unset in production.
    geminiBaseUrl: env.GEMINI_BASE_URL ?? null,
    youtubeApiBaseUrl: env.YOUTUBE_API_BASE_URL ?? null,
    vaultSyncStatusDir: env.VAULT_SYNC_STATUS_DIR ?? null,
    vaultCreateEnabled: env.VAULT_CREATE_ENABLED === 'true' || env.VAULT_CREATE_ENABLED === '1',
    adminEmail: env.ADMIN_EMAIL,
    appOrigins: env.APP_ORIGINS,
    sessionDays: env.SESSION_DAYS,
    // Mounts the test-only sign-in route (TRD §11.4); never set outside the e2e stack
    e2eTestSignin: env.E2E_TEST_SIGNIN === '1',
    // Turns the address guard on fetched URLs off (ADR 0096); tests and the e2e stack only
    fetchAllowPrivate: env.FETCH_ALLOW_PRIVATE === '1',
    defaultNoteFolder: env.DEFAULT_NOTE_FOLDER,
    summaryTimeoutMs: env.SUMMARY_TIMEOUT_MS,
    reviewTtlHours: env.REVIEW_TTL_HOURS,
    cleanupIntervalMinutes: env.CLEANUP_INTERVAL_MINUTES,
    statusCheckIntervalMinutes: env.STATUS_CHECK_INTERVAL_MINUTES,
    logLevel: env.LOG_LEVEL,
    // The OAuth callback is derived from the request's origin (TRD §4.2), not configured
    gmail: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      encryptionKey: env.TOKEN_ENCRYPTION_KEY,
    },
    agent: env.AGENT_SECRET === undefined
      ? null
      : { url: env.AGENT_URL, secret: env.AGENT_SECRET, timeoutMs: env.AGENT_TIMEOUT_MS },
    agentSyllabusTimeoutMs: env.AGENT_SYLLABUS_TIMEOUT_MS,
    calendar: {
      redirectUri: env.CALENDAR_REDIRECT_URI ?? null,
      lookbackDays: env.CALENDAR_LOOKBACK_DAYS,
      // Test double for the e2e stack: another host for the Calendar API. Unset in production.
      apiBaseUrl: env.CALENDAR_API_BASE_URL ?? null,
    },
    timeZone: env.APP_TIME_ZONE,
    melete: {
      requestRetention: env.MELETE_REQUEST_RETENTION,
      dayStartHour: env.MELETE_DAY_START_HOUR,
      gradingTimeoutMs: env.MELETE_GRADING_TIMEOUT_MS,
      generationTimeoutMs: env.MELETE_GENERATION_TIMEOUT_MS,
    },
  } ) )

export type Config = z.infer< typeof EnvSchema >

export const loadConfig = ( env: NodeJS.ProcessEnv ): Config => {
  const result = EnvSchema.safeParse( env )

  if( !result.success ) {
    throw new Error( `Invalid environment:\n${ z.prettifyError( result.error ) }` )
  }

  return result.data
}

// The test sign-in route hands out a session to anyone who asks, so it needs NODE_ENV=test
export const assertTestSigninAllowed = ( env: NodeJS.ProcessEnv ): void => {
  const on = env.E2E_TEST_SIGNIN !== undefined && env.E2E_TEST_SIGNIN !== ''

  if( on && env.NODE_ENV !== 'test' ) {
    throw new Error( 'E2E_TEST_SIGNIN is only allowed with NODE_ENV=test' )
  }
}

export const assertFetchAllowPrivateAllowed = ( env: NodeJS.ProcessEnv ): void => {
  const on = env.FETCH_ALLOW_PRIVATE !== undefined && env.FETCH_ALLOW_PRIVATE !== ''

  if( on && env.NODE_ENV !== 'test' ) {
    throw new Error( 'FETCH_ALLOW_PRIVATE is only allowed with NODE_ENV=test' )
  }
}

export const assertCalendarApiBaseUrlAllowed = ( env: NodeJS.ProcessEnv ): void => {
  const on = env.CALENDAR_API_BASE_URL !== undefined && env.CALENDAR_API_BASE_URL !== ''

  if( on && env.NODE_ENV !== 'test' ) {
    throw new Error( 'CALENDAR_API_BASE_URL is only allowed with NODE_ENV=test' )
  }
}

const loadConfigOrExit = ( env: NodeJS.ProcessEnv ): Config => {
  try {
    assertTestSigninAllowed( env )
    assertFetchAllowPrivateAllowed( env )
    assertCalendarApiBaseUrlAllowed( env )

    return loadConfig( env )
  } catch( error ) {
    // eslint-disable-next-line no-console -- runs before the logger, which needs the config
    console.error( error instanceof Error ? error.message : error )
    return process.exit( 1 )
  }
}

export const config: Config = loadConfigOrExit( process.env )
