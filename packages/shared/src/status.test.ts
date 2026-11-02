// Packages
import { describe, it, expect } from 'vitest'
// Status
import {
  AppHealthKind,
  BackupResult,
  GetHealthErrorsResponse,
  GetStatusResponse,
  HealthError,
  HealthKind,
  HealthState,
  StatusRow,
  UserHealthKind,
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
    'vault_sync',
    'agent',
    'whisper',
    'backup',
    'transcription',
    'replication',
  ] )(
    'accepts %s',
    ( kind ) => {
      expect( HealthKind.parse( kind ) ).toBe( kind )
    },
  )

  it( 'rejects an unknown kind', () => {
    expect( HealthKind.safeParse( 'vault' ).success ).toBe( false )
  } )
} )

describe( 'AppHealthKind and UserHealthKind', () => {
  it( 'split the kinds into app services and a user\'s own sources', () => {
    expect( AppHealthKind.options ).toEqual( [
      'agent',
      'whisper',
      'backup',
      'transcription',
      'replication',
    ] )
    expect( UserHealthKind.options ).toEqual( [
      'feed',
      'gmail_source',
      'gmail_connection',
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
    const backup = { ...row, kind: 'backup', id: 'default', state: 'ok', detail: 'a.db, 1 MB' }

    expect( StatusRow.parse( backup ) ).toEqual( backup )
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

describe( 'BackupResult', () => {
  const result = {
    file: 'atlas-20261022-180000.db',
    bytes: 4096,
    at: '2026-10-22T10:00:00.000Z',
  }

  it( 'parses a result', () => {
    expect( BackupResult.parse( result ) ).toEqual( result )
  } )

  it( 'rejects negative bytes and a missing file', () => {
    expect( BackupResult.safeParse( { ...result, bytes: -1 } ).success ).toBe( false )
    expect( BackupResult.safeParse( { bytes: 1, at: result.at } ).success ).toBe( false )
  } )
} )
