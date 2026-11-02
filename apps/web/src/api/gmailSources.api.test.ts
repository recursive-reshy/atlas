// Shared
import type { CreateGmailSourceBody } from '@atlas/shared'
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
import {
  SOURCE_ID,
  gmailPreviewFixture,
  gmailSourceFixture,
} from '../test-support/gmail.fixture'
import {
  checkAllGmailSources,
  checkGmailSource,
  createGmailSource,
  deleteGmailSource,
  listGmailSources,
  previewGmailSource,
  updateGmailSource,
} from './gmailSources.api'

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

describe( 'listGmailSources', () => {
  it( 'gets the sources', async () => {
    fetchMock.mockResolvedValue( json( { sources: [ gmailSourceFixture() ] } ) )

    await expect( listGmailSources() ).resolves.toEqual( [ gmailSourceFixture() ] )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/gmail/sources', undefined )
  } )

  it( 'rejects a response that does not match the schema', async () => {
    fetchMock.mockResolvedValue( json( { sources: [ { id: 'x' } ] } ) )

    await expect( listGmailSources() ).rejects.toThrow( 'Unexpected response from the server' )
  } )
} )

describe( 'previewGmailSource', () => {
  const match = { kind: 'query', query: 'from:news@example.com' } as const

  it( 'posts the match and returns the preview', async () => {
    fetchMock.mockResolvedValue( json( gmailPreviewFixture() ) )

    await expect( previewGmailSource( match ) ).resolves.toEqual( gmailPreviewFixture() )
    expect( fetchMock ).toHaveBeenCalledWith(
      '/api/gmail/sources/preview',
      jsonInit( 'POST', { match } ),
    )
  } )

  it( 'throws the server\'s message', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Gmail isn\'t connected' }, 409 ) )

    await expect( previewGmailSource( match ) ).rejects.toThrow( 'Gmail isn\'t connected' )
  } )
} )

describe( 'createGmailSource', () => {
  it( 'posts the body and returns the source', async () => {
    fetchMock.mockResolvedValue( json( { source: gmailSourceFixture() }, 201 ) )
    const body: CreateGmailSourceBody = {
      name: 'Newsletters',
      match: { kind: 'labels', label_ids: [ 'Label_1' ] },
      destination: 'newsletter',
      backfill: '30d',
    }

    await expect( createGmailSource( body ) ).resolves.toEqual( gmailSourceFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/gmail/sources', jsonInit( 'POST', body ) )
  } )

  it( 'throws the server\'s message', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Unknown prompt profile' }, 400 ) )

    await expect( createGmailSource( {
      name: 'x',
      match: { kind: 'query', query: 'x' },
      destination: 'newsletter',
    } ) ).rejects.toThrow( 'Unknown prompt profile' )
  } )
} )

describe( 'updateGmailSource', () => {
  it( 'patches the source and returns it', async () => {
    const source = gmailSourceFixture( { enabled: false } )
    fetchMock.mockResolvedValue( json( { source } ) )

    await expect( updateGmailSource( SOURCE_ID, { enabled: false } ) ).resolves.toEqual( source )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/gmail/sources/${ SOURCE_ID }`,
      jsonInit( 'PATCH', { enabled: false } ),
    )
  } )

  it( 'can clear the profile', async () => {
    fetchMock.mockResolvedValue( json( { source: gmailSourceFixture() } ) )

    await updateGmailSource( SOURCE_ID, { profile_id: null } )

    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/gmail/sources/${ SOURCE_ID }`,
      jsonInit( 'PATCH', { profile_id: null } ),
    )
  } )
} )

describe( 'deleteGmailSource', () => {
  it( 'deletes and keeps the inbox items by default', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await expect( deleteGmailSource( SOURCE_ID, false ) ).resolves.toBeUndefined()
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/gmail/sources/${ SOURCE_ID }?remove_inbox_items=false`,
      { method: 'DELETE', ...EMPTY_JSON },
    )
  } )

  it( 'asks for the inbox items to be removed', async () => {
    fetchMock.mockResolvedValue( new Response( null, { status: 204 } ) )

    await deleteGmailSource( SOURCE_ID, true )

    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/gmail/sources/${ SOURCE_ID }?remove_inbox_items=true`,
      { method: 'DELETE', ...EMPTY_JSON },
    )
  } )

  it( 'throws on a missing source', async () => {
    fetchMock.mockResolvedValue( json( { error: 'Gmail source not found' }, 404 ) )

    await expect( deleteGmailSource( SOURCE_ID, false ) )
      .rejects.toThrow( 'Gmail source not found' )
  } )
} )

describe( 'checkGmailSource', () => {
  it( 'checks one source and returns it', async () => {
    const source = gmailSourceFixture( { last_error: 'Label not found in Gmail: Label_9' } )
    fetchMock.mockResolvedValue( json( { source } ) )

    await expect( checkGmailSource( SOURCE_ID ) ).resolves.toEqual( source )
    expect( fetchMock ).toHaveBeenCalledWith(
      `/api/gmail/sources/${ SOURCE_ID }/check`,
      { method: 'POST', ...EMPTY_JSON },
    )
  } )
} )

describe( 'checkAllGmailSources', () => {
  it( 'checks every source and returns them', async () => {
    fetchMock.mockResolvedValue( json( { sources: [ gmailSourceFixture() ] } ) )

    await expect( checkAllGmailSources() ).resolves.toEqual( [ gmailSourceFixture() ] )
    expect( fetchMock ).toHaveBeenCalledWith(
      '/api/gmail/sources/check',
      { method: 'POST', ...EMPTY_JSON },
    )
  } )
} )
