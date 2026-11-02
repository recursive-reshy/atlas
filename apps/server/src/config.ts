// Node
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import { z } from 'zod'
// Shared
import { isValidFolderName } from '@atlas/shared'

const emptyAsUnset = ( value: unknown ): unknown => ( value === '' ? undefined : value )

const defaultWorkDir = join( tmpdir(), 'atlas' )
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
]

export const ignoredEnv = ( env: NodeJS.ProcessEnv ): string[] => {
  return IGNORED_VARIABLES.filter( ( name ) => env[ name ] !== undefined && env[ name ] !== '' )
}

const EnvSchema = z
  .object( {
    PORT: z.preprocess( emptyAsUnset, portSchema ),
    WORK_DIR: z.preprocess( emptyAsUnset, z.string().min( 1 ).default( defaultWorkDir ) ),
    DATA_DIR: z.preprocess( emptyAsUnset, z.string().min( 1 ).default( defaultDataDir ) ),
    WEB_DIR: z.preprocess( emptyAsUnset, z.string().min( 1 ).optional() ),
    ANTHROPIC_API_KEY: z.string().min( 1 ),
    OPENAI_API_KEY: z.string().min( 1 ),
    LITESTREAM_METRICS_URL: z.preprocess( emptyAsUnset, z.url().optional() ),
    VAULT_SYNC_STATUS_DIR: z.preprocess( emptyAsUnset, z.string().min( 1 ).optional() ),
    OPENAI_BASE_URL: z.preprocess( emptyAsUnset, z.url().default( 'https://api.openai.com' ) ),
    TRANSCRIPTION_MODEL: z.preprocess(
      emptyAsUnset,
      z.string().min( 1 ).default( 'gpt-transcribe' ),
    ),
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
    VAULTS_PATH: z.preprocess( emptyAsUnset, z.string().min( 1 ).default( '/vaults' ) ),
    GOOGLE_CLIENT_ID: z.string().min( 1 ),
    GOOGLE_CLIENT_SECRET: z.string().min( 1 ),
    TOKEN_ENCRYPTION_KEY: encryptionKeySchema,
    AGENT_URL: z.preprocess( emptyAsUnset, z.url().default( 'http://localhost:8100' ) ),
    AGENT_SECRET: z.preprocess( emptyAsUnset, z.string().min( 32 ).optional() ),
    AGENT_TIMEOUT_MS: z.preprocess( emptyAsUnset, agentTimeoutSchema ),
    APP_TIME_ZONE: z.preprocess( emptyAsUnset, timeZoneSchema ),
    MELETE_DAY_START_HOUR: z.preprocess( emptyAsUnset, dayStartHourSchema ),
    MELETE_REQUEST_RETENTION: z.preprocess( emptyAsUnset, requestRetentionSchema ),
    MELETE_GRADING_TIMEOUT_MS: z.preprocess( emptyAsUnset, gradingTimeoutSchema ),
    MELETE_GENERATION_TIMEOUT_MS: z.preprocess( emptyAsUnset, generationTimeoutSchema ),
  } )
  .transform( ( env ) => ( {
    port: env.PORT,
    workDir: env.WORK_DIR,
    dataDir: env.DATA_DIR,
    webDir: env.WEB_DIR,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiBaseUrl: env.OPENAI_BASE_URL,
    transcriptionModel: env.TRANSCRIPTION_MODEL,
    vaultsPath: env.VAULTS_PATH,
    litestreamMetricsUrl: env.LITESTREAM_METRICS_URL ?? null,
    vaultSyncStatusDir: env.VAULT_SYNC_STATUS_DIR ?? null,
    adminEmail: env.ADMIN_EMAIL,
    appOrigins: env.APP_ORIGINS,
    sessionDays: env.SESSION_DAYS,
    // Mounts the test-only sign-in route (TRD §11.4); never set outside the e2e stack
    e2eTestSignin: env.E2E_TEST_SIGNIN === '1',
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

const loadConfigOrExit = ( env: NodeJS.ProcessEnv ): Config => {
  try {
    assertTestSigninAllowed( env )

    return loadConfig( env )
  } catch( error ) {
    // eslint-disable-next-line no-console -- runs before the logger, which needs the config
    console.error( error instanceof Error ? error.message : error )
    return process.exit( 1 )
  }
}

export const config: Config = loadConfigOrExit( process.env )
