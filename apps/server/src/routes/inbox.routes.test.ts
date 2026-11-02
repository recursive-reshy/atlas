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
  ListInboxResponse,
  SummarizeInboxResponse,
} from '@atlas/shared'
import type { InboxItemRef } from '@atlas/shared'
// App
import { app } from '../app.js'
// Test support
import { signedInRequest as request } from '../test-support/auth.js'
// Clients
import { listSummaryModels } from '../clients/anthropicModels.client.js'
import { fetchResource } from '../clients/http.client.js'
// Repositories
import { getDatabase } from '../repositories/database.js'
import { insertMessageIfNew } from '../repositories/gmailMessages.repository.js'
import type { StoredGmailMessage } from '../repositories/gmailMessages.repository.js'
import { clearJobs } from '../repositories/jobStore.repository.js'
// Test support
import { loadGmailFixture } from '../test-support/gmailFixture.js'
import { addStoredSource, connectGmail } from '../test-support/gmailSources.fixture.js'
// Services
import { clearModelCache } from './../services/models.service.js'
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

const feedUrl = 'https://blog.example.com/feed.xml'
const xml = readFileSync(
  new URL( '../test-support/feeds/rss-blog.xml', import.meta.url ),
  'utf8',
)
const newsletter = loadGmailFixture( 'Ideabrowser' )
const unknown = '2c0a6b6e-5b1f-4a53-8a86-0f3f5a7c9d11'

const addFeed = async (): Promise< void > => {
  const response = await request( app ).post( '/api/feeds' ).send( { url: feedUrl } )

  FeedResponse.parse( response.body )
}

const addEmail = ( overrides: Partial< StoredGmailMessage > = {} ): StoredGmailMessage => {
  const source = addStoredSource( userId, { name: 'Idea digest', destination: 'newsletter' } )
  const message: StoredGmailMessage = {
    id: crypto.randomUUID(),
    source_id: source.id,
    message_id: `gmail-${ crypto.randomUUID().slice( 0, 8 ) }`,
    subject: newsletter.subject,
    sender: 'Ideabrowser',
    sender_address: 'notifications@mail.ideabrowser.com',
    received_at: '2026-10-17T08:00:00.000Z',
    body_html: newsletter.html,
    body_text: newsletter.text,
    status: 'inbox',
    backfilled: false,
    attempts: 0,
    error: null,
    job_id: null,
    added_at: '2026-10-20T08:00:00.000Z',
    ...overrides,
  }

  insertMessageIfNew( userId, message )

  return message
}

const inbox = async (): Promise< ListInboxResponse[ 'items' ] > => {
  const response = await request( app ).get( '/api/inbox' )

  return ListInboxResponse.parse( response.body ).items
}

const refs = ( items: ListInboxResponse[ 'items' ] ): InboxItemRef[] => {
  return items.map( ( { kind, id } ) => ( { kind, id } ) )
}

