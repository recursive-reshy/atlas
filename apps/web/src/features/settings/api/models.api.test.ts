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
import { modelsFixture } from '#src/features/jobs/fixtures/summarizer.fixture'
import { listModels } from './models.api'

const fetchMock = vi.fn()

beforeEach( () => {
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'listModels', () => {
  it( 'gets /api/models and returns the parsed response', async () => {
    const body = JSON.stringify( modelsFixture() )
    fetchMock.mockResolvedValue( new Response( body, { status: 200 } ) )

    await expect( listModels() ).resolves.toEqual( modelsFixture() )
    expect( fetchMock ).toHaveBeenCalledWith( '/api/models', undefined )
  } )

  it( 'rejects a response with an unknown source', async () => {
    const body = { models: [], source: 'cache' }
    fetchMock.mockResolvedValue( new Response( JSON.stringify( body ), { status: 200 } ) )

    await expect( listModels() ).rejects.toThrow( 'Unexpected response from the server' )
  } )
} )
