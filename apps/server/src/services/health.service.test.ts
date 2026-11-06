// Node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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
// Clients
import { checkHealth } from '../clients/agent.client.js'
import { fetchReplicationMetrics } from '../clients/litestreamMetrics.client.js'
import { checkGeminiModel } from '../clients/gemini.client.js'
// Logging
import { logger } from '../logger.js'
// Repositories
import { getHealth, listErrors, recordFailure } from '../repositories/health.repository.js'
import { getDatabase } from '../repositories/database.js'
import { updateUser } from '../repositories/users.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
// Services
import {
  pruneHealth,
  recordCheck,
  resetReplicationCheck,
  runServiceChecks,
} from './health.service.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const configMock = vi.hoisted( () => ( {
  logLevel: 'silent',
  sessionDays: 30,
  geminiModel: 'test-gemini',
  geminiApiKey: 'test-gemini-key',
  geminiBaseUrl: null,
  agent: null as { url: string } | null,
  litestreamMetricsUrl: null as string | null,
  vaultSyncStatusDir: null as string | null,
} ) )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( '../clients/agent.client.js', () => ( { checkHealth: vi.fn() } ) )
vi.mock( '../clients/litestreamMetrics.client.js', () => ( { fetchReplicationMetrics: vi.fn() } ) )
vi.mock( '../clients/gemini.client.js', () => ( {
  checkGeminiModel: vi.fn(),
} ) )

beforeEach( () => {
  configMock.agent = { url: 'http://agent.test:8100' }
  configMock.litestreamMetricsUrl = null
  configMock.vaultSyncStatusDir = null
  resetReplicationCheck()
  vi.mocked( fetchReplicationMetrics ).mockReset()
  vi.mocked( checkHealth ).mockReset().mockResolvedValue( 'ok' )
  vi.mocked( checkGeminiModel ).mockReset().mockResolvedValue( undefined )
} )

afterEach( () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
} )

describe( 'recordCheck', () => {
  it( 'records a success at the time it is given', () => {
    recordCheck( userId, { kind: 'feed', id: 'f1' }, { ok: true }, '2026-10-22T10:00:00.000Z' )

    expect( getHealth( userId, 'feed', 'f1' ) ).toMatchObject( {
      last_checked_at: '2026-10-22T10:00:00.000Z',
      last_success_at: '2026-10-22T10:00:00.000Z',
      last_error: null,
    } )
  } )

  it( 'stamps the current time when none is given', () => {
    vi.useFakeTimers()
    vi.setSystemTime( new Date( '2026-10-22T11:30:00.000Z' ) )

    recordCheck( null, { kind: 'agent', id: 'default' }, { ok: true } )

    expect( getHealth( null, 'agent', 'default' )?.last_checked_at )
      .toBe( '2026-10-22T11:30:00.000Z' )
  } )

  it( 'passes the detail of a success on', () => {
    recordCheck(
      null,
      { kind: 'replication', id: 'default' },
      { ok: true, detail: '{"last_sync_at":"2026-10-22T10:00:00.000Z"}' },
    )

    expect( getHealth( null, 'replication', 'default' )?.detail )
      .toBe( '{"last_sync_at":"2026-10-22T10:00:00.000Z"}' )
  } )

  it( 'records a failure with its message and history', () => {
    recordCheck( userId, { kind: 'feed', id: 'f1' }, { ok: false, message: 'HTTP 500' } )

    expect( getHealth( userId, 'feed', 'f1' )?.last_error ).toBe( 'HTTP 500' )
    expect( listErrors( userId, 'feed', 'f1' ).map( ( { message } ) => message ) )
      .toEqual( [ 'HTTP 500' ] )
  } )

  it( 'logs a failure at warn with the subject, and a success not at all', () => {
    const warn = vi.spyOn( logger, 'warn' ).mockImplementation( () => undefined )

    recordCheck( userId, { kind: 'feed', id: 'f1' }, { ok: true } )
    expect( warn ).not.toHaveBeenCalled()

    recordCheck( null, { kind: 'transcription', id: 'default' }, { ok: false, message: 'refused' } )

    expect( warn ).toHaveBeenCalledWith(
      { kind: 'transcription', subject_id: 'default' },
      'Health check failed',
    )
  } )
} )

