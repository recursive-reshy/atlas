// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Shared
import { GetHealthErrorsResponse, GetStatusResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Test support
import { createTestUser, signedInRequest as request } from '../test-support/auth.js'
// Repositories
import { insertFeed } from '../repositories/feeds.repository.js'
import { recordFailure } from '../repositories/health.repository.js'
// Services
import { runServiceChecks } from '../services/health.service.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../services/health.service.js', async ( importOriginal ) => ( {
  ...await importOriginal< typeof import( '../services/health.service.js' ) >(),
  runServiceChecks: vi.fn(),
} ) )

const feedId = '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b'

const at = ( minute: number ): string => {
  return `2026-10-22T10:${ String( minute ).padStart( 2, '0' ) }:00.000Z`
}

const addFeed = (): void => {
  insertFeed( userId, {
    id: feedId,
    url: 'https://example.com',
    feed_url: 'https://example.com/feed.xml',
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
  } )
}

beforeEach( () => {
  vi.mocked( runServiceChecks ).mockReset().mockResolvedValue( undefined )
} )

describe( 'GET /api/status', () => {
  it( 'returns rows and the failing count in the shared shape', async () => {
    addFeed()
    recordFailure( userId, 'feed', feedId, at( 1 ), 'The site answered 500' )

    const response = await request( app ).get( '/api/status' )
    const body = GetStatusResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( body.failing_count ).toBe( 1 )
    expect( body.rows.find( ( { kind } ) => kind === 'feed' ) ).toMatchObject( {
      id: feedId,
      name: 'A blog',
      state: 'failing',
      last_error: 'The site answered 500',
    } )
  } )

  it( 'does not run any check', async () => {
    await request( app ).get( '/api/status' )

    expect( runServiceChecks ).not.toHaveBeenCalled()
  } )
} )

describe( 'POST /api/status/refresh', () => {
  it( 'runs the service checks once and returns the status', async () => {
    vi.mocked( runServiceChecks ).mockImplementation( () => {
      recordFailure( null, 'whisper', 'default', at( 2 ), 'down' )

      return Promise.resolve()
    } )

    const response = await request( app ).post( '/api/status/refresh' )
    const body = GetStatusResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( runServiceChecks ).toHaveBeenCalledTimes( 1 )
    expect( body.rows.find( ( { kind } ) => kind === 'whisper' )?.state ).toBe( 'failing' )
    expect( body.failing_count ).toBe( 1 )
  } )
} )

describe( 'GET /api/status/:kind/:id/errors', () => {
  it( 'returns the errors newest first', async () => {
    addFeed()
    recordFailure( userId, 'feed', feedId, at( 1 ), 'first' )
    recordFailure( userId, 'feed', feedId, at( 2 ), 'second' )

    const response = await request( app ).get( `/api/status/feed/${ feedId }/errors` )

    expect( response.status ).toBe( 200 )
    expect( GetHealthErrorsResponse.parse( response.body ).errors ).toEqual( [
      { at: at( 2 ), message: 'second' },
      { at: at( 1 ), message: 'first' },
    ] )
  } )

  it( 'keeps only the last 5', async () => {
    for( let minute = 1; minute <= 8; minute += 1 ) {
      recordFailure( null, 'whisper', 'default', at( minute ), `error ${ minute }` )
    }

    const response = await request( app ).get( '/api/status/whisper/default/errors' )

    expect( GetHealthErrorsResponse.parse( response.body ).errors ).toHaveLength( 5 )
  } )

  it( 'answers 400 for an unknown kind', async () => {
    const response = await request( app ).get( '/api/status/vault/default/errors' )

    expect( response.status ).toBe( 400 )
  } )

  it( 'answers 404 for a subject that does not exist', async () => {
    const feed = await request( app ).get( `/api/status/feed/${ feedId }/errors` )
    const singleton = await request( app ).get( '/api/status/agent/other/errors' )

    expect( feed.status ).toBe( 404 )
    expect( singleton.status ).toBe( 404 )
  } )
} )

describe( 'the status of a member', () => {
  it( 'shows only the member\'s own rows', async () => {
    const member = createTestUser()

    addFeed()
    recordFailure( null, 'whisper', 'default', at( 1 ), 'down' )

    const response = await request( app, member ).get( '/api/status' )
    const body = GetStatusResponse.parse( response.body )

    expect( response.status ).toBe( 200 )
    expect( body.rows.map( ( { kind } ) => kind ) ).toEqual( [ 'gmail_connection' ] )
    expect( body.failing_count ).toBe( 0 )
  } )

  it( 'refreshes nothing of the app and answers with the member\'s rows', async () => {
    const response = await request( app, createTestUser() ).post( '/api/status/refresh' ).send( {} )

    expect( response.status ).toBe( 200 )
    expect( runServiceChecks ).not.toHaveBeenCalled()
    expect( GetStatusResponse.parse( response.body ).rows.map( ( { kind } ) => kind ) )
      .toEqual( [ 'gmail_connection' ] )
  } )

  it( 'gets 404 for the error history of an app service, as for an unknown subject', async () => {
    const member = createTestUser()

    recordFailure( null, 'whisper', 'default', at( 1 ), 'down' )

    const app404 = await request( app, member ).get( '/api/status/whisper/default/errors' )
    const unknown = await request( app, member ).get( '/api/status/whisper/other/errors' )
    const admin = await request( app ).get( '/api/status/whisper/default/errors' )

    expect( app404.status ).toBe( 404 )
    expect( app404.body ).toEqual( unknown.body )
    expect( GetHealthErrorsResponse.parse( admin.body ).errors ).toHaveLength( 1 )
  } )

  it( 'shows the admin the app rows and the admin\'s own', async () => {
    addFeed()

    const response = await request( app ).get( '/api/status' )

    expect( GetStatusResponse.parse( response.body ).rows.map( ( { kind } ) => kind ) )
      .toEqual( [ 'agent', 'whisper', 'backup', 'gmail_connection', 'feed' ] )
  } )
} )
