// Vitest
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { FEED_ID, feedFixture } from '../fixtures/feed.fixture'
import {
  checkAllFeeds,
  checkFeed,
  createFeed,
  deleteFeed,
  listFeeds,
  previewFeed,
  updateFeed,
} from './feeds.api'

const fetchMock = vi.fn()
const EMPTY_JSON = { headers: { 'Content-Type': 'application/json' }, body: '{}' }

const json = ( body: unknown, status = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

const jsonInit = ( method: string, body: unknown ): RequestInit => {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify( body ),
  }
}

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'listFeeds', () => {
  it( 'gets the feeds', async () => {
    fetchMock.mockResolvedValue( json( { feeds: [ feedFixture() ] } ) )

    await expect( listFeeds() ).resolves.toEqual( [ feedFixture() ] )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/feeds', undefined )
  } )

  it( 'rejects a response that does not match the schema', async () => {
    fetchMock.mockResolvedValue( json( { feeds: [ { id: 'x' } ] } ) )

    await expect( listFeeds() ).rejects.toThrow( 'Unexpected response from the server' )
  } )
} )

describe( 'previewFeed', () => {
  it( 'posts the address and returns the preview', async () => {
    const preview = {
      feed_url: 'https://blog.example.com/feed.xml',
      title: 'Example Blog',
      latest_item: { title: 'A new post', published_at: '2026-10-17T08:00:00.000Z' },
    }
    fetchMock.mockResolvedValue( json( preview ) )

    await expect( previewFeed( 'https://blog.example.com' ) ).resolves.toEqual( preview )
    expect( fetchMock ).toHaveBeenCalledWith(
      '/api/feeds/preview',
      jsonInit( 'POST', { url: 'https://blog.example.com' } ),
    )
  } )

  it( 'throws the server\'s message', async () => {
    fetchMock.mockResolvedValue( json( { error: 'No feed found at this address' }, 400 ) )

    await expect( previewFeed( 'https://x.example.com' ) ).rejects.toThrow(
      'No feed found at this address',
    )
  } )
} )

describe( 'createFeed', () => {
  it( 'posts the body and returns the feed', async () => {
    fetchMock.mockResolvedValue( json( { feed: feedFixture() }, 201 ) )
    const body = { url: 'https://blog.example.com', name: 'Mine', auto_summarize: true }

    await expect( createFeed( body ) ).resolves.toEqual( feedFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/feeds', jsonInit( 'POST', body ) )
  } )

  it( 'throws the duplicate message', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Feed already added' }, 409 ) )

    await expect( createFeed( { url: 'https://blog.example.com' } ) ).rejects.toThrow(
      'Feed already added',
    )
  } )
} )

describe( 'updateFeed', () => {
  it( 'patches the feed and returns it', async () => {
    fetchMock.mockResolvedValue( json( { feed: feedFixture( { enabled: false } ) } ) )

    await expect( updateFeed( FEED_ID, { enabled: false } ) ).resolves.toEqual(
      feedFixture( { enabled: false } ),
    )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/feeds/${ FEED_ID }`,
      jsonInit( 'PATCH', { enabled: false } ),
    )
  } )

  it( 'can clear the profile', async () => {
    fetchMock.mockResolvedValue( json( { feed: feedFixture() } ) )

    await updateFeed( FEED_ID, { profile_id: null } )

    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/feeds/${ FEED_ID }`,
      jsonInit( 'PATCH', { profile_id: null } ),
    )
  } )
} )

describe( 'deleteFeed', () => {
  it( 'deletes and keeps the inbox items by default', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await expect( deleteFeed( FEED_ID, false ) ).resolves.toBeUndefined()
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/feeds/${ FEED_ID }?remove_items=false`,
      { method: 'DELETE', ...EMPTY_JSON },
    )
  } )

  it( 'asks for the inbox items to be removed', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await deleteFeed( FEED_ID, true )

    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/feeds/${ FEED_ID }?remove_items=true`,
      { method: 'DELETE', ...EMPTY_JSON },
    )
  } )

  it( 'throws on a missing feed', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Feed not found' }, 404 ) )

    await expect( deleteFeed( FEED_ID, false ) ).rejects.toThrow( 'Feed not found' )
  } )
} )

describe( 'checkFeed', () => {
  it( 'checks one feed and returns it', async () => {
    const feed = feedFixture( { last_error: 'The site answered 500' } )
    fetchMock.mockResolvedValue( json( { feed } ) )

    await expect( checkFeed( FEED_ID ) ).resolves.toEqual( feed )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/feeds/${ FEED_ID }/check`,
      { method: 'POST', ...EMPTY_JSON },
    )
  } )
} )

describe( 'checkAllFeeds', () => {
  it( 'checks every feed and returns them', async () => {
    fetchMock.mockResolvedValue( json( { feeds: [ feedFixture() ] } ) )

    await expect( checkAllFeeds() ).resolves.toEqual( [ feedFixture() ] )
    expect( fetchMock ).toHaveBeenCalledWith(
      '/api/feeds/check',
      { method: 'POST', ...EMPTY_JSON },
    )
  } )
} )
