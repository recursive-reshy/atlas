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
import { settingsFixture } from '../features/jobs/fixtures/summarizer.fixture'
import { ApiError } from '../lib/apiError'
import { getSettings, updateSettings } from './settings.api'

const fetchMock = vi.fn()

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'getSettings', () => {
  it( 'gets /api/settings and returns the parsed response', async () => {
    const body = JSON.stringify( settingsFixture() )
    fetchMock.mockResolvedValue( new Response( body, { status: 200 } ) )

    await expect( getSettings() ).resolves.toEqual( settingsFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/settings', undefined )
  } )

  it( 'rejects a response that does not match the schema', async () => {
    const body = JSON.stringify( { settings: {} } )
    fetchMock.mockResolvedValue( new Response( body, { status: 200 } ) )

    await expect( getSettings() ).rejects.toThrow( 'Unexpected response from the server' )
  } )
} )

describe( 'updateSettings', () => {
  it( 'patches only the given fields as JSON', async () => {
    const updated = settingsFixture( { default_model: 'claude-opus-5-5' } )
    fetchMock.mockResolvedValue( new Response( JSON.stringify( updated ), { status: 200 } ) )

    const result = updateSettings( { default_model: 'claude-opus-5-5' } )

    await expect( result ).resolves.toEqual( updated )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify( { default_model: 'claude-opus-5-5' } ),
    } )
  } )

  it( 'reports the server message for an unknown model', async () => {
    fetchMock.mockResolvedValue(
      new Response( JSON.stringify( { error: 'Unknown model: x' } ), { status: 400 } ),
    )

    const error: unknown = await updateSettings( { default_model: 'x' } )
      .catch( ( caught: unknown ) => caught )

    expect( error ).toBeInstanceOf( ApiError )
    expect( ( error as ApiError ).message ).toBe( 'Unknown model: x' )
  } )
} )
