// Node
import { readFileSync } from 'node:fs'
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
  FeedResponse,
  ListFeedsResponse,
  ListInboxResponse,
  PreviewFeedResponse,
} from '@atlas/shared'
// App
import { app } from '../app.js'
// Test support
import { signedInRequest as request } from '../test-support/auth.js'
// Clients
import { HttpStatusError, UnreachableError, fetchResource } from '../clients/http.client.js'
import { listSummaryModels } from '../clients/anthropicModels.client.js'
// Repositories
import { clearJobs } from '../repositories/jobStore.repository.js'
import { findFeedById } from '../repositories/feeds.repository.js'
import { getDatabase } from '../repositories/database.js'
// Services
import { clearModelCache } from '../services/models.service.js'
import { listProfiles } from '../services/prompts.service.js'
// Test support
import { defaultTestAdmin } from '../test-support/auth.js'

let userId = ''

beforeEach( () => {
  userId = defaultTestAdmin().id
} )

vi.mock( '../clients/anthropicModels.client.js' )
vi.mock( '../clients/http.client.js', async ( importOriginal ) => ( {
  ...await importOriginal< typeof import( '../clients/http.client.js' ) >(),
  fetchResource: vi.fn(),
} ) )

const fetchMock = vi.mocked( fetchResource )
const feedUrl = 'https://blog.example.com/feed.xml'
const xml = readFileSync(
  new URL( '../test-support/feeds/rss-blog.xml', import.meta.url ),
  'utf8',
)

const ok = ( body: string, etag: string | null = '"v1"' ) => ( {
  status: 200,
  finalUrl: feedUrl,
  contentType: 'application/rss+xml',
  body,
  etag,
  lastModified: null,
} )

const add = async ( extra: Record< string, unknown > = {} ): Promise< string > => {
  const response = await request( app ).post( '/api/feeds' ).send( { url: feedUrl, ...extra } )

  return FeedResponse.parse( response.body ).feed.id
}

const inboxCount = async (): Promise< number > => {
  const response = await request( app ).get( '/api/inbox' )

  return ListInboxResponse.parse( response.body ).items.length
}

