// Packages
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Clients
import { getAnthropic } from './anthropic.js'

const { constructed } = vi.hoisted( () => ( { constructed: [] as unknown[] } ) )

vi.mock( '@anthropic-ai/sdk', () => ( {
  default: class MockAnthropic {
    constructor( options: unknown ) {
      constructed.push( options )
    }
  },
} ) )
vi.mock( '../config.js', () => ( { config: { anthropicApiKey: 'sk-test' } } ) )

describe( 'getAnthropic', () => {
  it( 'builds one client for the process, however often it is asked', () => {
    const first = getAnthropic()

    expect( getAnthropic() ).toBe( first )
    expect( getAnthropic() ).toBe( first )
    expect( constructed ).toHaveLength( 1 )
  } )

  it( 'gives the client the key and no timeout or retry of its own', () => {
    getAnthropic()

    expect( constructed ).toEqual( [ { apiKey: 'sk-test' } ] )
  } )
} )
