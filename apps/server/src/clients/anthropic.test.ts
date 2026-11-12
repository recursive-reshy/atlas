// Packages
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

type Auth = { kind: 'api_key', key: string } | { kind: 'federation' }
type Shared = { constructed: unknown[], mock: { auth: Auth } }

const { constructed, mock } = vi.hoisted( (): Shared => ( {
  constructed: [],
  mock: { auth: { kind: 'api_key', key: 'sk-test' } },
} ) )

vi.mock( '@anthropic-ai/sdk', () => ( {
  default: class MockAnthropic {
    constructor( options: unknown ) {
      constructed.push( options )
    }
  },
} ) )
vi.mock( '../config.js', () => ( { config: { get claudeAuth() {
  return mock.auth
} } } ) )

// The client is a module-level singleton, so each test loads a fresh copy
const load = async (): Promise< typeof import( './anthropic.js' ) > => {
  vi.resetModules()

  return import( './anthropic.js' )
}

beforeEach( () => {
  constructed.length = 0
  mock.auth = { kind: 'api_key', key: 'sk-test' }
} )

describe( 'getAnthropic', () => {
  it( 'builds one client for the process, however often it is asked', async () => {
    const { getAnthropic } = await load()
    const first = getAnthropic()

    expect( getAnthropic() ).toBe( first )
    expect( getAnthropic() ).toBe( first )
    expect( constructed ).toHaveLength( 1 )
  } )

  it( 'gives the client the key and no timeout or retry of its own', async () => {
    const { getAnthropic } = await load()

    getAnthropic()

    expect( constructed ).toEqual( [ { apiKey: 'sk-test' } ] )
  } )

  it( 'passes no apiKey at all under federation, so the SDK reads the environment', async () => {
    mock.auth = { kind: 'federation' }
    const { getAnthropic } = await load()

    getAnthropic()

    expect( constructed ).toEqual( [ {} ] )
    expect( Object.keys( constructed[ 0 ] as object ) ).not.toContain( 'apiKey' )
  } )
} )
