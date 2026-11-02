// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
} from 'vitest'
// Shared
import {
  GetGmailAccountResponse,
  ListFeedsResponse,
  ListGmailSourcesResponse,
  ListInboxResponse,
} from '@atlas/shared'
// App
import { app } from '../app.js'
// Repositories
import { insertItemIfNew } from '../repositories/feedItems.repository.js'
import { insertFeed } from '../repositories/feeds.repository.js'
import type { StoredFeed } from '../repositories/feeds.repository.js'
import { insertMessageIfNew } from '../repositories/gmailMessages.repository.js'
import { findAccount } from '../repositories/gmailAccount.repository.js'
// Test support
import { createTestUser, signedInRequest } from '../test-support/auth.js'
import type { TestUser } from '../test-support/auth.js'
import { addStoredSource, connectGmail } from '../test-support/gmailSources.fixture.js'

type Agent = ReturnType< typeof signedInRequest >

let owner: TestUser
let other: TestUser

const unknown = (): string => crypto.randomUUID()

const addFeed = (): StoredFeed => {
  const id = crypto.randomUUID()
  const feed: StoredFeed = {
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
    created_at: '2026-10-18T10:00:00.000Z',
    deleted_at: null,
  }

  insertFeed( owner.id, feed )

  return feed
}

beforeEach( () => {
  owner = createTestUser( { role: 'admin' } )
  other = createTestUser()
} )

describe( 'feeds are per user', () => {
  it( 'lists only the caller\'s feeds', async () => {
    addFeed()

    const mine = await signedInRequest( app, owner ).get( '/api/feeds' )
    const theirs = await signedInRequest( app, other ).get( '/api/feeds' )

    expect( ListFeedsResponse.parse( mine.body ).feeds ).toHaveLength( 1 )
    expect( ListFeedsResponse.parse( theirs.body ).feeds ).toEqual( [] )
  } )

  it( 'answers every route on another user\'s feed like an unknown id', async () => {
    const feed = addFeed()
    const asOther = (): Agent => signedInRequest( app, other )

    const refused = [
      await asOther().patch( `/api/feeds/${ feed.id }` ).send( { name: 'Stolen' } ),
      await asOther().delete( `/api/feeds/${ feed.id }` ),
      await asOther().post( `/api/feeds/${ feed.id }/check` ).send( {} ),
    ]
    const missing = [
      await asOther().patch( `/api/feeds/${ unknown() }` ).send( { name: 'Stolen' } ),
      await asOther().delete( `/api/feeds/${ unknown() }` ),
      await asOther().post( `/api/feeds/${ unknown() }/check` ).send( {} ),
    ]

    expect( refused.map( ( { status } ) => status ) ).toEqual( [ 404, 404, 404 ] )
    expect( refused.map( ( response ) => response.body as unknown ) )
      .toEqual( missing.map( ( response ) => response.body as unknown ) )

    const mine = await signedInRequest( app, owner ).get( '/api/feeds' )

    expect( ListFeedsResponse.parse( mine.body ).feeds[ 0 ]?.name ).toBe( 'A blog' )
  } )
} )

