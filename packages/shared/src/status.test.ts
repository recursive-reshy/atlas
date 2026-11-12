// Packages
import { describe, it, expect } from 'vitest'
// Status
import {
  AppHealthKind,
  GetHealthErrorsResponse,
  GetStatusResponse,
  HealthError,
  HealthKind,
  HealthState,
  StatusRow,
  UserHealthKind,
  VaultSyncStatusFile,
} from './status.js'

const row = {
  kind: 'feed',
  id: '3f2b8c1e-6d1a-4b8e-9a53-0c1d2e3f4a5b',
  name: 'A blog',
  state: 'failing',
  last_checked_at: '2026-10-22T10:00:00.000Z',
  last_success_at: null,
  last_error: 'Could not reach the feed',
  failing_since: '2026-10-22T09:00:00.000Z',
  detail: null,
}

describe( 'HealthKind', () => {
  it.each( [
    'feed',
    'gmail_source',
    'gmail_connection',
    'calendar_connection',
    'vault_sync',
    'agent',
    'transcription',
    'replication',
    'claude',
  ] )(
    'accepts %s',
    ( kind ) => {
      expect( HealthKind.parse( kind ) ).toBe( kind )
    },
  )

  it.each( [ 'vault', 'whisper', 'backup', 'pot_provider' ] )( 'rejects %s', ( kind ) => {
    expect( HealthKind.safeParse( kind ).success ).toBe( false )
  } )
} )

describe( 'AppHealthKind and UserHealthKind', () => {
  it( 'split the kinds into app services and a user\'s own sources', () => {
    expect( AppHealthKind.options )
      .toEqual( [ 'agent', 'transcription', 'replication', 'claude' ] )
    expect( UserHealthKind.options ).toEqual( [
      'feed',
      'gmail_source',
      'gmail_connection',
      'calendar_connection',
      'vault_sync',
    ] )
  } )

  it( 'cover HealthKind exactly', () => {
    expect( [ ...AppHealthKind.options, ...UserHealthKind.options ].sort() )
      .toEqual( [ ...HealthKind.options ].sort() )
  } )
} )

describe( 'HealthState', () => {
  it( 'accepts ok, failing and off only', () => {
    expect( [ 'ok', 'failing', 'off' ].map( ( s ) => HealthState.safeParse( s ).success ) )
      .toEqual( [ true, true, true ] )
    expect( HealthState.safeParse( 'unknown' ).success ).toBe( false )
  } )
} )

describe( 'StatusRow', () => {
  it( 'parses a failing row with null times and detail', () => {
    expect( StatusRow.parse( row ) ).toEqual( row )
  } )

  it( 'parses a singleton row with the id default and a detail', () => {
    const replication = {
      ...row,
      kind: 'replication',
      id: 'default',
      state: 'ok',
      detail: 'Last synced 10:00',
    }

    expect( StatusRow.parse( replication ) ).toEqual( replication )
  } )

  it( 'rejects an unknown state', () => {
    expect( StatusRow.safeParse( { ...row, state: 'broken' } ).success ).toBe( false )
  } )

  it( 'rejects a missing name', () => {
    expect( StatusRow.safeParse( { ...row, name: undefined } ).success ).toBe( false )
  } )
} )

describe( 'GetStatusResponse', () => {
  it( 'parses rows with a failing count', () => {
    const body = { rows: [ row ], failing_count: 1 }

    expect( GetStatusResponse.parse( body ) ).toEqual( body )
  } )

  it( 'requires failing_count', () => {
    expect( GetStatusResponse.safeParse( { rows: [ row ] } ).success ).toBe( false )
  } )

  it( 'rejects a negative or fractional failing_count', () => {
    expect( GetStatusResponse.safeParse( { rows: [], failing_count: -1 } ).success ).toBe( false )
    expect( GetStatusResponse.safeParse( { rows: [], failing_count: 1.5 } ).success ).toBe( false )
  } )
} )

describe( 'HealthError and GetHealthErrorsResponse', () => {
  const error = { at: '2026-10-22T10:00:00.000Z', message: 'Timed out' }

  it( 'parses an error', () => {
    expect( HealthError.parse( error ) ).toEqual( error )
  } )

  it( 'rejects an error without a time', () => {
    expect( HealthError.safeParse( { message: 'Timed out' } ).success ).toBe( false )
  } )

  it( 'parses a list of errors, including none', () => {
    expect( GetHealthErrorsResponse.parse( { errors: [ error ] } ).errors ).toHaveLength( 1 )
    expect( GetHealthErrorsResponse.parse( { errors: [] } ).errors ).toEqual( [] )
  } )
} )

describe( 'VaultSyncStatusFile', () => {
  const file = {
    state: 'running',
    since: '2026-10-22T09:00:00.000Z',
    heartbeat_at: '2026-10-22T10:00:00.000Z',
    last_error: null,
    cli_version: '1.2.3',
  }

  it( 'parses the file the sync container writes', () => {
    expect( VaultSyncStatusFile.parse( file ) ).toEqual( file )
  } )

  it.each( [ 'starting', 'running', 'failed' ] )( 'accepts the state %s', ( state ) => {
    expect( VaultSyncStatusFile.parse( { ...file, state } ).state ).toBe( state )
  } )

  it( 'keeps the last error of a failed sync', () => {
    const failed = { ...file, state: 'failed', last_error: 'Login expired' }

    expect( VaultSyncStatusFile.parse( failed ).last_error ).toBe( 'Login expired' )
  } )

  it( 'rejects an unknown state, a time that is not ISO and a missing field', () => {
    expect( VaultSyncStatusFile.safeParse( { ...file, state: 'paused' } ).success ).toBe( false )
    expect( VaultSyncStatusFile.safeParse( { ...file, heartbeat_at: 'yesterday' } ).success )
      .toBe( false )
    expect( VaultSyncStatusFile.safeParse( { ...file, since: undefined } ).success ).toBe( false )
    expect( VaultSyncStatusFile.safeParse( { ...file, last_error: undefined } ).success )
      .toBe( false )
  } )
} )
