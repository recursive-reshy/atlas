// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Shared
import {
  GmailSourceResponse,
  ListGmailSourcesResponse,
  PreviewGmailSourceResponse,
} from '@atlas/shared'
// App
import { app } from '../app.js'
// Test support
import { signedInRequest as request } from '../test-support/auth.js'
// Gmail
import { GmailAuthError } from '../gmail/auth.js'
import {
  countMatches,
  getMessage,
  listLabels,
  listMatchingIds,
} from '../gmail/gmail.client.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { setAccountStatus } from '../repositories/gmailAccount.repository.js'
import { findSourceById } from '../repositories/gmailSources.repository.js'
// Test support
import { buildMessage } from '../test-support/gmailMessage.fixture.js'
import {
  addStoredSource,
  connectGmail,
  idsOf,
} from '../test-support/gmailSources.fixture.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../gmail/gmail.client.js' )

const configMock = vi.hoisted( () => {
  const mock: { gmail: Record< string, unknown > | null } = { gmail: { clientId: 'id' } }

  return mock
} )

vi.mock( '../config.js', async ( importOriginal ) => {
  const { config } = await importOriginal< typeof import( '../config.js' ) >()

  return { config: Object.assign( configMock, config, { gmail: configMock.gmail } ) }
} )

const labelBody = { kind: 'labels', label_ids: [ 'Label_1' ] }
const queryBody = { kind: 'query', query: 'from:donotreply@upwork.com' }
const unknownId = '2c0a6b6e-5b1f-4a53-8a86-0f3f5a7c9d11'

const inboxCount = (): number => {
  const row = getDatabase()
    .prepare( 'SELECT COUNT(*) AS n FROM gmail_messages' )
    .get() as { n: number }

  return row.n
}

beforeEach( () => {
  vi.resetAllMocks()
  connectGmail( userId )
  configMock.gmail = { clientId: 'id' }
  vi.mocked( listLabels ).mockResolvedValue( [ { id: 'Label_1', name: 'Upwork', type: 'user' } ] )
  vi.mocked( listMatchingIds ).mockResolvedValue( idsOf() )
  vi.mocked( countMatches ).mockResolvedValue( { ...idsOf(), count: 0, capped: false } )
  vi.mocked( getMessage ).mockImplementation( ( _userId, id, format = 'full' ) => {
    return Promise.resolve( buildMessage( id, {}, format ) )
  } )
} )

describe( 'GET /api/gmail/sources', () => {
  it( 'lists the sources by name', async () => {
    addStoredSource( userId, { name: 'Beta' } )
    addStoredSource(
      userId,
      { name: 'Alpha', match: { kind: 'labels', label_ids: [ 'Label_1' ] } },
    )
    addStoredSource( userId, { name: 'Gone', deleted_at: '2026-10-19T10:00:00.000Z' } )

    const response = await request( app ).get( '/api/gmail/sources' )

    expect( response.status ).toBe( 200 )

    const { sources } = ListGmailSourcesResponse.parse( response.body )

    expect( sources.map( ( { name } ) => name ) ).toEqual( [ 'Alpha', 'Beta' ] )
    expect( sources[ 0 ]?.label_names ).toEqual( [ 'Upwork' ] )
  } )

  it( 'answers while Gmail is not connected', async () => {
    addStoredSource( userId )
    setAccountStatus( userId, 'reconnect_needed', 'revoked' )

    const response = await request( app ).get( '/api/gmail/sources' )

    expect( response.status ).toBe( 200 )
    expect( ListGmailSourcesResponse.parse( response.body ).sources ).toHaveLength( 1 )
  } )

  it( 'answers an empty list when Gmail is not configured', async () => {
    configMock.gmail = null

    const response = await request( app ).get( '/api/gmail/sources' )

    expect( response.status ).toBe( 200 )
    expect( response.body ).toEqual( { sources: [] } )
  } )
} )

