// Guards for the release version (task 5.5): every place that states it agrees, and from 1.0 it is >= 1.0.0.
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )
const read = ( file ) => readFileSync( join( root, file ), 'utf8' )
const version = JSON.parse( read( 'package.json' ) ).version

test( 'the version is 1.0.0 or later (ADR 0084)', () => {
  assert.ok( Number( version.split( '.' )[ 0 ] ) >= 1, `root package.json says ${ version }` )
} )

test( 'every package, the agent and its lock entry state the same version', () => {
  for( const file of [ 'apps/agent/package.json', 'apps/server/package.json', 'apps/web/package.json', 'e2e/package.json', 'packages/shared/package.json' ] ) {
    assert.equal( JSON.parse( read( file ) ).version, version, file )
  }
  assert.match( read( 'apps/agent/pyproject.toml' ), new RegExp( `^version = "${ version }"$`, 'm' ) )
  assert.match( read( 'apps/agent/uv.lock' ), new RegExp( `name = "atlas-agent"\\nversion = "${ version }"` ) )
} )

test( 'docs/README.md has a line for the current version, and its tasks.md exists', () => {
  const folder = `v${ version }`
  const line = read( 'docs/README.md' ).split( '\n' ).find( ( text ) => text.startsWith( `- **v${ version }` ) )
  assert.ok( line, `no line for v${ version }` )
  assert.ok( existsSync( join( root, 'docs', folder, 'tasks.md' ) ), `docs/${ folder }/tasks.md` )
} )
