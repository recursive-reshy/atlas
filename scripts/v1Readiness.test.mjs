// Guards for the 1.0 checklist and the 0.11.0 release notes (task 5.4, ADR 0084, ADR 0088).
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )
const read = ( file ) => readFileSync( join( root, file ), 'utf8' )

test( 'v1-readiness.md has the checklist, with the deferred rehearsal unticked and not blocking', () => {
  assert.ok( existsSync( join( root, 'docs/v1-readiness.md' ) ), 'docs/v1-readiness.md' )
  const text = read( 'docs/v1-readiness.md' )
  const items = text.split( '\n' ).filter( ( line ) => /^- \[[ x]\] /.test( line ) )
  const find = ( pattern ) => items.find( ( line ) => pattern.test( line ) )
  assert.match( find( /scratch check/i ) ?? '', /^- \[x\]/, 'the restore item is ticked' )
  assert.match( find( /VM rehearsal|upgrade rehearsal|rollback/i ) ?? '', /^- \[x\]/, 'the upgrade rehearsal is ticked' )
  const deferred = find( /new-VM rehearsal/i ) ?? ''
  assert.match( deferred, /^- \[ \]/, 'the new-VM rehearsal is unticked' )
  assert.match( deferred, /deferred, ADR 0088/ )
  assert.match( text, /does not block 1\.0|doesn't block 1\.0/i )
  assert.match( find( /soak|one to two weeks/i ) ?? '', /waived \(ADR 0088\)/, 'the soak is recorded as waived' )
  assert.match( find( /Status rows/i ) ?? '', /^- \[x\]/ )
  assert.match( find( /open fault/i ) ?? '', /^- \[x\]/ )
  assert.match( text, /release\.sh 1\.0\.0/ )
  assert.match( text, /deploy\.sh 1\.0\.0/ )
} )

test( 'the 0.11.0 release notes cover the outline, and the README links both docs', () => {
  const file = 'docs/v0.11.0/release-notes.md'
  assert.ok( existsSync( join( root, file ) ), file )
  const text = read( file )
  for( const topic of [ /locked/i, /migration 14|duration_seconds/i, /\/api\/health/, /--restore-pre-migration/, /restore/i, /pinned|digest/i, /ADR 0084/, /ADR 0088/, /## Upgrading from 0\.10\.0/, /## Deferred/, /waived/i ] ) {
    assert.match( text, topic )
  }
  const readme = read( 'docs/README.md' )
  assert.match( readme, /\*\*v0\.11\.0 \(done\)/ )
  assert.match( readme, /\(v0\.11\.0\/release-notes\.md\)/ )
  assert.match( readme, /\(v1-readiness\.md\)/ )
  for( const [ doc, base ] of [ [ file, 'docs/v0.11.0' ], [ 'docs/v1-readiness.md', 'docs' ] ] ) {
    for( const [ , target ] of read( doc ).matchAll( /\]\(([^)#\s]+)(?:#[^)]*)?\)/g ) ) {
      if( /^[a-z]+:/.test( target ) ) continue
      assert.ok( existsSync( resolve( root, base, target ) ), `${ doc } links ${ target }, which does not exist` )
    }
  }
} )

test( 'every ADR file is listed in docs/README.md', () => {
  const readme = read( 'docs/README.md' )
  assert.match( readme, /decisions\/0088-restore-drill-scratch-check-only\.md/ )
} )

test( 'ADR 0088 records the three decisions and is on the tasks it covers', () => {
  const adr = read( 'docs/decisions/0088-restore-drill-scratch-check-only.md' )
  for( const topic of [ /scratch check/i, /deferred/i, /soak/i, /waived/i, /PRD §6\.4/, /TRD §5–6/, /bootstrap/, /Obsidian/ ] ) assert.match( adr, topic )
  const tasks = read( 'docs/v0.11.0/tasks.md' )
  for( const id of [ '5.3', '5.4' ] ) {
    const row = tasks.split( '\n' ).find( ( line ) => line.startsWith( `| ${ id } |` ) )
    assert.match( row ?? '', /0088/, `task ${ id } lists ADR 0088` )
  }
} )
