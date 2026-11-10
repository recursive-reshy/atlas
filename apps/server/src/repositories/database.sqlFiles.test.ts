// Node
import { readdirSync, readFileSync } from 'node:fs'
// Packages
import { describe, it, expect } from 'vitest'
// Repositories
import { migrationFiles, migrations } from './database.js'
import { LOCK_PATH, migrationHash, readLock } from './migrationLock.js'

const sqlDirectory = new URL( './sql/', import.meta.url )

describe( 'the schema SQL files', () => {
  it( 'has one file per migration, and no other .sql file', () => {
    const onDisk = readdirSync( sqlDirectory ).filter( ( name ) => name.endsWith( '.sql' ) )

    expect( migrationFiles ).toHaveLength( migrations.length )
    expect( onDisk.toSorted() )
      .toEqual( migrationFiles.map( ( name ) => `${ name }.sql` ).toSorted() )
  } )

  it( 'puts the baseline first and numbers the rest in order', () => {
    expect( migrationFiles[ 0 ] ).toBe( 'baseline' )
    expect( migrationFiles.slice( 1 ).map( ( name ) => Number.parseInt( name, 10 ) ) )
      .toEqual( migrationFiles.slice( 1 ).map( ( _, index ) => 11 + index ) )
  } )

  it( 'runs each file\'s exact bytes, so every locked hash still verifies', () => {
    const lock = readLock( LOCK_PATH )

    for( const [ index, name ] of migrationFiles.entries() ) {
      const sql = readFileSync( new URL( `./${ name }.sql`, sqlDirectory ), 'utf8' )

      expect( migrations[ index ] ).toBe( sql )
      expect( migrationHash( sql ) ).toBe( lock[ 10 + index ] )
    }
  } )
} )
