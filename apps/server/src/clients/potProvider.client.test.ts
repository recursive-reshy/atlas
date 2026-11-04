// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest'
// Clients
import { checkPotProvider } from './potProvider.client.js'

const URL_ = 'http://pot-provider:4416'

describe( 'checkPotProvider', () => {
  let fetchMock: MockInstance< typeof fetch >

  beforeEach( () => {
    fetchMock = vi.spyOn( globalThis, 'fetch' )
  } )

  afterEach( () => {
    vi.restoreAllMocks()
  } )

  it( 'gets /ping and returns the provider\'s version', async () => {
    fetchMock.mockResolvedValue(
      new Response( JSON.stringify( { server_uptime: 12.5, version: '2.0.2' } ) ),
    )

    await expect( checkPotProvider( URL_ ) ).resolves.toEqual( { version: '2.0.2' } )
    expect( fetchMock.mock.calls[ 0 ]?.[ 0 ] ).toBe( 'http://pot-provider:4416/ping' )
  } )

  it( 'does not double the slash when the address ends with one', async () => {
    fetchMock.mockResolvedValue(
      new Response( JSON.stringify( { server_uptime: 1, version: '2.0.2' } ) ),
    )

    await checkPotProvider( `${ URL_ }/` )

    expect( fetchMock.mock.calls[ 0 ]?.[ 0 ] ).toBe( 'http://pot-provider:4416/ping' )
  } )

  it( 'gives the request a two second limit', async () => {
    fetchMock.mockResolvedValue(
      new Response( JSON.stringify( { server_uptime: 1, version: '2.0.2' } ) ),
    )

    await checkPotProvider( URL_ )

    expect( fetchMock.mock.calls[ 0 ]?.[ 1 ]?.signal ).toBeInstanceOf( AbortSignal )
  } )

  it( 'throws a readable message when it cannot connect', async () => {
    fetchMock.mockRejectedValue(
      new TypeError( 'fetch failed', { cause: new Error( 'ECONNREFUSED' ) } ),
    )

    await expect( checkPotProvider( URL_ ) )
      .rejects.toThrow( 'Could not reach the PO token provider: ECONNREFUSED' )
  } )

  it( 'says so when the request times out', async () => {
    fetchMock.mockRejectedValue( new DOMException( 'The operation timed out.', 'TimeoutError' ) )

    await expect( checkPotProvider( URL_ ) )
      .rejects.toThrow( 'The PO token provider did not answer within 2 seconds' )
  } )

  it( 'throws with the status on a non-200 answer', async () => {
    fetchMock.mockResolvedValue( new Response( 'no', { status: 500 } ) )

    await expect( checkPotProvider( URL_ ) )
      .rejects.toThrow( 'The PO token provider answered 500' )
  } )

  it( 'throws when the answer is not the provider\'s ping', async () => {
    fetchMock.mockResolvedValue( new Response( '<html>hello</html>' ) )

    await expect( checkPotProvider( URL_ ) )
      .rejects.toThrow( 'The PO token provider\'s answer was not what a provider sends' )

    fetchMock.mockResolvedValue( new Response( JSON.stringify( { version: 2 } ) ) )

    await expect( checkPotProvider( URL_ ) )
      .rejects.toThrow( 'The PO token provider\'s answer was not what a provider sends' )
  } )
} )
