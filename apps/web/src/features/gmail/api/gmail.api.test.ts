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
import { gmailAccountFixture, gmailLabelFixture } from '../fixtures/gmail.fixture'
import {
  GMAIL_CONNECT_URL,
  disconnectGmail,
  getGmailAccount,
  listGmailLabels,
} from './gmail.api'

const fetchMock = vi.fn()
const EMPTY_JSON = { headers: { 'Content-Type': 'application/json' }, body: '{}' }

const json = ( body: unknown, status = 200 ): Response => {
  return new Response( JSON.stringify( body ), { status } )
}

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'GMAIL_CONNECT_URL', () => {
  it( 'is the server route that starts the consent', () => {
    expect( GMAIL_CONNECT_URL ).toBe( '/api/gmail/connect' )
  } )
} )

describe( 'getGmailAccount', () => {
  it( 'gets the account', async () => {
    fetchMock.mockResolvedValue( json( { account: gmailAccountFixture() } ) )

    await expect( getGmailAccount() ).resolves.toEqual( gmailAccountFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/gmail/account', undefined )
  } )

  it( 'rejects a response that does not match the schema', async () => {
    fetchMock.mockResolvedValue( json( { account: { status: 'maybe' } } ) )

    await expect( getGmailAccount() ).rejects.toThrow( 'Unexpected response from the server' )
  } )

  it( 'throws the server\'s message on an error response', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Nope' }, 500 ) )

    await expect( getGmailAccount() ).rejects.toThrow( 'Nope' )
  } )
} )

describe( 'listGmailLabels', () => {
  it( 'gets the labels', async () => {
    fetchMock.mockResolvedValue( json( { labels: [ gmailLabelFixture() ] } ) )

    await expect( listGmailLabels() ).resolves.toEqual( [ gmailLabelFixture() ] )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/gmail/labels', undefined )
  } )

  it( 'throws the server\'s message when Gmail is not connected', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Gmail isn\'t connected' }, 409 ) )

    await expect( listGmailLabels() ).rejects.toThrow( 'Gmail isn\'t connected' )
  } )
} )

describe( 'disconnectGmail', () => {
  it( 'posts to disconnect and accepts an empty 204', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await expect( disconnectGmail() ).resolves.toBeUndefined()
    expect( fetchMock ).toHaveBeenCalledWith(
      '/api/gmail/disconnect',
      { method: 'POST', ...EMPTY_JSON },
    )
  } )

  it( 'throws on an error response', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Gmail isn\'t configured' }, 409 ) )

    await expect( disconnectGmail() ).rejects.toThrow( 'Gmail isn\'t configured' )
  } )
} )
