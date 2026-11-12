// Packages
import { describe, it, expect } from 'vitest'
// Test support
import '../test-support/database.setup.js'
// Repositories
import { getDatabase } from './database.js'

// Tables that are not data: they hold users and their access (ADR 0061), not a user's content.
const USER_TABLES = [ 'users', 'user_modules', 'sessions', 'app_settings' ]

// Health rows describe either a user's own source or an app service, so `user_id` is null for the
// app kinds and only for them (ADR 0065).
const HEALTH_TABLES = [ 'health_status', 'health_errors' ]

type Column = { name: string, notnull: number }
type ForeignKey = { table: string, from: string, to: string, on_delete: string }

const tables = (): string[] => {
  return getDatabase()
    .prepare( "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'" )
    .all()
    .map( ( row ) => ( row as { name: string } ).name )
}

const userIdColumn = ( table: string ): Column | undefined => {
  return ( getDatabase().pragma( `table_info(${ table })` ) as Column[] )
    .find( ( { name } ) => name === 'user_id' )
}

const cascadesToUsers = ( table: string ): boolean => {
  return ( getDatabase().pragma( `foreign_key_list(${ table })` ) as ForeignKey[] )
    .some( ( key ) => {
      return key.from === 'user_id' && key.table === 'users' && key.to === 'id'
        && key.on_delete === 'CASCADE'
    } )
}

const dataTables = (): string[] => tables().filter( ( table ) => !USER_TABLES.includes( table ) )

describe( 'the schema guard', () => {
  it( 'knows the data tables: everything but the user and access tables', () => {
    expect( USER_TABLES.filter( ( table ) => !tables().includes( table ) ) ).toEqual( [] )
    expect( dataTables().length ).toBeGreaterThan( 0 )
  } )

  it( 'gives user_modules and sessions a cascading user_id', () => {
    for( const table of [ 'user_modules', 'sessions' ] ) {
      expect( userIdColumn( table )?.notnull, table ).toBe( 1 )
      expect( cascadesToUsers( table ), table ).toBe( true )
    }
  } )

  it( 'gives every data table a NOT NULL user_id that cascades from users', () => {
    const owned = dataTables().filter( ( table ) => !HEALTH_TABLES.includes( table ) )

    for( const table of owned ) {
      expect( userIdColumn( table )?.notnull, `${ table }.user_id NOT NULL` ).toBe( 1 )
      expect( cascadesToUsers( table ), `${ table } cascades from users` ).toBe( true )
    }
  } )

  it( 'gives the health tables a nullable user_id that is null for app kinds only', () => {
    for( const table of HEALTH_TABLES ) {
      expect( tables(), table ).toContain( table )
      expect( userIdColumn( table )?.notnull, `${ table }.user_id nullable` ).toBe( 0 )
      expect( cascadesToUsers( table ), `${ table } cascades from users` ).toBe( true )

      const sql = ( getDatabase()
        .prepare( 'SELECT sql FROM sqlite_master WHERE name = ?' )
        .get( table ) as { sql: string } ).sql

      const kinds = "'agent', 'transcription', 'replication', 'claude'"

      expect( sql.replace( /\s+/g, ' ' ), `${ table } has the kind check` )
        .toContain( `CHECK ( ( kind IN ( ${ kinds } ) ) = ( user_id IS NULL ) )` )
    }
  } )

  it( 'finishes Phase 4: no data table is left without an owner', () => {
    expect( dataTables().filter( ( table ) => userIdColumn( table ) === undefined ) ).toEqual( [] )
  } )

  it( 'keeps a video\'s duration on the job, after its transcript is gone', () => {
    const columns = getDatabase().pragma( 'table_info(jobs)' ) as Column[]

    expect( columns.map( ( { name } ) => name ) ).toContain( 'duration_seconds' )
  } )

  it( 'has a usage_events view over the five run tables', () => {
    const columns = ( getDatabase().pragma( 'table_info(usage_events)' ) as Column[] )
      .map( ( { name } ) => name )

    expect( columns ).toEqual( [
      'user_id',
      'category',
      'input_tokens',
      'output_tokens',
      'cost_usd',
      'created_at',
    ] )
  } )
} )
