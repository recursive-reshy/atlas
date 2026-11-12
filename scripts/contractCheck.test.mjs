// The contract step of the gate (ADR 0104): regenerate the agent contract and fail if a file changed.
import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { changedFiles, snapshot } from './contractCheck.mjs'

const folderWith = ( files ) => {
  const dir = mkdtempSync( join( tmpdir(), 'atlas-contract-' ) )
  for( const [ name, content ] of Object.entries( files ) ) {
    mkdirSync( join( dir, name, '..' ), { recursive: true } )
    writeFileSync( join( dir, name ), content )
  }
  return dir
}

test( 'a snapshot holds every file under a folder and a single file by its path', () => {
  const dir = folderWith( { 'schema/a.json': 'A', 'schema/examples/b.json': 'B', 'c.ts': 'C' } )
  const shot = snapshot( dir, [ 'schema', 'c.ts' ] )
  assert.deepEqual( [ ...shot.keys() ].sort(), [ 'c.ts', 'schema/a.json', 'schema/examples/b.json' ] )
  assert.equal( shot.get( 'c.ts' ), 'C' )
} )

test( 'a missing path is an empty snapshot, not an error', () => {
  assert.equal( snapshot( folderWith( {} ), [ 'nope' ] ).size, 0 )
} )

test( 'changedFiles names changed, added and removed files, and nothing when equal', () => {
  const before = new Map( [ [ 'a', '1' ], [ 'b', '1' ], [ 'c', '1' ] ] )
  const after = new Map( [ [ 'a', '1' ], [ 'b', '2' ], [ 'd', '1' ] ] )
  assert.deepEqual( changedFiles( before, after ), [ 'b', 'c', 'd' ] )
  assert.deepEqual( changedFiles( before, before ), [] )
} )