describe( 'POST /api/gmail/sources/preview', () => {
  it( 'returns the count, the newest email and the overlaps', async () => {
    const other = addStoredSource( userId, { name: 'Same search', match: queryBody as never } )

    vi.mocked( countMatches ).mockResolvedValue( { ...idsOf( 'm1' ), count: 1, capped: false } )

    const response = await request( app )
      .post( '/api/gmail/sources/preview' )
      .send( { match: queryBody } )

    expect( response.status ).toBe( 200 )
    expect( PreviewGmailSourceResponse.parse( response.body ) ).toMatchObject( {
      count: 1,
      count_capped: false,
      newest: { subject: 'Subject of m1', from: 'Ada' },
      overlaps: [ { id: other.id, name: 'Same search' } ],
    } )
  } )

  it.each( [
    [ 'a missing match', {} ],
    [ 'an empty query', { match: { kind: 'query', query: '  ' } } ],
    [ 'no labels', { match: { kind: 'labels', label_ids: [] } } ],
  ] )( 'refuses %s with 400', async ( _name, body ) => {
    const response = await request( app ).post( '/api/gmail/sources/preview' ).send( body )

    expect( response.status ).toBe( 400 )
  } )

  it( 'answers 409 while Gmail is not connected', async () => {
    setAccountStatus( userId, 'reconnect_needed', 'revoked' )

    const response = await request( app )
      .post( '/api/gmail/sources/preview' )
      .send( { match: queryBody } )

    expect( response.status ).toBe( 409 )
    expect( countMatches ).not.toHaveBeenCalled()
  } )

  it( 'answers 409 when Gmail is not configured', async () => {
    configMock.gmail = null

    const response = await request( app )
      .post( '/api/gmail/sources/preview' )
      .send( { match: queryBody } )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Gmail isn\'t configured' } )
  } )
} )

describe( 'POST /api/gmail/sources', () => {
  it( 'creates a source and answers 201', async () => {
    const response = await request( app )
      .post( '/api/gmail/sources' )
      .send( { name: ' Weekly news ', match: labelBody, destination: 'newsletter' } )

    expect( response.status ).toBe( 201 )

    const { source } = GmailSourceResponse.parse( response.body )

    expect( source ).toMatchObject( {
      name: 'Weekly news',
      destination: 'newsletter',
      label_names: [ 'Upwork' ],
      enabled: true,
    } )
    expect( findSourceById( userId, source.id ) ).toBeDefined()
  } )

  it( 'refuses a jobs source with 400, collecting and storing nothing', async () => {
    const response = await request( app )
      .post( '/api/gmail/sources' )
      .send( { name: 'Upwork alerts', match: labelBody, destination: 'jobs' } )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( { error: 'Freelance jobs sources aren\'t available yet' } )
    expect( listMatchingIds ).not.toHaveBeenCalled()
    expect( ( await request( app ).get( '/api/gmail/sources' ) ).body ).toEqual( { sources: [] } )
  } )

  it( 'backfills a newsletter source when asked', async () => {
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1', 'm2' ) )

    const response = await request( app )
      .post( '/api/gmail/sources' )
      .send( { name: 'News', match: queryBody, destination: 'newsletter', backfill: '30d' } )

    expect( response.status ).toBe( 201 )
    expect( GmailSourceResponse.parse( response.body ).source.inbox_count ).toBe( 2 )
  } )

  it.each( [
    [ 'no name', { match: queryBody, destination: 'newsletter' } ],
    [ 'a blank name', { name: ' ', match: queryBody, destination: 'newsletter' } ],
    [ 'no destination', { name: 'A', match: queryBody } ],
    [ 'an unknown destination', { name: 'A', match: queryBody, destination: 'crm' } ],
    [ 'a backfill on a jobs source', {
      name: 'A',
      match: queryBody,
      destination: 'jobs',
      backfill: '30d',
    } ],
    [ 'auto-summarize on a jobs source', {
      name: 'A',
      match: queryBody,
      destination: 'jobs',
      auto_summarize: true,
    } ],
    [ 'a profile that is not an id', {
      name: 'A',
      match: queryBody,
      destination: 'newsletter',
      profile_id: 'nope',
    } ],
  ] )( 'refuses %s with 400', async ( _name, body ) => {
    const response = await request( app ).post( '/api/gmail/sources' ).send( body )

    expect( response.status ).toBe( 400 )
    expect( inboxCount() ).toBe( 0 )
  } )

  it( 'refuses a profile that does not exist with 400', async () => {
    const response = await request( app ).post( '/api/gmail/sources' ).send( {
      name: 'A',
      match: queryBody,
      destination: 'newsletter',
      profile_id: unknownId,
    } )

    expect( response.status ).toBe( 400 )
  } )

  it( 'answers 409 while Gmail is not connected', async () => {
    setAccountStatus( userId, 'reconnect_needed', 'revoked' )

    const response = await request( app )
      .post( '/api/gmail/sources' )
      .send( { name: 'A', match: queryBody, destination: 'newsletter' } )

    expect( response.status ).toBe( 409 )
  } )

  it( 'answers 409 when Google rejects the access halfway, and stores nothing', async () => {
    vi.mocked( listMatchingIds ).mockRejectedValue( new GmailAuthError( 'revoked' ) )

    const response = await request( app )
      .post( '/api/gmail/sources' )
      .send( { name: 'A', match: queryBody, destination: 'newsletter' } )

    expect( response.status ).toBe( 409 )
    expect( ( await request( app ).get( '/api/gmail/sources' ) ).body ).toEqual( { sources: [] } )
  } )
} )

