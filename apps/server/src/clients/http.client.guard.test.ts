// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'

// The guard is on here; the rest of the suite runs with FETCH_ALLOW_PRIVATE=1
vi.mock( '../config.js', () => ( {
  config: { fetchAllowPrivate: false, logLevel: 'silent', vaultsPath: '/vaults' },
} ) )

const lookup = vi.hoisted( () => vi.fn() )

vi.mock( 'node:dns/promises', () => ( { lookup, default: { lookup } } ) )

// Errors
import { ValidationError } from '../errors.js'
// Clients
import { fetchResource } from './http.client.js'

const options = { accept: 'text/html', maxBytes: 1024, timeoutMs: 2000 }
const fetchMock = vi.fn()
const refused = new ValidationError( "That address can't be fetched" )
const answer = ( address: string ) => Promise.resolve( [ { address, family: 4 } ] )

beforeEach( () => {
  lookup.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal( 'fetch', fetchMock )
} )

afterEach( () => {
  vi.unstubAllGlobals()
} )

describe( 'fetchResource address guard', () => {
  it( 'refuses a hostname that resolves to a private address, without fetching', async () => {
    lookup.mockImplementation( () => answer( '172.18.0.3' ) )

    await expect( fetchResource( 'http://agent:8100/', options ) ).rejects.toThrow( refused )
    expect( fetchMock ).not.toHaveBeenCalled()
  } )

  it( 'refuses the cloud metadata address', async () => {
    await expect( fetchResource( 'http://169.254.169.254/latest/meta-data', options ) )
      .rejects.toBeInstanceOf( ValidationError )
    expect( fetchMock ).not.toHaveBeenCalled()
  } )

  it( 'fetches a public host', async () => {
    lookup.mockImplementation( () => answer( '93.184.216.34' ) )
    fetchMock.mockResolvedValue( new Response( 'ok', { status: 200 } ) )

    expect( ( await fetchResource( 'https://example.com/', options ) ).body ).toBe( 'ok' )
  } )

  it( 'checks again after a redirect and refuses a private target', async () => {
    lookup.mockImplementation( ( host: string ) =>
      answer( host === 'example.com' ? '93.184.216.34' : '10.0.0.9' ) )
    fetchMock.mockResolvedValueOnce(
      new Response( null, { status: 302, headers: { Location: 'http://internal.example/x' } } ),
    )

    await expect( fetchResource( 'https://example.com/', options ) ).rejects.toThrow( refused )
    expect( fetchMock ).toHaveBeenCalledTimes( 1 )
  } )
} )