describe( 'runServiceChecks', () => {
  it( 'records the agent and the transcription model as ok, asking the agent afresh', async () => {
    await runServiceChecks()

    expect( checkHealth ).toHaveBeenCalledWith( { fresh: true } )
    expect( checkGeminiModel ).toHaveBeenCalledWith( expect.objectContaining( {
      model: 'test-gemini',
      apiKey: 'test-gemini-key',
    } ) )
    expect( getHealth( null, 'agent', 'default' ) ).toMatchObject( { last_error: null } )
    expect( getHealth( null, 'agent', 'default' )?.last_success_at ).not.toBeNull()
    expect( getHealth( null, 'transcription', 'default' ) ).toMatchObject( { last_error: null } )
    expect( getHealth( null, 'transcription', 'default' )?.last_success_at ).not.toBeNull()
  } )

  it( 'records an unavailable agent as failing', async () => {
    vi.mocked( checkHealth ).mockResolvedValue( 'unavailable' )

    await runServiceChecks()

    expect( getHealth( null, 'agent', 'default' )?.last_error )
      .toBe( 'The agent service is not reachable' )
    expect( getHealth( null, 'transcription', 'default' )?.last_error ).toBeNull()
  } )

  it( 'records Gemini\'s message when the model check fails', async () => {
    vi.mocked( checkGeminiModel ).mockRejectedValue(
      new Error( 'Gemini model check failed (404): Publisher Model not found.' ),
    )

    await runServiceChecks()

    expect( getHealth( null, 'transcription', 'default' )?.last_error )
      .toBe( 'Gemini model check failed (404): Publisher Model not found.' )
    expect( getHealth( null, 'agent', 'default' )?.last_error ).toBeNull()
  } )

  it( 'skips the agent when it is not configured', async () => {
    configMock.agent = null

    await runServiceChecks()

    expect( checkHealth ).not.toHaveBeenCalled()
    expect( getHealth( null, 'agent', 'default' ) ).toBeUndefined()
    expect( getHealth( null, 'transcription', 'default' ) ).toBeDefined()
  } )

  it( 'still checks the agent when a user switched linking off', async () => {
    setSetting( userId, 'linking_enabled', false )

    await runServiceChecks()

    expect( checkHealth ).toHaveBeenCalled()
    expect( getHealth( null, 'agent', 'default' ) ).toMatchObject( { last_error: null } )
  } )

  it( 'still checks the transcription model when the agent check throws', async () => {
    vi.mocked( checkHealth ).mockRejectedValue( new Error( 'boom' ) )

    await runServiceChecks()

    expect( getHealth( null, 'agent', 'default' )?.last_error ).toBe( 'boom' )
    expect( getHealth( null, 'transcription', 'default' ) ).toBeDefined()
  } )
} )

describe( 'the replication check', () => {
  const METRICS_URL = 'http://litestream:9090/metrics'
  const sample = ( syncCount: number, syncErrors: number ): void => {
    vi.mocked( fetchReplicationMetrics ).mockResolvedValueOnce( { syncCount, syncErrors } )
  }

  beforeEach( () => {
    configMock.litestreamMetricsUrl = METRICS_URL
    vi.useFakeTimers()
    vi.setSystemTime( new Date( '2026-10-22T10:00:00.000Z' ) )
  } )

  afterEach( () => {
    vi.useRealTimers()
  } )

  it( 'is not run, and records nothing, without LITESTREAM_METRICS_URL', async () => {
    configMock.litestreamMetricsUrl = null

    await runServiceChecks()

    expect( fetchReplicationMetrics ).not.toHaveBeenCalled()
    expect( getHealth( null, 'replication', 'default' ) ).toBeUndefined()
  } )

  it( 'asks the configured URL and passes on the first sample, with no last sync yet', async () => {
    sample( 50, 0 )

    await runServiceChecks()

    expect( fetchReplicationMetrics ).toHaveBeenCalledWith( METRICS_URL )
    expect( getHealth( null, 'replication', 'default' ) )
      .toMatchObject( { last_error: null, detail: null } )
    expect( getHealth( null, 'replication', 'default' )?.last_success_at ).not.toBeNull()
  } )

  it( 'passes first even when the counter already holds old errors', async () => {
    sample( 50, 9 )

    await runServiceChecks()

    expect( getHealth( null, 'replication', 'default' )?.last_error ).toBeNull()
  } )

  it( 'records when the sync count rose as the last sync', async () => {
    sample( 50, 0 )
    await runServiceChecks()

    vi.setSystemTime( new Date( '2026-10-22T10:02:00.000Z' ) )
    sample( 52, 0 )
    await runServiceChecks()

    expect( getHealth( null, 'replication', 'default' )?.detail )
      .toBe( '{"last_sync_at":"2026-10-22T10:02:00.000Z"}' )
  } )

  it( 'keeps the last sync time, and stays ok, while nothing new is synced', async () => {
    sample( 50, 0 )
    await runServiceChecks()
    vi.setSystemTime( new Date( '2026-10-22T10:02:00.000Z' ) )
    sample( 52, 0 )
    await runServiceChecks()

    vi.setSystemTime( new Date( '2026-10-22T14:00:00.000Z' ) )
    sample( 52, 0 )
    await runServiceChecks()

    expect( getHealth( null, 'replication', 'default' ) ).toMatchObject( {
      last_error: null,
      detail: '{"last_sync_at":"2026-10-22T10:02:00.000Z"}',
    } )
  } )

  it( 'fails when the error counter rose since the previous check', async () => {
    sample( 50, 1 )
    await runServiceChecks()
    sample( 55, 4 )
    await runServiceChecks()

    expect( getHealth( null, 'replication', 'default' )?.last_error )
      .toBe( 'Litestream reported 3 sync errors since the last check' )
  } )

  it( 'says "error" for one, and recovers when no further errors come', async () => {
    sample( 50, 1 )
    await runServiceChecks()
    sample( 51, 2 )
    await runServiceChecks()

    expect( getHealth( null, 'replication', 'default' )?.last_error )
      .toBe( 'Litestream reported 1 sync error since the last check' )

    sample( 52, 2 )
    await runServiceChecks()

    expect( getHealth( null, 'replication', 'default' )?.last_error ).toBeNull()
  } )

  it( 'treats a restart of Litestream (counters back to zero) as no error', async () => {
    sample( 500, 7 )
    await runServiceChecks()
    sample( 3, 0 )
    await runServiceChecks()

    expect( getHealth( null, 'replication', 'default' )?.last_error ).toBeNull()
  } )

  it( 'fails with the reason when the metrics cannot be read', async () => {
    vi.mocked( fetchReplicationMetrics ).mockRejectedValueOnce(
      new Error( 'Could not reach Litestream\'s metrics: ECONNREFUSED' ),
    )

    await runServiceChecks()

    expect( getHealth( null, 'replication', 'default' )?.last_error )
      .toBe( 'Could not reach Litestream\'s metrics: ECONNREFUSED' )
  } )

  it( 'does not stop the other checks when it fails', async () => {
    vi.mocked( fetchReplicationMetrics ).mockRejectedValueOnce( new Error( 'down' ) )

    await runServiceChecks()

    expect( getHealth( null, 'transcription', 'default' )?.last_error ).toBeNull()
    expect( getHealth( null, 'agent', 'default' )?.last_error ).toBeNull()
  } )
} )