beforeEach( () => {
  vi.resetAllMocks()
  clearJobs( userId )
  clearModelCache()
  getDatabase().exec( 'DELETE FROM feed_items; DELETE FROM feeds' )
  connectGmail( userId )
  vi.mocked( fetchResource ).mockResolvedValue( {
    status: 200,
    finalUrl: feedUrl,
    contentType: 'application/rss+xml',
    body: xml,
    etag: '"v1"',
    lastModified: null,
  } )
  vi.mocked( listSummaryModels ).mockResolvedValue( [
    { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
    { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' },
  ] )
} )

describe( 'GET /api/inbox', () => {
  it( 'is empty when nothing waits', async () => {
    const response = await request( app ).get( '/api/inbox' )

    expect( response.status ).toBe( 200 )
    expect( response.body ).toEqual( { items: [] } )
  } )

  it( 'lists a feed item with its feed name', async () => {
    await addFeed()

    expect( ( await inbox() )[ 0 ] ).toMatchObject( {
      kind: 'feed',
      feed_name: 'Example Blog',
      title: 'Newest post',
      source_type: 'article',
    } )
  } )

  it( 'lists a newsletter email with its subject, sender and Gmail link', async () => {
    const message = addEmail()

    expect( await inbox() ).toEqual( [ {
      kind: 'gmail',
      id: message.id,
      source_id: message.source_id,
      source_name: 'Idea digest',
      title: newsletter.subject,
      sender: 'Ideabrowser',
      link: `https://mail.google.com/mail/u/naresh%40example.com/#all/${ message.message_id }`,
      published_at: '2026-10-17T08:00:00.000Z',
      source_type: 'article',
      added_at: '2026-10-20T08:00:00.000Z',
    } ] )
  } )

  it( 'lists both kinds together, newest first', async () => {
    await addFeed()
    const message = addEmail( { added_at: '2099-01-01T00:00:00.000Z' } )

    const items = await inbox()

    expect( items.map( ( { kind } ) => kind ) ).toEqual( [ 'gmail', 'feed' ] )
    expect( items[ 0 ]?.id ).toBe( message.id )
  } )

  it( 'carries no email body', async () => {
    addEmail()

    const response = await request( app ).get( '/api/inbox' )

    expect( JSON.stringify( response.body ) ).not.toContain( 'body_html' )
    expect( JSON.stringify( response.body ).length ).toBeLessThan( 2000 )
  } )
} )

describe( 'POST /api/inbox/summarize', () => {
  it( 'summarizes a feed item into a job', async () => {
    await addFeed()

    const response = await request( app )
      .post( '/api/inbox/summarize' )
      .send( { items: refs( await inbox() ), model: 'claude-opus-5-5' } )

    expect( response.status ).toBe( 200 )

    const { jobs } = SummarizeInboxResponse.parse( response.body )

    expect( jobs ).toHaveLength( 1 )
    expect( jobs[ 0 ] )
      .toMatchObject( { summary_model: 'claude-opus-5-5', feed_name: 'Example Blog' } )
    expect( await inbox() ).toEqual( [] )
  } )

  it( 'summarizes a newsletter email into a job with its Gmail source', async () => {
    const message = addEmail()

    const response = await request( app )
      .post( '/api/inbox/summarize' )
      .send( { items: [ { kind: 'gmail', id: message.id } ] } )

    expect( response.status ).toBe( 200 )

    const { jobs } = SummarizeInboxResponse.parse( response.body )

    expect( jobs[ 0 ] ).toMatchObject( {
      status: 'summarizing',
      gmail_source_id: message.source_id,
      gmail_source_name: 'Idea digest',
      title: newsletter.subject,
    } )
    expect( await inbox() ).toEqual( [] )
  } )

  it( 'summarizes both kinds in one request', async () => {
    await addFeed()
    addEmail()

    const response = await request( app )
      .post( '/api/inbox/summarize' )
      .send( { items: refs( await inbox() ) } )

    expect( SummarizeInboxResponse.parse( response.body ).jobs ).toHaveLength( 2 )
  } )

  it( 'returns the jobs that worked when only some emails failed', async () => {
    const good = addEmail()
    const bad = addEmail( { body_html: '<p>Hi.</p>', body_text: 'Hi.', subject: 'Too short' } )

    const response = await request( app ).post( '/api/inbox/summarize' ).send( { items: [
      { kind: 'gmail', id: good.id },
      { kind: 'gmail', id: bad.id },
    ] } )

    expect( response.status ).toBe( 200 )
    expect( SummarizeInboxResponse.parse( response.body ).jobs ).toHaveLength( 1 )
    expect( ( await inbox() ).map( ( { id } ) => id ) ).toEqual( [ bad.id ] )
  } )

  it( 'returns 422 naming the titles when every item failed', async () => {
    const bad = addEmail( { body_html: '<p>Hi.</p>', body_text: 'Hi.', subject: 'Too short' } )

    const response = await request( app )
      .post( '/api/inbox/summarize' )
      .send( { items: [ { kind: 'gmail', id: bad.id } ] } )

    expect( response.status ).toBe( 422 )
    expect( response.body ).toEqual( {
      error: 'Could not summarize "Too short" (This email has too little text to summarize)',
    } )
    expect( await inbox() ).toHaveLength( 1 )
  } )

  it.each( [
    [ 'no items', { items: [] } ],
    [ 'no body', {} ],
    [ 'an item with an unknown kind', { items: [ { kind: 'rss', id: unknown } ] } ],
    [ 'an item with an id that is not a uuid', { items: [ { kind: 'feed', id: 'x' } ] } ],
    [ 'a bare id', { items: [ unknown ] } ],
    [
      'more than 50 items',
      { items: Array.from( { length: 51 }, () => ( { kind: 'gmail', id: crypto.randomUUID() } ) ) },
    ],
  ] )( 'returns 400 with %s', async ( _name, body ) => {
    const response = await request( app ).post( '/api/inbox/summarize' ).send( body )

    expect( response.status ).toBe( 400 )
  } )

  it( 'returns 400 for an unknown model and queues nothing', async () => {
    const message = addEmail()

    const response = await request( app )
      .post( '/api/inbox/summarize' )
      .send( { items: [ { kind: 'gmail', id: message.id } ], model: 'claude-nope' } )

    expect( response.status ).toBe( 400 )
    expect( await inbox() ).toHaveLength( 1 )
  } )

  it( 'returns 409 when an item is not in the inbox, and queues nothing', async () => {
    const message = addEmail()

    const response = await request( app ).post( '/api/inbox/summarize' ).send( { items: [
      { kind: 'gmail', id: message.id },
      { kind: 'gmail', id: unknown },
    ] } )

    expect( response.status ).toBe( 409 )
    expect( JSON.stringify( response.body ) ).toContain( unknown )
    expect( await inbox() ).toHaveLength( 1 )
  } )
} )

describe( 'POST /api/inbox/dismiss', () => {
  it( 'dismisses both kinds with 204', async () => {
    await addFeed()
    addEmail()

    const response = await request( app )
      .post( '/api/inbox/dismiss' )
      .send( { items: refs( await inbox() ) } )

    expect( response.status ).toBe( 204 )
    expect( await inbox() ).toEqual( [] )
  } )

  it( 'ignores items that are not in the inbox', async () => {
    const response = await request( app )
      .post( '/api/inbox/dismiss' )
      .send( { items: [ { kind: 'gmail', id: unknown }, { kind: 'feed', id: unknown } ] } )

    expect( response.status ).toBe( 204 )
  } )

  it.each( [
    [ 'no items', { items: [] } ],
    [ 'an id that is not a uuid', { items: [ { kind: 'gmail', id: 'x' } ] } ],
    [ 'an unknown kind', { items: [ { kind: 'rss', id: unknown } ] } ],
    [
      'more than 200 items',
      { items: Array.from( { length: 201 }, () => ( { kind: 'feed', id: crypto.randomUUID() } ) ) },
    ],
  ] )( 'returns 400 with %s', async ( _name, body ) => {
    const response = await request( app ).post( '/api/inbox/dismiss' ).send( body )

    expect( response.status ).toBe( 400 )
  } )
} )

describe( 'the old feed-item routes', () => {
  it.each( [
    [ 'get', '/api/feed-items' ],
    [ 'post', '/api/feed-items/summarize' ],
    [ 'post', '/api/feed-items/dismiss' ],
  ] as const )( 'are gone: %s %s answers 404', async ( method, path ) => {
    const response = await request( app )[ method ]( path )

    expect( response.status ).toBe( 404 )
  } )
} )
