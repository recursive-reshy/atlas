// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
} from 'vitest'
import express from 'express'
import request from 'supertest'
// Shared
import { HealthResponse } from '@atlas/shared'
// App
import { app } from '../app.js'
// Repositories
import { SCHEMA_BASE, getDatabase, migrations } from '../repositories/database.js'
import { recordFailure, recordSuccess } from '../repositories/health.repository.js'
import { appVersion } from '../version.js'

const configMock = vi.hoisted( () => ( { litestreamMetricsUrl: null as string | null } ) )

vi.mock( '../config.js', async ( importOriginal ) => {
  const original = await importOriginal< { config: Record< string, unknown > } >()

  const get = ( target: Record< string, unknown >, key: string | symbol ): unknown => {
    return key === 'litestreamMetricsUrl'
      ? configMock.litestreamMetricsUrl
      : target[ key as string ]
  }

  return { ...original, config: new Proxy( original.config, { get } ) }
} )

const CHECKED = '2026-11-07T10:01:00.000Z'
const SYNCED = '2026-11-07T10:00:00.000Z'

beforeEach( () => {
  configMock.litestreamMetricsUrl = null
} )

const getBody = async (): Promise< HealthResponse > => {
  return HealthResponse.parse( ( await request( app ).get( '/api/health' ) ).body )
}

describe( 'GET /api/health', () => {
  it( 'responds 200 with JSON', async () => {
    const response = await request( app ).get( '/api/health' )

    expect( response.status ).toBe( 200 )
    expect( response.headers[ 'content-type' ] ).toMatch( /application\/json/ )
  } )

  it( 'matches the shared HealthResponse contract', async () => {
    const response = await request( app ).get( '/api/health' )

    expect( HealthResponse.parse( response.body ) ).toEqual( response.body )
  } )

  it( 'reports ok, the server version and the stored schema', async () => {
    const body = await getBody()

    expect( body.ok ).toBe( true )
    expect( body.version ).toBe( appVersion )
    expect( body.schema ).toBe( SCHEMA_BASE + migrations.length )
    expect( body.schema ).toBe( getDatabase().pragma( 'user_version', { simple: true } ) )
  } )

  it( 'says replication is not configured when LITESTREAM_METRICS_URL is unset', async () => {
    const body = await getBody()

    expect( body.replication ).toEqual( {
      configured: false,
      failing: null,
      last_success_at: null,
      last_checked_at: null,
    } )
  } )

  it( 'is configured, not failing and unchecked before the first check', async () => {
    configMock.litestreamMetricsUrl = 'http://litestream.test:9090/metrics'

    const body = await getBody()

    expect( body.replication ).toEqual( {
      configured: true,
      failing: false,
      last_success_at: null,
      last_checked_at: null,
    } )
  } )

  it( 'maps a healthy stored replication row', async () => {
    configMock.litestreamMetricsUrl = 'http://litestream.test:9090/metrics'
    recordSuccess( null, 'replication', 'default', SYNCED )
    recordSuccess( null, 'replication', 'default', CHECKED )

    const body = await getBody()

    expect( body.replication ).toEqual( {
      configured: true,
      failing: false,
      last_success_at: CHECKED,
      last_checked_at: CHECKED,
    } )
  } )

  it( 'maps a failing stored replication row', async () => {
    configMock.litestreamMetricsUrl = 'http://litestream.test:9090/metrics'
    recordSuccess( null, 'replication', 'default', SYNCED )
    recordFailure( null, 'replication', 'default', CHECKED, 'Litestream reported 2 sync errors' )

    const body = await getBody()

    expect( body.replication ).toEqual( {
      configured: true,
      failing: true,
      last_success_at: SYNCED,
      last_checked_at: CHECKED,
    } )
  } )

  it( 'ignores a stored replication row when replication is not configured', async () => {
    recordFailure( null, 'replication', 'default', CHECKED, 'old' )

    const body = await getBody()

    expect( body.replication.configured ).toBe( false )
    expect( body.replication.failing ).toBeNull()
  } )

  it( 'needs no session', async () => {
    expect( ( await request( app ).get( '/api/health' ) ).status ).toBe( 200 )
  } )
} )

// supertest connects from loopback; this puts another peer address on the socket
const asPeer = ( address: string ): express.Express => {
  const wrapper = express()

  wrapper.use( ( req, _res, next ) => {
    Object.defineProperty( req.socket, 'remoteAddress', { value: address, configurable: true } )
    next()
  } )
  wrapper.use( app )

  return wrapper
}

describe( 'GET /api/health peers', () => {
  it.each( [
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    '10.1.2.3',
    '172.18.0.4',
    '192.168.65.1',
    '::ffff:192.168.65.1',
    'fd00::5',
  ] )( 'answers a trusted peer (%s)', async ( address ) => {
    expect( ( await request( asPeer( address ) ).get( '/api/health' ) ).status ).toBe( 200 )
  } )

  it.each( [ '8.8.8.8', '203.0.113.9', '100.100.1.1', '169.254.1.1', '2606:4700::1' ] )(
    'answers 404 to anyone else (%s)',
    async ( address ) => {
      const response = await request( asPeer( address ) ).get( '/api/health' )

      expect( response.status ).toBe( 404 )
      expect( response.body ).toEqual( { error: 'Not Found' } )
    },
  )
} )
