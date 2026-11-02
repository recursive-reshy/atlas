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
import { fetchReplicationMetrics, parseReplicationMetrics } from './litestreamMetrics.client.js'
// Test support
import { litestreamMetricsText } from '../test-support/litestreamMetrics.fixture.js'

describe( 'parseReplicationMetrics', () => {
  it( 'reads the sync and error counters, ignoring comments, blanks and other metrics', () => {
    expect( parseReplicationMetrics( litestreamMetricsText( 42, 3 ) ) )
      .toEqual( { syncCount: 42, syncErrors: 3 } )
  } )

  it( 'adds up a counter that has one series per database', () => {
    const text = [
      'litestream_sync_count{db="/a.db"} 10',
      'litestream_sync_count{db="/b.db"} 5',
      'litestream_sync_error_count{db="/a.db"} 1',
      'litestream_sync_error_count{db="/b.db"} 2',
    ].join( '\n' )

    expect( parseReplicationMetrics( text ) ).toEqual( { syncCount: 15, syncErrors: 3 } )
  } )

  it( 'reads a counter without labels, an exponent and a trailing timestamp', () => {
    const text = 'litestream_sync_count 1.2e+02 1700000000000\nlitestream_sync_error_count 0\n'

    expect( parseReplicationMetrics( text ) ).toEqual( { syncCount: 120, syncErrors: 0 } )
  } )

  it( 'treats a counter that has not appeared yet as zero', () => {
    expect( parseReplicationMetrics( 'go_goroutines 3\n' ) )
      .toEqual( { syncCount: 0, syncErrors: 0 } )
  } )

  it( 'does not mistake a metric that only starts with the name', () => {
    const text = 'litestream_sync_count_total{db="x"} 99\nlitestream_sync_count{db="x"} 4\n'

    expect( parseReplicationMetrics( text ).syncCount ).toBe( 4 )
  } )

  it( 'skips a sample whose value is not a number', () => {
    expect( parseReplicationMetrics( 'litestream_sync_count{db="x"} NaN\n' ).syncCount ).toBe( 0 )
  } )
} )

describe( 'fetchReplicationMetrics', () => {
  let fetchMock: MockInstance< typeof fetch >

  beforeEach( () => {
    fetchMock = vi.spyOn( globalThis, 'fetch' )
  } )

  afterEach( () => {
    vi.restoreAllMocks()
  } )

  it( 'gets the URL and parses the body', async () => {
    fetchMock.mockResolvedValue( new Response( litestreamMetricsText( 7, 0 ) ) )

    await expect( fetchReplicationMetrics( 'http://litestream:9090/metrics' ) )
      .resolves.toEqual( { syncCount: 7, syncErrors: 0 } )
    expect( fetchMock.mock.calls[ 0 ]?.[ 0 ] ).toBe( 'http://litestream:9090/metrics' )
  } )

  it( 'gives the request a two second limit', async () => {
    fetchMock.mockResolvedValue( new Response( '' ) )

    await fetchReplicationMetrics( 'http://litestream:9090/metrics' )

    const signal = fetchMock.mock.calls[ 0 ]?.[ 1 ]?.signal

    expect( signal ).toBeInstanceOf( AbortSignal )
  } )

  it( 'throws a readable message when it cannot connect', async () => {
    fetchMock.mockRejectedValue(
      new TypeError( 'fetch failed', { cause: new Error( 'ECONNREFUSED' ) } ),
    )

    await expect( fetchReplicationMetrics( 'http://litestream:9090/metrics' ) )
      .rejects.toThrow( 'Could not reach Litestream\'s metrics: ECONNREFUSED' )
  } )

  it( 'says so when the request times out', async () => {
    fetchMock.mockRejectedValue( new DOMException( 'The operation timed out.', 'TimeoutError' ) )

    await expect( fetchReplicationMetrics( 'http://litestream:9090/metrics' ) )
      .rejects.toThrow( 'Litestream\'s metrics did not answer within 2 seconds' )
  } )

  it( 'throws with the status on a non-200 answer', async () => {
    fetchMock.mockResolvedValue( new Response( 'no', { status: 503 } ) )

    await expect( fetchReplicationMetrics( 'http://litestream:9090/metrics' ) )
      .rejects.toThrow( 'Litestream\'s metrics answered 503' )
  } )
} )
