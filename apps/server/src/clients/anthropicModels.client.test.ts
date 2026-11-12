// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
// Clients
import { listSummaryModels } from './anthropicModels.client.js'

const { list } = vi.hoisted( () => ( { list: vi.fn() } ) )

vi.mock( '@anthropic-ai/sdk', () => {
  class MockAnthropic {
    models = { list }
  }

  return { default: MockAnthropic }
} )
vi.mock( '../config.js', () => ( {
  config: { claudeAuth: { kind: 'api_key', key: 'sk-test' }, summaryTimeoutMs: 12_345 },
} ) )

type Fake = Record< string, unknown >

const model = ( id: string, overrides: Fake = {} ): Fake => ( {
  id,
  display_name: `Display ${ id }`,
  max_tokens: 128_000,
  capabilities: {
    structured_outputs: { supported: true },
    effort: { medium: { supported: true } },
  },
  ...overrides,
} )

// for await also reads a plain array, which stands in for the SDK's auto-paging result
const pages = ( ...items: Fake[][] ): Fake[] => items.flat()

beforeEach( () => {
  list.mockReset()
  list.mockReturnValue( pages( [ model( 'a' ), model( 'b' ) ] ) )
} )

describe( 'listSummaryModels', () => {
  it( 'returns id and display name in the order the API gives', async () => {
    expect( await listSummaryModels() ).toEqual( [
      { id: 'a', display_name: 'Display a' },
      { id: 'b', display_name: 'Display b' },
    ] )
  } )

  it( 'asks only for active models, with the timeout and one retry per request', async () => {
    await listSummaryModels()

    expect( list ).toHaveBeenCalledWith(
      expect.objectContaining( { lifecycle: [ 'active' ] } ),
      { timeout: 12_345, maxRetries: 1 },
    )
  } )

  it( 'reads every page', async () => {
    list.mockReturnValue( pages( [ model( 'a' ) ], [ model( 'b' ) ], [ model( 'c' ) ] ) )

    expect( ( await listSummaryModels() ).map( ( { id } ) => id ) ).toEqual( [ 'a', 'b', 'c' ] )
  } )

  it( 'drops a model without structured outputs', async () => {
    list.mockReturnValue( pages( [
      model( 'no-so', { capabilities: {
        structured_outputs: { supported: false },
        effort: { medium: { supported: true } },
      } } ),
      model( 'ok' ),
    ] ) )

    expect( ( await listSummaryModels() ).map( ( { id } ) => id ) ).toEqual( [ 'ok' ] )
  } )

  it( 'drops a model without medium effort', async () => {
    list.mockReturnValue( pages( [
      model( 'no-effort', { capabilities: {
        structured_outputs: { supported: true },
        effort: { medium: { supported: false } },
      } } ),
      model( 'ok' ),
    ] ) )

    expect( ( await listSummaryModels() ).map( ( { id } ) => id ) ).toEqual( [ 'ok' ] )
  } )

  it( 'drops a model whose max_tokens is below the summary limit, keeps null', async () => {
    list.mockReturnValue( pages( [
      model( 'small', { max_tokens: 15_999 } ),
      model( 'exact', { max_tokens: 16_000 } ),
      model( 'unknown', { max_tokens: null } ),
    ] ) )

    const ids = ( await listSummaryModels() ).map( ( { id } ) => id )

    expect( ids ).toEqual( [ 'exact', 'unknown' ] )
  } )

  it( 'drops a model with no capabilities', async () => {
    list.mockReturnValue( pages( [ model( 'none', { capabilities: null } ), model( 'ok' ) ] ) )

    expect( ( await listSummaryModels() ).map( ( { id } ) => id ) ).toEqual( [ 'ok' ] )
  } )

  it( 'lets an API error through', async () => {
    list.mockImplementation( () => {
      throw new Error( 'Unauthorized' )
    } )

    await expect( listSummaryModels() ).rejects.toThrow( 'Unauthorized' )
  } )

  it( 'lets an error while paging through', async () => {
    list.mockReturnValue( {
      [ Symbol.asyncIterator ]: () => ( {
        next: () => Promise.reject( new Error( 'Rate limited' ) ),
      } ),
    } )

    await expect( listSummaryModels() ).rejects.toThrow( 'Rate limited' )
  } )
} )