describe( 'PATCH /api/gmail/sources/:id', () => {
  it( 'changes the given fields', async () => {
    const source = addStoredSource( userId, { name: 'Old' } )

    const response = await request( app )
      .patch( `/api/gmail/sources/${ source.id }` )
      .send( { name: 'New', enabled: false } )

    expect( response.status ).toBe( 200 )
    expect( GmailSourceResponse.parse( response.body ).source ).toMatchObject( {
      name: 'New',
      enabled: false,
    } )
  } )

  it( 'works while Gmail is not connected', async () => {
    const source = addStoredSource( userId )

    setAccountStatus( userId, 'reconnect_needed', 'revoked' )

    const response = await request( app )
      .patch( `/api/gmail/sources/${ source.id }` )
      .send( { enabled: false } )

    expect( response.status ).toBe( 200 )
  } )

  it.each( [
    [ 'an empty body', {} ],
    [ 'a blank name', { name: ' ' } ],
    [ 'an unknown field only', { destination: 'newsletter' } ],
  ] )( 'refuses %s with 400', async ( _name, body ) => {
    const source = addStoredSource( userId )

    const response = await request( app ).patch( `/api/gmail/sources/${ source.id }` ).send( body )

    expect( response.status ).toBe( 400 )
  } )

  it( 'refuses newsletter-only fields on a jobs source with 400', async () => {
    const source = addStoredSource( userId )

    const response = await request( app )
      .patch( `/api/gmail/sources/${ source.id }` )
      .send( { auto_summarize: true } )

    expect( response.status ).toBe( 400 )
  } )

  it( 'answers 404 for an unknown or deleted source', async () => {
    const gone = addStoredSource( userId, { deleted_at: '2026-10-19T10:00:00.000Z' } )

    for( const id of [ unknownId, gone.id ] ) {
      const response = await request( app )
        .patch( `/api/gmail/sources/${ id }` )
        .send( { name: 'x' } )

      expect( response.status ).toBe( 404 )
    }
  } )

  it( 'answers 400 for an id that is not an id', async () => {
    const response = await request( app ).patch( '/api/gmail/sources/nope' ).send( { name: 'x' } )

    expect( response.status ).toBe( 400 )
  } )
} )

describe( 'DELETE /api/gmail/sources/:id', () => {
  it( 'deletes the source and answers 204, keeping its inbox items by default', async () => {
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1' ) )

    const created = await request( app )
      .post( '/api/gmail/sources' )
      .send( { name: 'News', match: queryBody, destination: 'newsletter' } )
    const { id } = GmailSourceResponse.parse( created.body ).source

    const response = await request( app ).delete( `/api/gmail/sources/${ id }` )

    expect( response.status ).toBe( 204 )
    expect( findSourceById( userId, id )?.deleted_at ).not.toBeNull()
    expect( getDatabase().prepare( 'SELECT status FROM gmail_messages' ).all() )
      .toEqual( [ { status: 'inbox' } ] )
  } )

  it( 'dismisses the inbox items with remove_inbox_items=true', async () => {
    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1' ) )

    const created = await request( app )
      .post( '/api/gmail/sources' )
      .send( { name: 'News', match: queryBody, destination: 'newsletter' } )
    const { id } = GmailSourceResponse.parse( created.body ).source

    const response = await request( app )
      .delete( `/api/gmail/sources/${ id }?remove_inbox_items=true` )

    expect( response.status ).toBe( 204 )
    expect( getDatabase().prepare( 'SELECT status FROM gmail_messages' ).all() )
      .toEqual( [ { status: 'dismissed' } ] )
  } )

  it( 'refuses an invalid remove_inbox_items with 400', async () => {
    const source = addStoredSource( userId )

    const response = await request( app )
      .delete( `/api/gmail/sources/${ source.id }?remove_inbox_items=maybe` )

    expect( response.status ).toBe( 400 )
  } )

  it( 'answers 404 for an unknown source', async () => {
    const response = await request( app ).delete( `/api/gmail/sources/${ unknownId }` )

    expect( response.status ).toBe( 404 )
  } )

  it( 'works while Gmail is not connected', async () => {
    const source = addStoredSource( userId )

    setAccountStatus( userId, 'reconnect_needed', 'revoked' )

    const response = await request( app ).delete( `/api/gmail/sources/${ source.id }` )

    expect( response.status ).toBe( 204 )
  } )
} )

