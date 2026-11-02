// Node
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Packages
import { describe, it, expect } from 'vitest'
// Config
import { assertTestSigninAllowed, ignoredEnv, loadConfig } from './config.js'

const key = Buffer.alloc( 32, 7 ).toString( 'base64' )
const google = {
  GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secret',
  TOKEN_ENCRYPTION_KEY: key,
}
const base = {
  ANTHROPIC_API_KEY: 'sk-test',
  OPENAI_API_KEY: 'sk-openai',
  ADMIN_EMAIL: 'Admin@Example.com',
  APP_ORIGINS: 'http://localhost:3100',
  ...google,
}

describe( 'loadConfig', () => {
  it( 'returns the defaults for a minimal environment', () => {
    expect( loadConfig( base ) ).toEqual( {
      port: 3100,
      workDir: join( tmpdir(), 'atlas' ),
      dataDir: join( tmpdir(), 'atlas-data' ),
      webDir: undefined,
      anthropicApiKey: 'sk-test',
      openaiApiKey: 'sk-openai',
      openaiBaseUrl: 'https://api.openai.com',
      transcriptionModel: 'gpt-transcribe',
      defaultNoteFolder: 'Mnemosyne',
      summaryTimeoutMs: 300_000,
      reviewTtlHours: 24,
      cleanupIntervalMinutes: 15,
      statusCheckIntervalMinutes: 2,
      logLevel: 'info',
      gmail: {
        clientId: google.GOOGLE_CLIENT_ID,
        clientSecret: 'secret',
        encryptionKey: Buffer.alloc( 32, 7 ),
      },
      adminEmail: 'admin@example.com',
      appOrigins: [ 'http://localhost:3100' ],
      sessionDays: 30,
      e2eTestSignin: false,
      vaultsPath: '/vaults',
      litestreamMetricsUrl: null,
      agent: null,
      timeZone: 'Asia/Singapore',
      melete: {
        requestRetention: 0.9,
        dayStartHour: 4,
        gradingTimeoutMs: 20_000,
        generationTimeoutMs: 120_000,
      },
    } )
  } )

  it( 'returns overrides, with numbers as numbers', () => {
    const config = loadConfig( {
      ...base,
      VAULTS_PATH: '/Users/x/Vaults',
      LITESTREAM_METRICS_URL: 'http://litestream:9090/metrics',
      DEFAULT_NOTE_FOLDER: 'Learning/AI',
      PORT: '4000',
      OPENAI_BASE_URL: 'http://fakes:4000',
      TRANSCRIPTION_MODEL: 'gpt-transcribe-2',
      WORK_DIR: '/tmp/custom',
      DATA_DIR: '/data',
      WEB_DIR: '/srv/web',
      SUMMARY_TIMEOUT_MS: '60000',
      REVIEW_TTL_HOURS: '48',
      CLEANUP_INTERVAL_MINUTES: '5',
      STATUS_CHECK_INTERVAL_MINUTES: '3',
      APP_TIME_ZONE: 'Europe/London',
      MELETE_DAY_START_HOUR: '0',
      MELETE_REQUEST_RETENTION: '0.85',
      MELETE_GRADING_TIMEOUT_MS: '10000',
      MELETE_GENERATION_TIMEOUT_MS: '90000',
    } )

    expect( config ).toEqual( {
      port: 4000,
      workDir: '/tmp/custom',
      dataDir: '/data',
      webDir: '/srv/web',
      anthropicApiKey: 'sk-test',
      openaiApiKey: 'sk-openai',
      openaiBaseUrl: 'http://fakes:4000',
      transcriptionModel: 'gpt-transcribe-2',
      defaultNoteFolder: 'Learning/AI',
      summaryTimeoutMs: 60_000,
      reviewTtlHours: 48,
      cleanupIntervalMinutes: 5,
      statusCheckIntervalMinutes: 3,
      logLevel: 'info',
      gmail: {
        clientId: google.GOOGLE_CLIENT_ID,
        clientSecret: 'secret',
        encryptionKey: Buffer.alloc( 32, 7 ),
      },
      adminEmail: 'admin@example.com',
      appOrigins: [ 'http://localhost:3100' ],
      e2eTestSignin: false,
      sessionDays: 30,
      vaultsPath: '/Users/x/Vaults',
      litestreamMetricsUrl: 'http://litestream:9090/metrics',
      agent: null,
      timeZone: 'Europe/London',
      melete: {
        requestRetention: 0.85,
        dayStartHour: 0,
        gradingTimeoutMs: 10_000,
        generationTimeoutMs: 90_000,
      },
    } )
  } )

  it.each( [ 'fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent' ] )(
    'accepts LOG_LEVEL %s',
    ( level ) => {
      expect( loadConfig( { ...base, LOG_LEVEL: level } ).logLevel ).toBe( level )
    },
  )

  it( 'defaults LOG_LEVEL to info and treats an empty value as unset', () => {
    expect( loadConfig( base ).logLevel ).toBe( 'info' )
    expect( loadConfig( { ...base, LOG_LEVEL: '' } ).logLevel ).toBe( 'info' )
  } )

  it( 'throws naming LOG_LEVEL for an unknown level', () => {
    expect( () => loadConfig( { ...base, LOG_LEVEL: 'loud' } ) ).toThrow( 'LOG_LEVEL' )
  } )

  it( 'falls back to Mnemosyne when DEFAULT_NOTE_FOLDER is empty', () => {
    expect( loadConfig( { ...base, DEFAULT_NOTE_FOLDER: '' } ).defaultNoteFolder )
      .toBe( 'Mnemosyne' )
  } )

  it.each( [ '../x', '/abs', 'a//b', '.hidden', 'a/', 'a:b' ] )(
    'throws naming DEFAULT_NOTE_FOLDER for %j',
    ( folder ) => {
      expect( () => loadConfig( { ...base, DEFAULT_NOTE_FOLDER: folder } ) )
        .toThrow( 'DEFAULT_NOTE_FOLDER' )
    },
  )

  it( 'treats empty strings as unset', () => {
    const config = loadConfig( { ...base, PORT: '', OPENAI_BASE_URL: '' } )

    expect( config.port ).toBe( 3100 )
    expect( config.openaiBaseUrl ).toBe( 'https://api.openai.com' )
  } )

  it( 'treats an empty DATA_DIR as unset', () => {
    expect( loadConfig( { ...base, DATA_DIR: '' } ).dataDir ).toBe(
      join( tmpdir(), 'atlas-data' ),
    )
  } )

  it( 'treats an empty LITESTREAM_METRICS_URL as unset and rejects a non-URL', () => {
    expect( loadConfig( { ...base, LITESTREAM_METRICS_URL: '' } ).litestreamMetricsUrl )
      .toBeNull()
    expect( () => loadConfig( { ...base, LITESTREAM_METRICS_URL: 'litestream' } ) ).toThrow()
  } )

  it( 'falls back to the default model for an empty TRANSCRIPTION_MODEL', () => {
    expect( loadConfig( { ...base, TRANSCRIPTION_MODEL: '' } ).transcriptionModel )
      .toBe( 'gpt-transcribe' )
  } )

  it( 'reads WEB_DIR and treats an empty value as unset', () => {
    expect( loadConfig( { ...base, WEB_DIR: '/srv/web' } ).webDir ).toBe( '/srv/web' )
    expect( loadConfig( { ...base, WEB_DIR: '' } ).webDir ).toBeUndefined()
  } )

  it( 'treats empty summary and cleanup settings as unset', () => {
    const config = loadConfig( {
      ...base,
      SUMMARY_TIMEOUT_MS: '',
      REVIEW_TTL_HOURS: '',
      CLEANUP_INTERVAL_MINUTES: '',
    } )

    expect( config.cleanupIntervalMinutes ).toBe( 15 )
    expect( config.summaryTimeoutMs ).toBe( 300_000 )
    expect( config.reviewTtlHours ).toBe( 24 )
  } )

  it.each( [ 'abc', '0', '70000' ] )( 'throws naming PORT for PORT=%s', ( port ) => {
    expect( () => loadConfig( { ...base, PORT: port } ) ).toThrow( /PORT/ )
  } )

  it( 'throws naming OPENAI_BASE_URL for an invalid URL', () => {
    expect( () => loadConfig( { ...base, OPENAI_BASE_URL: 'not-a-url' } ) )
      .toThrow( /OPENAI_BASE_URL/ )
  } )

  it.each( [ undefined, '' ] )( 'throws naming OPENAI_API_KEY when it is %j', ( value ) => {
    expect( () => loadConfig( { ...base, OPENAI_API_KEY: value } ) ).toThrow( /OPENAI_API_KEY/ )
  } )

  it.each( [ undefined, '' ] )( 'throws naming ANTHROPIC_API_KEY when it is %j', ( key ) => {
    expect( () => loadConfig( { ANTHROPIC_API_KEY: key } ) ).toThrow( /ANTHROPIC_API_KEY/ )
  } )

  it( 'no longer needs VAULT_PATH', () => {
    expect( () => loadConfig( base ) ).not.toThrow()
    expect( loadConfig( { ...base, VAULT_PATH: '/vault' } ) ).not.toHaveProperty( 'vaultPath' )
  } )

  it.each( [ 'abc', '0', '-5', '1.5' ] )( 'throws naming SUMMARY_TIMEOUT_MS for %s', ( value ) => {
    expect( () => loadConfig( { ...base, SUMMARY_TIMEOUT_MS: value } ) ).toThrow(
      /SUMMARY_TIMEOUT_MS/,
    )
  } )

  it.each( [ 'abc', '0', '-1' ] )( 'throws naming REVIEW_TTL_HOURS for %s', ( value ) => {
    expect( () => loadConfig( { ...base, REVIEW_TTL_HOURS: value } ) ).toThrow( /REVIEW_TTL_HOURS/ )
  } )

  it( 'defaults STATUS_CHECK_INTERVAL_MINUTES to 2, also when it is empty', () => {
    const empty = loadConfig( { ...base, STATUS_CHECK_INTERVAL_MINUTES: '' } )

    expect( loadConfig( base ).statusCheckIntervalMinutes ).toBe( 2 )
    expect( empty.statusCheckIntervalMinutes ).toBe( 2 )
  } )

  it( 'reads STATUS_CHECK_INTERVAL_MINUTES as a number', () => {
    expect( loadConfig( { ...base, STATUS_CHECK_INTERVAL_MINUTES: '0.5' } )
      .statusCheckIntervalMinutes ).toBe( 0.5 )
  } )

  it.each( [ 'abc', '0', '-1' ] )(
    'throws naming STATUS_CHECK_INTERVAL_MINUTES for %s',
    ( value ) => {
      expect( () => loadConfig( { ...base, STATUS_CHECK_INTERVAL_MINUTES: value } ) )
        .toThrow( /STATUS_CHECK_INTERVAL_MINUTES/ )
    },
  )

  it.each( [ 'abc', '0', '-1' ] )( 'throws naming CLEANUP_INTERVAL_MINUTES for %s', ( value ) => {
    expect( () => loadConfig( { ...base, CLEANUP_INTERVAL_MINUTES: value } ) ).toThrow(
      /CLEANUP_INTERVAL_MINUTES/,
    )
  } )

  describe( 'agent', () => {
    const secret = 'a'.repeat( 32 )

    it( 'is null when AGENT_SECRET is unset or empty', () => {
      expect( loadConfig( base ).agent ).toBeNull()
      expect( loadConfig( { ...base, AGENT_SECRET: '' } ).agent ).toBeNull()
    } )

    it( 'is null without a secret even when the URL is set', () => {
      expect( loadConfig( { ...base, AGENT_URL: 'http://agent:8100' } ).agent ).toBeNull()
    } )

    it( 'uses the local URL and a two minute timeout by default', () => {
      expect( loadConfig( { ...base, AGENT_SECRET: secret } ).agent ).toEqual( {
        url: 'http://localhost:8100',
        secret,
        timeoutMs: 120_000,
      } )
    } )

    it( 'takes the URL and timeout from the environment, with empty values as unset', () => {
      expect( loadConfig( {
        ...base,
        AGENT_SECRET: secret,
        AGENT_URL: 'http://agent:8100',
        AGENT_TIMEOUT_MS: '30000',
      } ).agent ).toEqual( { url: 'http://agent:8100', secret, timeoutMs: 30_000 } )
      expect( loadConfig( {
        ...base,
        AGENT_SECRET: secret,
        AGENT_URL: '',
        AGENT_TIMEOUT_MS: '',
      } ).agent ).toEqual( { url: 'http://localhost:8100', secret, timeoutMs: 120_000 } )
    } )

    it( 'stops startup naming AGENT_SECRET when it is under 32 characters', () => {
      expect( () => loadConfig( { ...base, AGENT_SECRET: 'short' } ) )
        .toThrow( /AGENT_SECRET/ )
    } )

    it( 'does not echo the secret in the error', () => {
      expect( () => loadConfig( { ...base, AGENT_SECRET: 'too-short-secret' } ) )
        .toThrow( expect.objectContaining( {
          message: expect.not.stringContaining( 'too-short-secret' ) as string,
        } ) )
    } )

    it( 'rejects a URL that is not a URL and a timeout that is not a positive number', () => {
      expect( () => loadConfig( { ...base, AGENT_SECRET: secret, AGENT_URL: 'nope' } ) )
        .toThrow( /AGENT_URL/ )
      expect( () => loadConfig( { ...base, AGENT_SECRET: secret, AGENT_TIMEOUT_MS: '0' } ) )
        .toThrow( /AGENT_TIMEOUT_MS/ )
    } )
  } )

  describe( 'melete', () => {
    it( 'treats empty values as unset', () => {
      const config = loadConfig( {
        ...base,
        APP_TIME_ZONE: '',
        MELETE_DAY_START_HOUR: '',
        MELETE_REQUEST_RETENTION: '',
        MELETE_GRADING_TIMEOUT_MS: '',
        MELETE_GENERATION_TIMEOUT_MS: '',
      } )

      expect( config.timeZone ).toBe( 'Asia/Singapore' )
      expect( config.melete ).toEqual( {
        requestRetention: 0.9,
        dayStartHour: 4,
        gradingTimeoutMs: 20_000,
        generationTimeoutMs: 120_000,
      } )
    } )

    it.each( [ 'Mars/Base', 'nonsense', 'UTC+8 please' ] )(
      'throws naming APP_TIME_ZONE for %j',
      ( zone ) => {
        expect( () => loadConfig( { ...base, APP_TIME_ZONE: zone } ) ).toThrow( /APP_TIME_ZONE/ )
      },
    )

    it.each( [ 'UTC', 'America/New_York', 'Asia/Singapore' ] )(
      'accepts APP_TIME_ZONE %s',
      ( zone ) => {
        expect( loadConfig( { ...base, APP_TIME_ZONE: zone } ).timeZone ).toBe( zone )
      },
    )

    it.each( [ '0.7', '0.5', '1', '1.5', 'abc' ] )(
      'throws naming MELETE_REQUEST_RETENTION for %s',
      ( value ) => {
        expect( () => loadConfig( { ...base, MELETE_REQUEST_RETENTION: value } ) )
          .toThrow( /MELETE_REQUEST_RETENTION/ )
      },
    )

    it.each( [ '0.71', '0.9', '0.99' ] )( 'accepts MELETE_REQUEST_RETENTION %s', ( value ) => {
      expect( loadConfig( { ...base, MELETE_REQUEST_RETENTION: value } ).melete.requestRetention )
        .toBe( Number( value ) )
    } )

    it.each( [ '-1', '24', '1.5', 'abc' ] )(
      'throws naming MELETE_DAY_START_HOUR for %s',
      ( value ) => {
        expect( () => loadConfig( { ...base, MELETE_DAY_START_HOUR: value } ) )
          .toThrow( /MELETE_DAY_START_HOUR/ )
      },
    )

    it.each( [ '0', '4', '23' ] )( 'accepts MELETE_DAY_START_HOUR %s', ( value ) => {
      expect( loadConfig( { ...base, MELETE_DAY_START_HOUR: value } ).melete.dayStartHour )
        .toBe( Number( value ) )
    } )

    it.each( [ 'MELETE_GRADING_TIMEOUT_MS', 'MELETE_GENERATION_TIMEOUT_MS' ] )(
      'throws naming %s for zero, negative and fractional values',
      ( name ) => {
        for( const value of [ '0', '-5', '1.5', 'abc' ] ) {
          expect( () => loadConfig( { ...base, [ name ]: value } ) ).toThrow( name )
        }
      },
    )
  } )

  describe( 'sign-in', () => {
    it( 'lower-cases ADMIN_EMAIL', () => {
      expect( loadConfig( base ).adminEmail ).toBe( 'admin@example.com' )
    } )

    it.each( [ undefined, '', 'not-an-email' ] )( 'throws naming ADMIN_EMAIL for %j', ( value ) => {
      expect( () => loadConfig( { ...base, ADMIN_EMAIL: value } ) ).toThrow( /ADMIN_EMAIL/ )
    } )

    it( 'splits APP_ORIGINS on commas, normalises each and drops duplicates', () => {
      const { appOrigins } = loadConfig( {
        ...base,
        APP_ORIGINS: ' http://localhost:3100/ , https://mac.tail1234.ts.net,http://localhost:3100',
      } )

      expect( appOrigins ).toEqual( [ 'http://localhost:3100', 'https://mac.tail1234.ts.net' ] )
    } )

    it.each( [
      undefined,
      '',
      ',',
      'localhost:3100',
      'ftp://example.com',
      'http://localhost:3100/app',
      'http://localhost:3100?x=1',
      'http://a.test,,http://b.test',
    ] )( 'throws naming APP_ORIGINS for %j', ( value ) => {
      expect( () => loadConfig( { ...base, APP_ORIGINS: value } ) ).toThrow( /APP_ORIGINS/ )
    } )

    it( 'defaults SESSION_DAYS to 30, also when empty', () => {
      expect( loadConfig( base ).sessionDays ).toBe( 30 )
      expect( loadConfig( { ...base, SESSION_DAYS: '' } ).sessionDays ).toBe( 30 )
      expect( loadConfig( { ...base, SESSION_DAYS: '7' } ).sessionDays ).toBe( 7 )
    } )

    it.each( [ '0', '366', '1.5', 'abc' ] )( 'throws naming SESSION_DAYS for %s', ( value ) => {
      expect( () => loadConfig( { ...base, SESSION_DAYS: value } ) ).toThrow( /SESSION_DAYS/ )
    } )

    it( 'defaults VAULTS_PATH to /vaults and reads an override', () => {
      expect( loadConfig( base ).vaultsPath ).toBe( '/vaults' )
      expect( loadConfig( { ...base, VAULTS_PATH: '' } ).vaultsPath ).toBe( '/vaults' )
      expect( loadConfig( { ...base, VAULTS_PATH: '/Users/x/Vaults' } ).vaultsPath )
        .toBe( '/Users/x/Vaults' )
    } )
  } )

  describe( 'google', () => {
    it.each( [ 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'TOKEN_ENCRYPTION_KEY' ] )(
      'throws naming %s when it is missing or empty',
      ( name ) => {
        expect( () => loadConfig( { ...base, [ name ]: undefined } ) ).toThrow( name )
        expect( () => loadConfig( { ...base, [ name ]: '' } ) ).toThrow( name )
      },
    )

    it( 'builds the Gmail settings with the localhost callback on PORT', () => {
      const { gmail } = loadConfig( { ...base, PORT: '4000' } )

      expect( gmail ).toEqual( {
        clientId: google.GOOGLE_CLIENT_ID,
        clientSecret: 'secret',
        encryptionKey: Buffer.alloc( 32, 7 ),
      } )
      expect( gmail.encryptionKey ).toHaveLength( 32 )
    } )

    it( 'ignores GOOGLE_REDIRECT_URI, even an invalid one', () => {
      const { gmail } = loadConfig( { ...base, GOOGLE_REDIRECT_URI: 'nope' } )

      expect( gmail ).not.toHaveProperty( 'redirectUri' )
    } )

    it.each( [
      [ '31 bytes', Buffer.alloc( 31, 1 ).toString( 'base64' ) ],
      [ '33 bytes', Buffer.alloc( 33, 1 ).toString( 'base64' ) ],
      [ 'not base64', 'not base64 at all!' ],
    ] )( 'throws for a TOKEN_ENCRYPTION_KEY of %s', ( _name, value ) => {
      expect( () => loadConfig( { ...base, TOKEN_ENCRYPTION_KEY: value } ) ).toThrow(
        'TOKEN_ENCRYPTION_KEY must be 32 bytes in base64 (openssl rand -base64 32)',
      )
    } )
  } )

  describe( 'ignoredEnv', () => {
    it( 'names GOOGLE_REDIRECT_URI when it is set', () => {
      expect( ignoredEnv( { ...base, GOOGLE_REDIRECT_URI: 'http://x.test/cb' } ) )
        .toEqual( [ 'GOOGLE_REDIRECT_URI' ] )
    } )

    it( 'names VAULT_PATH when it is set', () => {
      expect( ignoredEnv( { ...base, VAULT_PATH: '/vault' } ) ).toEqual( [ 'VAULT_PATH' ] )
    } )

    it( 'names OBSIDIAN_VAULT_NAME when it is set, and the config no longer has it', () => {
      const env = { ...base, OBSIDIAN_VAULT_NAME: 'My Vault' }

      expect( ignoredEnv( env ) ).toEqual( [ 'OBSIDIAN_VAULT_NAME' ] )
      expect( loadConfig( env ) ).not.toHaveProperty( 'obsidianVaultName' )
    } )

    it.each( [
      'WHISPER_URL',
      'WHISPER_MODEL',
      'BACKUP_DIR',
      'BACKUP_HOST_PATH',
    ] )( 'names %s when it is set', ( name ) => {
      expect( ignoredEnv( { ...base, [ name ]: 'x' } ) ).toEqual( [ name ] )
    } )

    it( 'is empty when no removed variable is set, or the value is empty', () => {
      expect( ignoredEnv( base ) ).toEqual( [] )
      expect( ignoredEnv( { ...base, GOOGLE_REDIRECT_URI: '' } ) ).toEqual( [] )
    } )
  } )

  it( 'ignores unrelated variables', () => {
    expect( () => loadConfig( { ...base, HOME: '/Users/x', PATH: '/usr/bin' } ) ).not.toThrow()
  } )
} )

