// Guards for docs/architecture.md and the docs index (1.0 cleanup). CLAUDE.md wording is not guarded (TRD 2.3).
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )
const read = ( file ) => readFileSync( join( root, file ), 'utf8' )

const SECTIONS = [
  'Request flow and source adapters', 'Transcription', 'Articles, feeds and Gmail', 'Summaries and prompt profiles',
  'Linking and the agent', 'Review and save', 'Lifecycle, logs and Status', 'Backups and replication', 'Settings',
  'Melete', 'Accounts and multi-user', 'Hosting on the VM',
]

test( 'docs/architecture.md has one section per area, in order, and keeps the ADR references', () => {
  const text = read( 'docs/architecture.md' )
  const headings = text.split( '\n' ).filter( ( line ) => line.startsWith( '## ' ) ).map( ( line ) => line.slice( 3 ) )
  assert.deepEqual( headings, SECTIONS )
  for( const adr of [ '0030', '0031', '0032', '0035', '0036', '0038', '0040', '0041', '0042', '0046', '0048', '0049', '0050', '0052', '0054', '0060', '0061', '0069', '0066', '0072', '0074', '0075', '0076', '0078', '0081', '0083' ] ) {
    assert.match( text, new RegExp( `\\b${ adr }\\b` ), `ADR ${ adr } is no longer named` )
  }
  for( const fact of [ 'POST /api/jobs', 'lifecycle.ts', 'recordCheck', 'GET /api/status', 'melete_notes', 'eligible_users', 'vaultRootFor', 'compose.prod.yml', 'docs/phone-access.md' ] ) {
    assert.ok( text.includes( fact ), `architecture.md no longer mentions ${ fact }` )
  }
} )

test( 'docs/README.md names architecture.md in the cleanup line and lists the user guides as they are', () => {
  const readme = read( 'docs/README.md' )
  const line = readme.split( '\n' ).find( ( text ) => text.includes( 'Docs cleanup (after 1.0)' ) )
  assert.ok( line, 'no "Docs cleanup (after 1.0)" line' )
  assert.match( line, /\(architecture\.md\)/ )
  assert.doesNotMatch( readme, /\]\(backups\.md\)/ )
  for( const guide of [ 'deploy.md', 'phone-access.md', 'google-cloud-setup.md', 'architecture.md' ] ) assert.match( readme, new RegExp( `\\]\\(${ guide.replace( '.', '\\.' ) }\\)` ) )
} )