describe( 'POST /api/gmail/sources/:id/check', () => {
  it( 'checks the source and returns it', async () => {
    const source = addStoredSource( userId )

    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1' ) )

    const response = await request( app ).post( `/api/gmail/sources/${ source.id }/check` )

    expect( response.status ).toBe( 200 )

    const { source: checked } = GmailSourceResponse.parse( response.body )

    expect( checked.id ).toBe( source.id )
    expect( checked.last_checked_at ).not.toBeNull()
    expect( getDatabase().prepare( 'SELECT status FROM gmail_messages' ).all() )
      .toEqual( [ { status: 'pending' } ] )
  } )

  it( 'answers 404 for an unknown source', async () => {
    const response = await request( app ).post( `/api/gmail/sources/${ unknownId }/check` )

    expect( response.status ).toBe( 404 )
  } )

  it( 'answers 409 for a turned-off source', async () => {
    const source = addStoredSource( userId, { enabled: false } )

    const response = await request( app ).post( `/api/gmail/sources/${ source.id }/check` )

    expect( response.status ).toBe( 409 )
  } )

  it( 'answers 409 while Gmail is not connected', async () => {
    const source = addStoredSource( userId )

    setAccountStatus( userId, 'reconnect_needed', 'revoked' )

    const response = await request( app ).post( `/api/gmail/sources/${ source.id }/check` )

    expect( response.status ).toBe( 409 )
    expect( listMatchingIds ).not.toHaveBeenCalled()
  } )

  it( 'answers 409 when Google rejects the access during the check', async () => {
    const source = addStoredSource( userId )

    vi.mocked( listMatchingIds ).mockRejectedValue( new GmailAuthError( 'Google says no' ) )

    const response = await request( app ).post( `/api/gmail/sources/${ source.id }/check` )

    expect( response.status ).toBe( 409 )
    expect( response.body ).toEqual( { error: 'Google says no' } )
  } )
} )

describe( 'POST /api/gmail/sources/check', () => {
  it( 'checks every turned-on source and returns the list', async () => {
    const first = addStoredSource( userId, { name: 'A' } )
    const off = addStoredSource( userId, { name: 'B', enabled: false } )

    const response = await request( app ).post( '/api/gmail/sources/check' )

    expect( response.status ).toBe( 200 )

    const { sources } = ListGmailSourcesResponse.parse( response.body )

    expect( sources.map( ( { id } ) => id ) ).toEqual( [ first.id, off.id ] )
    expect( sources[ 0 ]?.last_checked_at ).not.toBeNull()
    expect( sources[ 1 ]?.last_checked_at ).toBeNull()
  } )

  it( 'answers 409 while Gmail is not connected', async () => {
    setAccountStatus( userId, 'reconnect_needed', 'revoked' )

    expect( ( await request( app ).post( '/api/gmail/sources/check' ) ).status ).toBe( 409 )
  } )
} )

describe( 'what the sources routes return', () => {
  it( 'carries no email content or token', async () => {
    const source = addStoredSource( userId )

    vi.mocked( listMatchingIds ).mockResolvedValue( idsOf( 'm1' ) )
    vi.mocked( getMessage ).mockResolvedValue( buildMessage( 'm1', { text: 'SECRET-BODY' } ) )

    const response = await request( app ).post( `/api/gmail/sources/${ source.id }/check` )

    expect( JSON.stringify( response.body ) ).not.toContain( 'SECRET-BODY' )
    expect( JSON.stringify( response.body ) ).not.toContain( 'refresh_token' )
  } )
} )