describe( 'the vault sync check', () => {
  const NOW = new Date( '2026-10-22T10:00:00.000Z' )
  let directory = ''

  const writeStatus = ( vaultDir: string, overrides: Record< string, unknown > = {} ): void => {
    writeFileSync( join( directory, `${ vaultDir }.json` ), JSON.stringify( {
      state: 'running',
      since: '2026-10-22T08:00:00.000Z',
      heartbeat_at: '2026-10-22T09:59:30.000Z',
      last_error: null,
      cli_version: '1.2.3',
      ...overrides,
    } ) )
  }
  const userWithVault = ( vaultDir: string | null ): string => {
    return createTestUser( { vault_dir: vaultDir } ).id
  }

  beforeEach( () => {
    directory = mkdtempSync( join( tmpdir(), 'atlas-sync-status-' ) )
    configMock.vaultSyncStatusDir = directory
    vi.useFakeTimers( { toFake: [ 'Date' ], now: NOW } )
  } )

  afterEach( () => {
    vi.useRealTimers()
    rmSync( directory, { recursive: true, force: true } )
  } )

  it( 'is not run, and records nothing, without VAULT_SYNC_STATUS_DIR', async () => {
    const user = userWithVault( 'alex' )

    configMock.vaultSyncStatusDir = null
    await runServiceChecks()

    expect( getHealth( user, 'vault_sync', 'alex' ) ).toBeUndefined()
  } )

  it( 'passes a fresh running file, for the user whose vault it is', async () => {
    const user = userWithVault( 'alex' )

    writeStatus( 'alex' )
    await runServiceChecks()

    expect( getHealth( user, 'vault_sync', 'alex' ) )
      .toMatchObject( { last_error: null, last_checked_at: NOW.toISOString() } )
    expect( getHealth( user, 'vault_sync', 'alex' )?.last_success_at ).not.toBeNull()
  } )

  it( 'passes a starting file', async () => {
    const user = userWithVault( 'alex' )

    writeStatus( 'alex', { state: 'starting' } )
    await runServiceChecks()

    expect( getHealth( user, 'vault_sync', 'alex' )?.last_error ).toBeNull()
  } )

  it( 'checks each user with a vault and none without one', async () => {
    const first = userWithVault( 'alex' )
    const second = userWithVault( 'sam' )
    const none = userWithVault( null )

    writeStatus( 'alex' )
    writeStatus( 'sam', { state: 'failed', last_error: 'Login expired' } )
    await runServiceChecks()

    expect( getHealth( first, 'vault_sync', 'alex' )?.last_error ).toBeNull()
    expect( getHealth( second, 'vault_sync', 'sam' )?.last_error ).toBe( 'Login expired' )
    expect( getDatabase().prepare( 'SELECT user_id FROM health_status WHERE kind = ?' )
      .pluck().all( 'vault_sync' ) ).not.toContain( none )
  } )

  it( 'skips a removed user', async () => {
    const user = userWithVault( 'alex' )

    updateUser( user, { status: 'removed' } )
    writeStatus( 'alex' )
    await runServiceChecks()

    expect( getHealth( user, 'vault_sync', 'alex' ) ).toBeUndefined()
  } )

  it( 'fails when the file is missing', async () => {
    const user = userWithVault( 'alex' )

    await runServiceChecks()

    expect( getHealth( user, 'vault_sync', 'alex' )?.last_error )
      .toBe( 'No sync status found for this vault' )
  } )

  it( 'fails when the file is not JSON or not the right shape', async () => {
    const first = userWithVault( 'alex' )
    const second = userWithVault( 'sam' )

    writeFileSync( join( directory, 'alex.json' ), '{ not json' )
    writeFileSync( join( directory, 'sam.json' ), JSON.stringify( { state: 'paused' } ) )
    await runServiceChecks()

    expect( getHealth( first, 'vault_sync', 'alex' )?.last_error )
      .toBe( 'The sync status file could not be read' )
    expect( getHealth( second, 'vault_sync', 'sam' )?.last_error )
      .toBe( 'The sync status file could not be read' )
  } )

  it( 'fails with the last error of a failed sync, or a default without one', async () => {
    const first = userWithVault( 'alex' )
    const second = userWithVault( 'sam' )

    writeStatus( 'alex', { state: 'failed', last_error: 'Sync server unreachable' } )
    writeStatus( 'sam', { state: 'failed', last_error: null } )
    await runServiceChecks()

    expect( getHealth( first, 'vault_sync', 'alex' )?.last_error ).toBe( 'Sync server unreachable' )
    expect( getHealth( second, 'vault_sync', 'sam' )?.last_error ).toBe( 'Sync has failed' )
  } )

  it( 'fails on a heartbeat older than five minutes, whatever the state says', async () => {
    const user = userWithVault( 'alex' )

    writeStatus( 'alex', { heartbeat_at: '2026-10-22T09:54:59.000Z' } )
    await runServiceChecks()

    expect( getHealth( user, 'vault_sync', 'alex' )?.last_error )
      .toBe( 'The sync container has stopped' )
  } )

  it( 'passes at exactly five minutes', async () => {
    const user = userWithVault( 'alex' )

    writeStatus( 'alex', { heartbeat_at: '2026-10-22T09:55:00.000Z' } )
    await runServiceChecks()

    expect( getHealth( user, 'vault_sync', 'alex' )?.last_error ).toBeNull()
  } )
} )

