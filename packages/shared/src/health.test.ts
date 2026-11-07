// Packages
import { describe, it, expect } from 'vitest'
// Health
import { HealthResponse } from './health.js'

const configured = {
  ok: true,
  version: '0.11.0',
  schema: 14,
  replication: {
    configured: true,
    failing: false,
    last_success_at: '2026-11-07T10:00:00.000Z',
    last_checked_at: '2026-11-07T10:01:00.000Z',
  },
}

describe( 'HealthResponse', () => {
  it( 'accepts a configured replication state', () => {
    expect( HealthResponse.parse( configured ) ).toEqual( configured )
  } )

  it( 'accepts replication that is not configured, with null fields', () => {
    const body = {
      ...configured,
      replication: {
        configured: false,
        failing: null,
        last_success_at: null,
        last_checked_at: null,
      },
    }

    expect( HealthResponse.parse( body ) ).toEqual( body )
  } )

  it( 'accepts a configured replication that was never checked', () => {
    const body = {
      ...configured,
      replication: {
        configured: true,
        failing: false,
        last_success_at: null,
        last_checked_at: null,
      },
    }

    expect( HealthResponse.parse( body ) ).toEqual( body )
  } )

  it.each( [ 'ok', 'version', 'schema', 'replication' ] )( 'rejects a body without %s', ( key ) => {
    const body: Record< string, unknown > = { ...configured }

    delete body[ key ]
    expect( HealthResponse.safeParse( body ).success ).toBe( false )
  } )

  it( 'rejects a schema that is not a whole number', () => {
    expect( HealthResponse.safeParse( { ...configured, schema: 14.5 } ).success ).toBe( false )
  } )
} )