describe( 'E2E_TEST_SIGNIN', () => {
  it( 'is off by default and on only for 1', () => {
    expect( loadConfig( base ).e2eTestSignin ).toBe( false )
    expect( loadConfig( { ...base, E2E_TEST_SIGNIN: '' } ).e2eTestSignin ).toBe( false )
    expect( loadConfig( { ...base, E2E_TEST_SIGNIN: '1' } ).e2eTestSignin ).toBe( true )
  } )

  it( 'refuses any other value', () => {
    expect( () => loadConfig( { ...base, E2E_TEST_SIGNIN: 'true' } ) ).toThrow( /E2E_TEST_SIGNIN/ )
  } )
} )

describe( 'assertTestSigninAllowed', () => {
  it( 'passes when the flag is not set, whatever NODE_ENV is', () => {
    expect( () => assertTestSigninAllowed( { NODE_ENV: 'production' } ) ).not.toThrow()
    expect( () => assertTestSigninAllowed( {} ) ).not.toThrow()
    expect( () => assertTestSigninAllowed( { E2E_TEST_SIGNIN: '' } ) ).not.toThrow()
  } )

  it( 'passes when the flag is set and NODE_ENV is test', () => {
    expect( () => assertTestSigninAllowed( { E2E_TEST_SIGNIN: '1', NODE_ENV: 'test' } ) )
      .not.toThrow()
  } )

  it( 'refuses to start with the flag set outside NODE_ENV=test', () => {
    expect( () => assertTestSigninAllowed( { E2E_TEST_SIGNIN: '1', NODE_ENV: 'production' } ) )
      .toThrow( /E2E_TEST_SIGNIN/ )
    expect( () => assertTestSigninAllowed( { E2E_TEST_SIGNIN: '1' } ) ).toThrow( /E2E_TEST_SIGNIN/ )
  } )
} )
