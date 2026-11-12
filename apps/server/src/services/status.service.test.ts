// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Shared
import { GetStatusResponse, type StatusRow } from '@atlas/shared'
// Errors
import { NotFoundError } from '../errors.js'
// Repositories
import {
  saveCalendarAccount,
  setCalendarStatus,
} from '../repositories/calendarAccount.repository.js'
import { saveAccount, setAccountStatus } from '../repositories/gmailAccount.repository.js'
import { insertFeed } from '../repositories/feeds.repository.js'
import type { StoredFeed } from '../repositories/feeds.repository.js'
import { recordFailure, recordSuccess } from '../repositories/health.repository.js'
import { setSetting } from '../repositories/settings.repository.js'
import { updateUser } from '../repositories/users.repository.js'
// Services
import { runServiceChecks } from './health.service.js'
import { getHealthErrors, getStatus, refreshStatus } from './status.service.js'
// Test support
import { addStoredSource } from '../test-support/gmailSources.fixture.js'
// Test support
import { createTestUser, defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

const configMock = vi.hoisted( () => {
  const mock: {
    logLevel: string
    sessionDays: number
    gmail: Record< string, unknown > | null
    agent: { url: string } | null
    claudeAuth: { kind: 'api_key', key: string } | { kind: 'federation' }
    litestreamMetricsUrl: string | null
    vaultSyncStatusDir: string | null
  } = {
    logLevel: 'silent',
    sessionDays: 30,
    gmail: { clientId: 'id' },
    agent: { url: 'http://agent.test' },
    claudeAuth: { kind: 'api_key', key: 'sk-test' },
    litestreamMetricsUrl: null,
    vaultSyncStatusDir: null,
  }

  return mock
} )

vi.mock( '../config.js', () => ( { config: configMock } ) )
vi.mock( './health.service.js', () => ( { runServiceChecks: vi.fn() } ) )

const at = ( minute: number ): string => {
  return `2026-10-22T10:${ String( minute ).padStart( 2, '0' ) }:00.000Z`
}

const buildFeed = ( overrides: Partial< StoredFeed > = {} ): StoredFeed => {
  const id = overrides.id ?? crypto.randomUUID()

  return {
    id,
    url: 'https://example.com',
    feed_url: `https://example.com/${ id }.xml`,
    name: 'A blog',
    profile_id: null,
    enabled: true,
    auto_summarize: false,
    etag: null,
    last_modified: null,
    last_checked_at: null,
    last_error: null,
    last_skipped_count: 0,
    created_at: at( 0 ),
    deleted_at: null,
    ...overrides,
  }
}

const connectGmail = (): void => {
  saveAccount( userId, {
    email: 'naresh@example.com',
    refresh_token_enc: 'v1:x',
    scope: 'scope',
    status: 'connected',
    error: null,
    connected_at: at( 0 ),
  } )
}

const rowOf = (
  kind: string,
  id = kind === 'gmail_connection' ? userId : 'default',
): StatusRow => {
  const row = getStatus( userId, true )
    .rows.find( ( found ) => found.kind === kind && found.id === id )

  if( row === undefined ) {
    throw new Error( `No ${ kind } row` )
  }

  return row
}

beforeEach( () => {
  configMock.gmail = { clientId: 'id' }
  configMock.agent = { url: 'http://agent.test' }
  configMock.claudeAuth = { kind: 'api_key', key: 'sk-test' }
  configMock.litestreamMetricsUrl = null
  configMock.vaultSyncStatusDir = null
  vi.mocked( runServiceChecks ).mockReset().mockResolvedValue( undefined )
} )

describe( 'getStatus', () => {
  it( 'has the singleton rows even when nothing was ever checked', () => {
    const { rows, failing_count } = getStatus( userId, true )

    expect( rows.map( ( { kind } ) => kind ) )
      .toEqual( [ 'agent', 'transcription', 'claude', 'gmail_connection' ] )
    expect( failing_count ).toBe( 0 )
    expect( GetStatusResponse.parse( getStatus( userId, true ) ) )
      .toEqual( getStatus( userId, true ) )
  } )

  it( 'names the singletons', () => {
    expect( getStatus( userId, true ).rows.map( ( { name } ) => name ) )
      .toEqual( [
        'Agent service',
        'Transcription (Gemini)',
        'Claude API (API key)',
        'Gmail connection',
      ] )
  } )

  it( 'shows a never-checked service as ok with no times', () => {
    expect( rowOf( 'transcription' ) ).toEqual( {
      kind: 'transcription',
      id: 'default',
      name: 'Transcription (Gemini)',
      state: 'ok',
      last_checked_at: null,
      last_success_at: null,
      last_error: null,
      failing_since: null,
      detail: null,
    } )
  } )

  it( 'is failing with the error and the times when a check failed', () => {
    recordSuccess( null, 'transcription', 'default', at( 1 ) )
    recordFailure( null, 'transcription', 'default', at( 2 ), 'Could not reach Gemini' )

    expect( rowOf( 'transcription' ) ).toMatchObject( {
      state: 'failing',
      last_checked_at: at( 2 ),
      last_success_at: at( 1 ),
      last_error: 'Could not reach Gemini',
      failing_since: at( 2 ),
    } )
    expect( getStatus( userId, true ).failing_count ).toBe( 1 )
  } )

  it( 'never marks the transcription row off', () => {
    configMock.agent = null
    setSetting( userId, 'linking_enabled', false )

    expect( rowOf( 'transcription' ).state ).toBe( 'ok' )
  } )

  describe( 'agent', () => {
    it( 'is off when it is not configured', () => {
      configMock.agent = null

      expect( rowOf( 'agent' ).state ).toBe( 'off' )
    } )

    it( 'does not follow a user\'s linking switch: it is an app check', () => {
      recordFailure( null, 'agent', 'default', at( 1 ), 'down' )
      setSetting( userId, 'linking_enabled', false )

      expect( rowOf( 'agent' ) ).toMatchObject( { state: 'failing', last_error: 'down' } )
      expect( getStatus( userId, true ).failing_count ).toBe( 1 )
    } )

    it( 'shows which Claude credential the agent is using, once it has said', () => {
      recordSuccess( null, 'agent', 'default', at( 1 ), '{"credential":"federation"}' )

      expect( rowOf( 'agent' ).detail ).toBe( 'Claude credential: federation' )

      recordSuccess( null, 'agent', 'default', at( 2 ), '{"credential":"api_key"}' )

      expect( rowOf( 'agent' ).detail ).toBe( 'Claude credential: API key' )
    } )

    it( 'has no detail before the agent has said, or when it says something else', () => {
      expect( rowOf( 'agent' ).detail ).toBeNull()

      recordSuccess( null, 'agent', 'default', at( 1 ), 'not json' )

      expect( rowOf( 'agent' ).detail ).toBeNull()
    } )

    it( 'is failing when its check failed and linking is on', () => {
      recordFailure( null, 'agent', 'default', at( 1 ), 'The agent service is not reachable' )

      expect( rowOf( 'agent' ) ).toMatchObject( { state: 'failing' } )
    } )
  } )

  describe( 'claude', () => {
    it( 'is named for the credential this app uses', () => {
      expect( rowOf( 'claude' ).name ).toBe( 'Claude API (API key)' )

      configMock.claudeAuth = { kind: 'federation' }

      expect( rowOf( 'claude' ).name ).toBe( 'Claude API (federation)' )
    } )

    it( 'is ok when never checked, and never off', () => {
      expect( rowOf( 'claude' ) )
        .toMatchObject( { state: 'ok', last_checked_at: null, detail: null } )
    } )

    it( 'is failing with the check\'s message and counts as a failure', () => {
      recordFailure( null, 'claude', 'default', at( 1 ), 'AuthenticationError (status 401)' )

      expect( rowOf( 'claude' ) ).toMatchObject( {
        state: 'failing',
        last_error: 'AuthenticationError (status 401)',
      } )
      expect( getStatus( userId, true ).failing_count ).toBe( 1 )
    } )

    it( 'is hidden from a member, and its history is a 404', () => {
      const member = createTestUser().id

      recordFailure( null, 'claude', 'default', at( 1 ), 'down' )

      expect( getStatus( member, false ).rows.map( ( { kind } ) => kind ) )
        .not.toContain( 'claude' )
      expect( () => getHealthErrors( member, false, 'claude', 'default' ) ).toThrow( NotFoundError )
    } )
  } )

  describe( 'gmail connection', () => {
    it( 'is off when Gmail is not configured', () => {
      configMock.gmail = null

      expect( rowOf( 'gmail_connection' ).state ).toBe( 'off' )
    } )

    it( 'is off when no account is connected', () => {
      expect( rowOf( 'gmail_connection' ).state ).toBe( 'off' )
    } )

    it( 'is ok when connected and nothing failed', () => {
      connectGmail()

      expect( rowOf( 'gmail_connection' ) ).toMatchObject( { state: 'ok', last_error: null } )
    } )

    it( 'is failing with the account\'s error when it needs a reconnect', () => {
      connectGmail()
      setAccountStatus( userId, 'reconnect_needed', 'Google no longer accepts the access' )

      expect( rowOf( 'gmail_connection' ) ).toMatchObject( {
        state: 'failing',
        last_error: 'Google no longer accepts the access',
      } )
      expect( getStatus( userId, true ).failing_count ).toBe( 1 )
    } )

    it( 'prefers the health error when there is one', () => {
      connectGmail()
      setAccountStatus( userId, 'reconnect_needed', 'from the account' )
      recordFailure( userId, 'gmail_connection', userId, at( 3 ), 'from the check' )

      expect( rowOf( 'gmail_connection' ).last_error ).toBe( 'from the check' )
    } )
  } )

  describe( 'calendar connection', () => {
    const connectCalendar = (): void => {
      saveCalendarAccount( userId, {
        email: 'naresh@example.com',
        refresh_token_enc: 'v1:x',
        scope: 'scope',
        status: 'connected',
        error: null,
        connected_at: at( 0 ),
      } )
    }

    it( 'has no row until Calendar is connected', () => {
      expect( getStatus( userId, true ).rows.map( ( { kind } ) => kind ) )
        .not.toContain( 'calendar_connection' )
    } )

    it( 'is ok when connected and nothing failed', () => {
      connectCalendar()

      expect( rowOf( 'calendar_connection', userId ) )
        .toMatchObject( { name: 'Calendar connection', state: 'ok', last_error: null } )
    } )

    it( 'is failing with the account\'s error when the connection is broken', () => {
      connectCalendar()
      setCalendarStatus( userId, 'broken', 'Google no longer accepts the access' )

      expect( rowOf( 'calendar_connection', userId ) ).toMatchObject( {
        state: 'failing',
        last_error: 'Google no longer accepts the access',
      } )
      expect( getStatus( userId, true ).failing_count ).toBe( 1 )
    } )

    it( 'prefers the health error when there is one', () => {
      connectCalendar()
      setCalendarStatus( userId, 'broken', 'from the account' )
      recordFailure( userId, 'calendar_connection', userId, at( 3 ), 'from the check' )

      expect( rowOf( 'calendar_connection', userId ).last_error ).toBe( 'from the check' )
    } )

    it( 'is only the user\'s own', () => {
      connectCalendar()

      expect( getStatus( createTestUser().id, false ).rows.map( ( { kind } ) => kind ) )
        .not.toContain( 'calendar_connection' )
    } )

    it( 'has an error history for the user\'s own connection and not for another\'s', () => {
      connectCalendar()
      recordFailure( userId, 'calendar_connection', userId, at( 3 ), 'from the check' )

      expect( getHealthErrors( userId, false, 'calendar_connection', userId ) ).toHaveLength( 1 )
      expect( () => getHealthErrors( createTestUser().id, false, 'calendar_connection', userId ) )
        .toThrow( 'Status subject not found' )
    } )
  } )

  describe( 'replication', () => {
    const METRICS_URL = 'http://litestream:9090/metrics'

    it( 'has no row where Litestream is not configured', () => {
      expect( getStatus( userId, true ).rows.map( ( { kind } ) => kind ) )
        .not.toContain( 'replication' )
    } )

    it( 'is ok with no detail before the first sync is seen', () => {
      configMock.litestreamMetricsUrl = METRICS_URL

      expect( rowOf( 'replication' ) ).toMatchObject( {
        name: 'Replication (Litestream)',
        state: 'ok',
        detail: null,
      } )
    } )

    it( 'shows the last sync time from the check\'s detail', () => {
      configMock.litestreamMetricsUrl = METRICS_URL
      recordSuccess(
        null,
        'replication',
        'default',
        at( 5 ),
        JSON.stringify( { last_sync_at: '2026-10-22T10:02:00.000Z' } ),
      )

      expect( rowOf( 'replication' ) ).toMatchObject( {
        state: 'ok',
        detail: 'Last synced 2026-10-22 10:02 UTC',
      } )
    } )

    it( 'is failing with the message, still showing the last sync', () => {
      configMock.litestreamMetricsUrl = METRICS_URL
      recordSuccess(
        null,
        'replication',
        'default',
        at( 1 ),
        JSON.stringify( { last_sync_at: '2026-10-22T10:00:00.000Z' } ),
      )
      recordFailure( null, 'replication', 'default', at( 2 ), 'Litestream reported 1 sync error' )

      expect( rowOf( 'replication' ) ).toMatchObject( {
        state: 'failing',
        last_error: 'Litestream reported 1 sync error',
        detail: 'Last synced 2026-10-22 10:00 UTC',
      } )
    } )

    it( 'shows a detail that is not JSON as it is', () => {
      configMock.litestreamMetricsUrl = METRICS_URL
      recordSuccess( null, 'replication', 'default', at( 1 ), 'whatever' )

      expect( rowOf( 'replication' ).detail ).toBe( 'whatever' )
    } )

    it( 'is hidden from a member, and its history is a 404', () => {
      configMock.litestreamMetricsUrl = METRICS_URL
      const member = createTestUser().id

      expect( getStatus( member, false ).rows.map( ( { kind } ) => kind ) )
        .not.toContain( 'replication' )
      expect( () => getHealthErrors( member, false, 'replication', 'default' ) )
        .toThrow( NotFoundError )
    } )

    it( 'sits after the transcription row, before the connection', () => {
      configMock.litestreamMetricsUrl = METRICS_URL

      expect( getStatus( userId, true ).rows.map( ( { kind } ) => kind ) )
        .toEqual( [ 'agent', 'transcription', 'claude', 'replication', 'gmail_connection' ] )
    } )
  } )

  describe( 'feeds and Gmail sources', () => {
    it( 'lists feeds with their name, state and times', () => {
      const feed = buildFeed( { name: 'My blog' } )

      insertFeed( userId, feed )
      recordSuccess( userId, 'feed', feed.id, at( 4 ) )

      expect( rowOf( 'feed', feed.id ) ).toEqual( {
        kind: 'feed',
        id: feed.id,
        name: 'My blog',
        state: 'ok',
        last_checked_at: at( 4 ),
        last_success_at: at( 4 ),
        last_error: null,
        failing_since: null,
        detail: null,
      } )
    } )

    it( 'is ok with null times for a feed that was never checked', () => {
      const feed = buildFeed()

      insertFeed( userId, feed )

      expect( rowOf( 'feed', feed.id ) ).toMatchObject( {
        state: 'ok',
        last_checked_at: null,
        last_success_at: null,
      } )
    } )

    it( 'is failing with the error for a feed whose check failed', () => {
      const feed = buildFeed()

      insertFeed( userId, feed )
      recordFailure( userId, 'feed', feed.id, at( 4 ), 'The site answered 500' )

      expect( rowOf( 'feed', feed.id ) ).toMatchObject( {
        state: 'failing',
        last_error: 'The site answered 500',
        last_success_at: null,
      } )
    } )

    it( 'is off for a disabled feed or source, without an old error', () => {
      const feed = buildFeed( { enabled: false } )
      const source = addStoredSource( userId, { enabled: false } )

      insertFeed( userId, feed )
      recordFailure( userId, 'feed', feed.id, at( 1 ), 'x' )
      recordFailure( userId, 'gmail_source', source.id, at( 1 ), 'y' )

      expect( rowOf( 'feed', feed.id ) ).toMatchObject( { state: 'off', last_error: null } )
      expect( rowOf( 'gmail_source', source.id ) )
        .toMatchObject( { state: 'off', last_error: null } )
      expect( getStatus( userId, true ).failing_count ).toBe( 0 )
    } )

    it( 'leaves out deleted feeds and sources', () => {
      insertFeed( userId, buildFeed( { deleted_at: at( 9 ) } ) )

      expect( getStatus( userId, true ).rows.filter( ( { kind } ) => kind === 'feed' ) )
        .toEqual( [] )
    } )

    it( 'orders services, connection, Gmail sources, then feeds, each by name', () => {
      insertFeed( userId, buildFeed( { name: 'zeta' } ) )
      insertFeed( userId, buildFeed( { name: 'Alpha' } ) )
      addStoredSource( userId, { name: 'Beta alerts' } )
      addStoredSource( userId, { name: 'alpha alerts' } )

      expect( getStatus( userId, true ).rows.map( ( { kind, name } ) => `${ kind }:${ name }` ) )
        .toEqual( [
          'agent:Agent service',
          'transcription:Transcription (Gemini)',
          'claude:Claude API (API key)',
          'gmail_connection:Gmail connection',
          'gmail_source:alpha alerts',
          'gmail_source:Beta alerts',
          'feed:Alpha',
          'feed:zeta',
        ] )
    } )

    it( 'counts every failing row', () => {
      const feed = buildFeed()
      const source = addStoredSource( userId )

      insertFeed( userId, feed )
      recordFailure( userId, 'feed', feed.id, at( 1 ), 'a' )
      recordFailure( userId, 'gmail_source', source.id, at( 1 ), 'b' )
      recordFailure( null, 'transcription', 'default', at( 1 ), 'c' )

      expect( getStatus( userId, true ).failing_count ).toBe( 3 )
    } )
  } )
} )

describe( 'refreshStatus', () => {
  it( 'runs the service checks once and then returns the status', async () => {
    vi.mocked( runServiceChecks ).mockImplementation( () => {
      recordFailure( null, 'transcription', 'default', at( 7 ), 'down' )

      return Promise.resolve()
    } )

    const status = await refreshStatus( userId, true )

    expect( runServiceChecks ).toHaveBeenCalledTimes( 1 )
    expect( status.rows.find( ( { kind } ) => kind === 'transcription' )?.state ).toBe( 'failing' )
    expect( status.failing_count ).toBe( 1 )
  } )
} )

describe( 'getHealthErrors', () => {
  it( 'returns the newest errors first for a feed', () => {
    const feed = buildFeed()

    insertFeed( userId, feed )
    recordFailure( userId, 'feed', feed.id, at( 1 ), 'first' )
    recordFailure( userId, 'feed', feed.id, at( 2 ), 'second' )

    expect( getHealthErrors( userId, true, 'feed', feed.id ) ).toEqual( [
      { at: at( 2 ), message: 'second' },
      { at: at( 1 ), message: 'first' },
    ] )
  } )

  it( 'returns an empty list for a live subject with no errors', () => {
    const source = addStoredSource( userId )

    expect( getHealthErrors( userId, true, 'gmail_source', source.id ) ).toEqual( [] )
    expect( getHealthErrors( userId, true, 'transcription', 'default' ) ).toEqual( [] )
  } )

  it( 'refuses a feed or source that is unknown or deleted', () => {
    const feed = buildFeed( { deleted_at: at( 9 ) } )

    insertFeed( userId, feed )

    expect( () => getHealthErrors( userId, true, 'feed', feed.id ) ).toThrow( NotFoundError )
    expect( () => getHealthErrors( userId, true, 'feed', 'nope' ) ).toThrow( NotFoundError )
    expect( () => getHealthErrors( userId, true, 'gmail_source', 'nope' ) ).toThrow( NotFoundError )
  } )

  it( 'refuses a singleton with any id but default', () => {
    expect( () => getHealthErrors( userId, true, 'agent', 'other' ) ).toThrow( NotFoundError )
    expect( () => getHealthErrors( userId, true, 'transcription', 'x' ) ).toThrow( NotFoundError )
  } )
} )

describe( 'getStatus for two users', () => {
  it( 'shows each user only their own feeds, sources and Gmail connection', () => {
    const other = createTestUser().id

    insertFeed( userId, buildFeed( { name: 'Mine' } ) )
    insertFeed( other, buildFeed( { name: 'Theirs' } ) )
    addStoredSource( other, { name: 'Their source' } )
    connectGmail()

    const mine = getStatus( userId, true ).rows
    const theirs = getStatus( other, false ).rows

    expect( mine.map( ( { name } ) => name ) )
      .toEqual( [
        'Agent service',
        'Transcription (Gemini)',
        'Claude API (API key)',
        'Gmail connection',
        'Mine',
      ] )
    expect( theirs.map( ( { name } ) => name ) )
      .toEqual( [ 'Gmail connection', 'Their source', 'Theirs' ] )
    expect( mine.find( ( { kind } ) => kind === 'gmail_connection' ) )
      .toMatchObject( { id: userId, state: 'ok' } )
    expect( theirs.find( ( { kind } ) => kind === 'gmail_connection' ) )
      .toMatchObject( { id: other, state: 'off' } )
  } )

  it( 'refuses the errors of another user\'s feed, source or connection', () => {
    const other = createTestUser().id
    const feed = buildFeed( { name: 'Theirs' } )

    insertFeed( other, feed )

    expect( () => getHealthErrors( userId, true, 'feed', feed.id ) ).toThrow( NotFoundError )
    expect( () => getHealthErrors( userId, true, 'gmail_connection', other ) )
      .toThrow( NotFoundError )
    expect( getHealthErrors( other, false, 'feed', feed.id ) ).toEqual( [] )
    expect( getHealthErrors( other, false, 'gmail_connection', other ) ).toEqual( [] )
  } )
} )

describe( 'the app rows belong to the admin', () => {
  it( 'hides the agent and transcription from a member, and their failures', () => {
    const member = createTestUser().id

    recordFailure( null, 'transcription', 'default', at( 1 ), 'down' )

    expect( getStatus( member, false ).rows.map( ( { kind } ) => kind ) )
      .toEqual( [ 'gmail_connection' ] )
    expect( getStatus( member, false ).failing_count ).toBe( 0 )
    expect( getStatus( userId, true ).failing_count ).toBe( 1 )
  } )

  it( 'counts only the failures the caller can see', () => {
    const member = createTestUser().id

    insertFeed( member, buildFeed( { name: 'Theirs' } ) )
    insertFeed( userId, buildFeed( { name: 'Mine' } ) )
    recordFailure( member, 'feed', getStatus( member, false ).rows[ 1 ]?.id ?? '', at( 1 ), 'x' )

    expect( getStatus( member, false ).failing_count ).toBe( 1 )
    expect( getStatus( userId, true ).failing_count ).toBe( 0 )
  } )

  it( 'runs the app checks only when the admin refreshes', async () => {
    const member = createTestUser().id

    await refreshStatus( member, false )

    expect( runServiceChecks ).not.toHaveBeenCalled()

    await refreshStatus( userId, true )

    expect( runServiceChecks ).toHaveBeenCalledOnce()
  } )

  it( 'gives a member nothing about an app subject, and the admin its history', () => {
    const member = createTestUser().id

    recordFailure( null, 'agent', 'default', at( 1 ), 'down' )

    expect( () => getHealthErrors( member, false, 'agent', 'default' ) ).toThrow( NotFoundError )
    expect( () => getHealthErrors( member, false, 'transcription', 'default' ) )
      .toThrow( NotFoundError )
    expect( getHealthErrors( userId, true, 'agent', 'default' ) )
      .toEqual( [ { at: at( 1 ), message: 'down' } ] )
  } )
} )

describe( 'vault sync rows', () => {
  const named = ( name: string, vaultDir: string | null ): string => {
    const id = createTestUser( { vault_dir: vaultDir } ).id

    updateUser( id, { name } )

    return id
  }

  beforeEach( () => {
    configMock.vaultSyncStatusDir = '/sync-status'
  } )

  it( 'has no row anywhere where VAULT_SYNC_STATUS_DIR is not set', () => {
    configMock.vaultSyncStatusDir = null
    const member = named( 'Alex', 'alex' )

    expect( getStatus( member, false ).rows.map( ( { kind } ) => kind ) )
      .toEqual( [ 'gmail_connection' ] )
    expect( getStatus( userId, true ).rows.map( ( { kind } ) => kind ) )
      .not.toContain( 'vault_sync' )
  } )

  it( 'gives a member their own row, by their vault folder, and nobody else\'s', () => {
    const alex = named( 'Alex', 'alex' )

    named( 'Sam', 'sam' )
    recordSuccess( alex, 'vault_sync', 'alex', at( 1 ) )

    const rows = getStatus( alex, false ).rows.filter( ( { kind } ) => kind === 'vault_sync' )

    expect( rows ).toEqual( [ expect.objectContaining( {
      kind: 'vault_sync',
      id: 'alex',
      name: 'Vault sync',
      state: 'ok',
    } ) ] )
  } )

  it( 'gives a user with no vault no row', () => {
    const member = named( 'Alex', null )

    expect( getStatus( member, false ).rows.map( ( { kind } ) => kind ) )
      .toEqual( [ 'gmail_connection' ] )
  } )

  it( 'shows a failing sync with its message', () => {
    const alex = named( 'Alex', 'alex' )

    recordFailure( alex, 'vault_sync', 'alex', at( 2 ), 'Login expired' )

    expect( getStatus( alex, false ).rows.find( ( { kind } ) => kind === 'vault_sync' ) )
      .toMatchObject( { state: 'failing', last_error: 'Login expired' } )
    expect( getStatus( alex, false ).failing_count ).toBe( 1 )
  } )

  it( 'gives the admin every user\'s row, each with the user\'s name, ordered by name', () => {
    const sam = named( 'Sam', 'sam' )
    const alex = named( 'Alex', 'alex' )

    updateUser( userId, { name: 'Naresh' } )
    recordSuccess( alex, 'vault_sync', 'alex', at( 1 ) )
    recordFailure( sam, 'vault_sync', 'sam', at( 2 ), 'Login expired' )
    named( 'Nobody', null )

    const rows = getStatus( userId, true ).rows.filter( ( { kind } ) => kind === 'vault_sync' )

    expect( rows.map( ( { id, name, state } ) => ( { id, name, state } ) ) ).toEqual( [
      { id: 'alex', name: 'Vault sync: Alex', state: 'ok' },
      { id: 'vault', name: 'Vault sync: Naresh', state: 'ok' },
      { id: 'sam', name: 'Vault sync: Sam', state: 'failing' },
    ] )
    expect( getStatus( userId, true ).failing_count ).toBe( 1 )
  } )

  it( 'leaves out a removed user\'s row', () => {
    const alex = named( 'Alex', 'alex' )

    updateUser( alex, { status: 'removed' } )

    expect( getStatus( userId, true ).rows.map( ( { id } ) => id ) ).not.toContain( 'alex' )
  } )

  it( 'answers a member for their own error history only', () => {
    const alex = named( 'Alex', 'alex' )
    const sam = named( 'Sam', 'sam' )

    recordFailure( alex, 'vault_sync', 'alex', at( 1 ), 'Login expired' )
    recordFailure( sam, 'vault_sync', 'sam', at( 1 ), 'Other' )

    expect( getHealthErrors( alex, false, 'vault_sync', 'alex' ) )
      .toEqual( [ { at: at( 1 ), message: 'Login expired' } ] )
    expect( () => getHealthErrors( alex, false, 'vault_sync', 'sam' ) ).toThrow( NotFoundError )
    expect( () => getHealthErrors( alex, false, 'vault_sync', 'nope' ) ).toThrow( NotFoundError )
  } )

  it( 'answers the admin for any user\'s history', () => {
    const sam = named( 'Sam', 'sam' )

    recordFailure( sam, 'vault_sync', 'sam', at( 1 ), 'Other' )

    expect( getHealthErrors( userId, true, 'vault_sync', 'sam' ) )
      .toEqual( [ { at: at( 1 ), message: 'Other' } ] )
    expect( () => getHealthErrors( userId, true, 'vault_sync', 'nope' ) ).toThrow( NotFoundError )
  } )

  it( 'answers 404 for the history where it is not configured', () => {
    configMock.vaultSyncStatusDir = null
    const alex = named( 'Alex', 'alex' )

    expect( () => getHealthErrors( alex, false, 'vault_sync', 'alex' ) ).toThrow( NotFoundError )
  } )
} )
