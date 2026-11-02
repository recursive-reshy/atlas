// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Shared
import { ListModelsResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Test support
import { signedInRequest as request } from '../test-support/auth.js'
// Clients
import { listSummaryModels } from '../clients/anthropicModels.client.js'
// Services
import { clearModelCache } from '../services/models.service.js'
// Logging
import { logger } from '../logger.js'

vi.mock( '../clients/anthropicModels.client.js' )

const listMock = vi.mocked( listSummaryModels )

beforeEach( () => {
  vi.resetAllMocks()
  clearModelCache()
  vi.spyOn( logger, 'error' ).mockImplementation( () => undefined )
} )

describe( 'GET /api/models', () => {
  it( 'returns the models from the API', async () => {
    const models = [ { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' } ]
    listMock.mockResolvedValue( models )

    const response = await request( app ).get( '/api/models' )

    expect( response.status ).toBe( 200 )
    expect( ListModelsResponse.parse( response.body ) ).toEqual( { models, source: 'api' } )
  } )

  it( 'falls back to the default model when Anthropic cannot be reached', async () => {
    listMock.mockRejectedValue( new Error( 'offline' ) )

    const response = await request( app ).get( '/api/models' )

    expect( response.status ).toBe( 200 )
    expect( ListModelsResponse.parse( response.body ) ).toEqual( {
      models: [ { id: 'claude-sonnet-5-5', display_name: 'claude-sonnet-5-5' } ],
      source: 'fallback',
    } )
  } )
} )