beforeEach( () => {
  vi.resetAllMocks()
  clearJobs( userId )
  clearModelCache()
  getDatabase().exec( 'DELETE FROM feed_items; DELETE FROM feeds' )
  fetchMock.mockResolvedValue( ok( xml ) )
  vi.mocked( listSummaryModels ).mockResolvedValue( [
    { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
    { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' },
  ] )
} )

describe( 'POST /api/feeds/preview', () => {
  it( 'returns the feed URL, the title and the latest item', async () => {
    const response = await request( app ).post( '/api/feeds/preview' ).send( { url: feedUrl } )

    expect( response.status ).toBe( 200 )
    expect( PreviewFeedResponse.parse( response.body ) ).toEqual( {
      feed_url: feedUrl,
      title: 'Example Blog',
      latest_item: { title: 'Newest post', published_at: '2026-10-15T09:00:00.000Z' },
    } )
  } )

  it( 'returns 400 when the address has no feed', async () => {
    fetchMock.mockResolvedValue( ok( '<html><body>hi</body></html>' ) )

    const response = await request( app ).post( '/api/feeds/preview' ).send( { url: feedUrl } )

    expect( response.status ).toBe( 400 )
    expect( response.body ).toEqual( { error: 'No feed found at this address' } )
  } )

  it.each( [
    [ 'no url', {} ],
    [ 'an ftp url', { url: 'ftp://example.com/feed' } ],
    [ 'a url that is not one', { url: 'nope' } ],
  ] )( 'returns 400 for %s', async ( _name, body ) => {
    const response = await request( app ).post( '/api/feeds/preview' ).send( body )

    expect( response.status ).toBe( 400 )
  } )

  it.each( [
    [ 'an unreachable site', new UnreachableError(), "Couldn't reach the site" ],
    [ 'a 500', new HttpStatusError( 500 ), 'The site answered 500' ],
  ] )( 'returns 502 for %s', async ( _name, error, message ) => {
    fetchMock.mockRejectedValue( error )

    const response = await request( app ).post( '/api/feeds/preview' ).send( { url: feedUrl } )

    expect( response.status ).toBe( 502 )
    expect( response.body ).toEqual( { error: message } )
  } )
} )

describe( 'POST /api/feeds', () => {
  it( 'creates the feed with 201 and its first inbox item', async () => {
    const response = await request( app ).post( '/api/feeds' ).send( { url: feedUrl } )

    expect( response.status ).toBe( 201 )
    expect( FeedResponse.parse( response.body ).feed ).toMatchObject( {
      name: 'Example Blog',
      feed_url: feedUrl,
      enabled: true,
      auto_summarize: false,
      inbox_count: 1,
    } )
  } )

  it( 'takes a name, a profile and auto_summarize', async () => {
    const profile = listProfiles( userId )[ 0 ]?.id ?? ''

    const response = await request( app )
      .post( '/api/feeds' )
      .send( { url: feedUrl, name: 'Mine', profile_id: profile, auto_summarize: true } )

    expect( FeedResponse.parse( response.body ).feed )
      .toMatchObject( { name: 'Mine', profile_id: profile, auto_summarize: true } )
  } )

  it.each( [
    [ 'a blank name', { url: feedUrl, name: ' ' } ],
    [ 'a profile that is not a uuid', { url: feedUrl, profile_id: 'x' } ],
    [ 'a profile that does not exist', { url: feedUrl, profile_id: crypto.randomUUID() } ],
    [ 'no url', {} ],
  ] )( 'returns 400 for %s', async ( _name, body ) => {
    const response = await request( app ).post( '/api/feeds' ).send( body )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 409 for a feed that was already added', async () => {
    await add()

    const response = await request( app ).post( '/api/feeds' ).send( { url: feedUrl } )

    expect( response.status ).toBe( 409 )
  } )

  it( 'returns 502 when the site cannot be reached', async () => {
    fetchMock.mockRejectedValue( new UnreachableError() )

    const response = await request( app ).post( '/api/feeds' ).send( { url: feedUrl } )

    expect( response.status ).toBe( 502 )
  } )
} )

describe( 'GET /api/feeds', () => {
  it( 'lists the feeds by name', async () => {
    fetchMock.mockImplementation( ( url ) => Promise.resolve( { ...ok( xml ), finalUrl: url } ) )
    await request( app ).post( '/api/feeds' ).send( { url: feedUrl, name: 'b' } )
    await request( app ).post( '/api/feeds' ).send( { url: 'https://two.example/f', name: 'a' } )

    const response = await request( app ).get( '/api/feeds' )

    expect( response.status ).toBe( 200 )
    expect( ListFeedsResponse.parse( response.body ).feeds.map( ( { name } ) => name ) )
      .toEqual( [ 'a', 'b' ] )
  } )

  it( 'returns an empty list when there are none', async () => {
    expect( ( await request( app ).get( '/api/feeds' ) ).body ).toEqual( { feeds: [] } )
  } )
} )

describe( 'PATCH /api/feeds/:id', () => {
  it( 'updates the feed', async () => {
    const id = await add()

    const response = await request( app )
      .patch( `/api/feeds/${ id }` )
      .send( { name: 'Renamed', enabled: false, profile_id: null } )

    expect( response.status ).toBe( 200 )
    expect( FeedResponse.parse( response.body ).feed )
      .toMatchObject( { name: 'Renamed', enabled: false, profile_id: null } )
  } )

  it.each( [
    [ 'an empty body', {} ],
    [ 'a blank name', { name: '' } ],
    [ 'a profile that does not exist', { profile_id: crypto.randomUUID() } ],
  ] )( 'returns 400 for %s', async ( _name, body ) => {
    const id = await add()

    const response = await request( app ).patch( `/api/feeds/${ id }` ).send( body )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 404 for an unknown feed', async () => {
    const response = await request( app )
      .patch( `/api/feeds/${ crypto.randomUUID() }` )
      .send( { name: 'x' } )

    expect( response.status ).toBe( 404 )
  } )
} )

describe( 'DELETE /api/feeds/:id', () => {
  it( 'deletes the feed and keeps its inbox items by default', async () => {
    const id = await add()

    const response = await request( app ).delete( `/api/feeds/${ id }` )

    expect( response.status ).toBe( 204 )
    expect( findFeedById( userId, id )?.deleted_at ).not.toBeNull()
    expect( await inboxCount() ).toBe( 1 )
  } )

  it( 'removes its inbox items with remove_items=true', async () => {
    const id = await add()

    const response = await request( app ).delete( `/api/feeds/${ id }?remove_items=true` )

    expect( response.status ).toBe( 204 )
    expect( await inboxCount() ).toBe( 0 )
  } )

  it( 'keeps them with remove_items=false', async () => {
    const id = await add()

    await request( app ).delete( `/api/feeds/${ id }?remove_items=false` )

    expect( await inboxCount() ).toBe( 1 )
  } )

  it( 'returns 400 for a remove_items value that is not true or false', async () => {
    const id = await add()

    const response = await request( app ).delete( `/api/feeds/${ id }?remove_items=maybe` )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 404 for an unknown feed', async () => {
    const response = await request( app ).delete( `/api/feeds/${ crypto.randomUUID() }` )

    expect( response.status ).toBe( 404 )
  } )
} )

describe( 'POST /api/feeds/:id/check and POST /api/feeds/check', () => {
  it( 'checks one feed and returns it', async () => {
    const id = await add()
    fetchMock.mockResolvedValue( ok( xml.replace( '</channel>', `<item><title>Fresh</title>
      <link>https://blog.example.com/posts/fresh</link><guid>fresh</guid></item></channel>` ) ) )

    const response = await request( app ).post( `/api/feeds/${ id }/check` )

    expect( response.status ).toBe( 200 )
    expect( FeedResponse.parse( response.body ).feed ).toMatchObject( {
      id,
      inbox_count: 2,
      last_error: null,
    } )
  } )

  it( 'returns 200 with last_error when the check fails', async () => {
    const id = await add()
    fetchMock.mockRejectedValue( new HttpStatusError( 500 ) )

    const response = await request( app ).post( `/api/feeds/${ id }/check` )

    expect( response.status ).toBe( 200 )
    expect( FeedResponse.parse( response.body ).feed.last_error ).toBe( 'The site answered 500' )
  } )

  it( 'returns 404 for an unknown feed and 409 for one that is turned off', async () => {
    const id = await add()
    await request( app ).patch( `/api/feeds/${ id }` ).send( { enabled: false } )

    expect( ( await request( app ).post( `/api/feeds/${ id }/check` ) ).status ).toBe( 409 )
    expect( ( await request( app ).post( `/api/feeds/${ crypto.randomUUID() }/check` ) ).status )
      .toBe( 404 )
  } )

  it( 'checks every enabled feed with POST /api/feeds/check', async () => {
    await add()
    fetchMock.mockClear()

    const response = await request( app ).post( '/api/feeds/check' )

    expect( response.status ).toBe( 200 )
    expect( ListFeedsResponse.parse( response.body ).feeds ).toHaveLength( 1 )
    expect( fetchMock ).toHaveBeenCalledTimes( 1 )
  } )
} )