describe( 'the inbox is per user', () => {
  it( 'shows, summarizes and dismisses only the caller\'s items', async () => {
    const feed = addFeed()
    const itemId = crypto.randomUUID()

    insertItemIfNew( owner.id, {
      id: itemId,
      feed_id: feed.id,
      item_key: 'k',
      title: 'A post',
      link: 'https://example.com/post',
      published_at: null,
      author: null,
      content_markdown: null,
      status: 'inbox',
      job_id: null,
      added_at: '2026-10-18T10:00:00.000Z',
    } )

    const items = [ { kind: 'feed', id: itemId } ]
    const seen = await signedInRequest( app, other ).get( '/api/inbox' )
    const summarize = await signedInRequest( app, other ).post( '/api/inbox/summarize' )
      .send( { items } )
    const missing = await signedInRequest( app, other )
      .post( '/api/inbox/summarize' )
      .send( { items: [ { kind: 'feed', id: unknown() } ] } )

    expect( ListInboxResponse.parse( seen.body ).items ).toEqual( [] )
    expect( summarize.status ).toBe( 409 )
    expect( summarize.body ).toEqual( {
      error: `Not in the inbox: ${ itemId }`,
    } )
    expect( missing.status ).toBe( 409 )

    await signedInRequest( app, other ).post( '/api/inbox/dismiss' ).send( { items } )

    const mine = await signedInRequest( app, owner ).get( '/api/inbox' )

    expect( ListInboxResponse.parse( mine.body ).items ).toHaveLength( 1 )
  } )

  it( 'lists an email only for the user whose source it came from', async () => {
    const source = addStoredSource( owner.id, { destination: 'newsletter' } )

    insertMessageIfNew( owner.id, {
      id: crypto.randomUUID(),
      source_id: source.id,
      message_id: 'gmail-1',
      subject: 'Issue 1',
      sender: 'Lenny',
      sender_address: 'lenny@example.com',
      received_at: '2026-10-19T09:00:00.000Z',
      body_html: '<p>Hello</p>',
      body_text: 'Hello',
      status: 'inbox',
      backfilled: false,
      attempts: 0,
      error: null,
      job_id: null,
      added_at: '2026-10-19T10:00:00.000Z',
    } )

    const mine = await signedInRequest( app, owner ).get( '/api/inbox' )
    const theirs = await signedInRequest( app, other ).get( '/api/inbox' )

    expect( ListInboxResponse.parse( mine.body ).items ).toHaveLength( 1 )
    expect( ListInboxResponse.parse( theirs.body ).items ).toEqual( [] )
  } )
} )

describe( 'Gmail is per user', () => {
  it( 'shows each user their own connection', async () => {
    connectGmail( owner.id )

    const mine = await signedInRequest( app, owner ).get( '/api/gmail/account' )
    const theirs = await signedInRequest( app, other ).get( '/api/gmail/account' )

    expect( GetGmailAccountResponse.parse( mine.body ).account.status ).toBe( 'connected' )
    expect( GetGmailAccountResponse.parse( theirs.body ).account.status ).toBe( 'not_connected' )
  } )

  it( 'lets a user disconnect only their own account', async () => {
    connectGmail( owner.id )

    await signedInRequest( app, other ).post( '/api/gmail/disconnect' ).send( {} )

    expect( findAccount( owner.id )?.status ).toBe( 'connected' )
  } )

  it( 'refuses a connect request from an address that is not configured', async () => {
    const response = await signedInRequest( app, owner )
      .get( '/api/gmail/connect' )
      .set( 'Host', 'evil.example' )

    expect( response.status ).toBe( 400 )
  } )

  it( 'lists only the caller\'s sources and answers the rest like an unknown id', async () => {
    const source = addStoredSource( owner.id, { destination: 'newsletter' } )
    const asOther = (): Agent => signedInRequest( app, other )

    const list = await asOther().get( '/api/gmail/sources' )
    const refused = [
      await asOther().patch( `/api/gmail/sources/${ source.id }` ).send( { name: 'Stolen' } ),
      await asOther().delete( `/api/gmail/sources/${ source.id }` ),
      await asOther().post( `/api/gmail/sources/${ source.id }/check` ).send( {} ),
    ]
    const missing = [
      await asOther().patch( `/api/gmail/sources/${ unknown() }` ).send( { name: 'Stolen' } ),
      await asOther().delete( `/api/gmail/sources/${ unknown() }` ),
      await asOther().post( `/api/gmail/sources/${ unknown() }/check` ).send( {} ),
    ]

    expect( ListGmailSourcesResponse.parse( list.body ).sources ).toEqual( [] )
    expect( refused.map( ( { status } ) => status ) ).toEqual( [ 404, 404, 404 ] )
    expect( refused.map( ( response ) => response.body as unknown ) )
      .toEqual( missing.map( ( response ) => response.body as unknown ) )
  } )

  it( 'answers a status errors request for another user\'s subject like an unknown', async () => {
    const feed = addFeed()
    const asOther = signedInRequest( app, other )

    const refused = await asOther.get( `/api/status/feed/${ feed.id }/errors` )
    const missing = await asOther.get( `/api/status/feed/${ unknown() }/errors` )
    const connection = await asOther.get( `/api/status/gmail_connection/${ owner.id }/errors` )

    expect( refused.status ).toBe( 404 )
    expect( refused.body ).toEqual( missing.body )
    expect( connection.status ).toBe( 404 )
  } )
} )
