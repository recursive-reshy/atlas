// Packages
import { describe, expect, it } from 'vitest'
// Test support
import {
  loadSeed,
  schemaAt,
  seedExists,
  seededVersions,
  seedPath,
} from '../test-support/schemaAt.js'

describe( 'seed fixtures (ADR 0085)', () => {
  it( 'has a seed for every locked version from 13', () => {
    expect( seededVersions() ).toContain( 13 )

    for( const version of seededVersions() ) {
      expect(
        seedExists( version ),
        `Schema ${ version } is locked but has no seed at ${ seedPath( version ) }. `
        + 'Every released schema needs a seed of invented data (TRD §2.3).',
      ).toBe( true )
    }
  } )

  it.each( seededVersions() )( 'schema %i: the seed loads and fills every table', ( version ) => {
    const db = schemaAt( version )

    loadSeed( db, version )

    const tables = db
      .prepare( `SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name` )
      .all()
      .map( ( row ) => ( row as { name: string } ).name )

    const empty = tables.filter( ( name ) => {
      const { count } = db.prepare( `SELECT COUNT(*) AS count FROM "${ name }"` )
        .get() as { count: number }

      return count === 0
    } )

    expect( empty, `Tables with no row in the schema ${ version } seed` ).toEqual( [] )
    expect( db.pragma( 'foreign_key_check' ) ).toEqual( [] )
    db.close()
  } )
} )
