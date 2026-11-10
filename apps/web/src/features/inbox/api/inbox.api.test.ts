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
import { ITEM_ID, feedItemFixture } from '#src/features/feeds/fixtures/feed.fixture'
import { GMAIL_ITEM_ID, gmailItemFixture } from '#src/features/gmail/fixtures/gmail.fixture'
import { jobFixture } from '#src/features/jobs/fixtures/job.fixture'
import { dismissInbox, listInbox, summarizeInbox } from './inbox.api'

const fetchMock = vi.fn()
const feedRef = { kind: 'feed' as const, id: ITEM_ID }
const gmailRef = { kind: 'gmail' as const, id: GMAIL_ITEM_ID }

const json = ( body: unknown, status = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

const jsonInit = ( body: unknown ): RequestInit => {
  return {
    method: 'POST',
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

describe( 'listInbox', () => {
  it( 'gets the feed items and the emails together', async () => {
    const items = [ gmailItemFixture(), feedItemFixture() ]
    fetchMock.mockResolvedValue( json( { items } ) )

    await expect( listInbox() ).resolves.toEqual( items )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/inbox', undefined )
  } )

  it( 'rejects a response that does not match the schema', async () => {
    fetchMock.mockResolvedValue( json( { items: [ { id: 'x' } ] } ) )

    await expect( listInbox() ).rejects.toThrow( 'Unexpected response from the server' )
  } )

  it( 'rejects an item with no kind, as the old feed-items route sent them', async () => {
    const old = Object.fromEntries(
      Object.entries( feedItemFixture() ).filter( ( [ key ] ) => key !== 'kind' ),
    )

    fetchMock.mockResolvedValue( json( { items: [ old ] } ) )

    await expect( listInbox() ).rejects.toThrow( 'Unexpected response from the server' )
  } )
} )

describe( 'summarizeInbox', () => {
  it( 'posts the items and choices as they are and returns the jobs', async () => {
    const jobs = [ jobFixture() ]
    fetchMock.mockResolvedValue( json( { jobs } ) )
    const body = { items: [ feedRef, gmailRef ], model: 'claude-sonnet-5-5' }

    await expect( summarizeInbox( body ) ).resolves.toEqual( jobs )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/inbox/summarize', jsonInit( body ) )
  } )

  it( 'throws the server\'s message on a conflict', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Not in the inbox: abc' }, 409 ) )

    await expect( summarizeInbox( { items: [ feedRef ] } ) ).rejects.toThrow(
      'Not in the inbox: abc',
    )
  } )

  it( 'throws the server\'s message when every item failed', async () => {
    const error = 'Could not summarize "A post" (This email has too little text to summarize)'

    fetchMock.mockResolvedValue( json( { error }, 422 ) )

    await expect( summarizeInbox( { items: [ gmailRef ] } ) ).rejects.toThrow( error )
  } )
} )

describe( 'dismissInbox', () => {
  it( 'posts the items', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await expect( dismissInbox( [ feedRef, gmailRef ] ) ).resolves.toBeUndefined()
    expect( fetchMock ).toHaveBeenCalledWith(
      '/api/inbox/dismiss',
      jsonInit( { items: [ feedRef, gmailRef ] } ),
    )
  } )

  it( 'throws the server\'s message', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Invalid request' }, 400 ) )

    await expect( dismissInbox( [ feedRef ] ) ).rejects.toThrow( 'Invalid request' )
  } )
} )