describe( 'pruneHealth', () => {
  const insertOld = ( kind: string ): void => {
    getDatabase().prepare( `INSERT INTO health_status ( user_id, kind, subject_id )
      VALUES ( NULL, ?, 'default' )` ).run( kind )
  }

  it( 'keeps the rows of the checks that always run', () => {
    recordFailure( null, 'transcription', 'default', '2026-10-22T10:00:00.000Z', 'down' )

    pruneHealth()

    expect( getDatabase().prepare( 'SELECT kind FROM health_status' ).pluck().all() )
      .toEqual( [ 'transcription' ] )
    expect( listErrors( null, 'transcription', 'default' ) ).toHaveLength( 1 )
  } )

  it( 'deletes the replication row where it is not configured and keeps it where it is', () => {
    insertOld( 'replication' )
    pruneHealth()
    expect( getHealth( null, 'replication', 'default' ) ).toBeUndefined()

    configMock.litestreamMetricsUrl = 'http://litestream:9090/metrics'
    insertOld( 'replication' )
    pruneHealth()
    expect( getHealth( null, 'replication', 'default' ) ).toBeDefined()
  } )

  it( 'keeps vault sync rows only where VAULT_SYNC_STATUS_DIR is set', () => {
    const user = createTestUser( { vault_dir: 'alex' } ).id

    recordFailure( user, 'vault_sync', 'alex', '2026-10-22T10:00:00.000Z', 'x' )
    pruneHealth()
    expect( getHealth( user, 'vault_sync', 'alex' ) ).toBeUndefined()

    configMock.vaultSyncStatusDir = '/sync-status'
    recordFailure( user, 'vault_sync', 'alex', '2026-10-22T10:00:00.000Z', 'x' )
    pruneHealth()
    expect( getHealth( user, 'vault_sync', 'alex' ) ).toBeDefined()
  } )
} )
