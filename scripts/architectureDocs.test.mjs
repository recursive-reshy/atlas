// Guards for docs/architecture.md and the root CLAUDE.md summary of it (1.0 cleanup).
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

test( 'the root CLAUDE.md keeps a short summary and points at docs/architecture.md', () => {
  const text = read( 'CLAUDE.md' )
  const start = text.indexOf( '\n## Architecture\n' )
  assert.ok( start !== -1 )
  const section = text.slice( start, text.indexOf( '\n## ', start + 1 ) ).trim().split( '\n' ).slice( 1 ).filter( ( line ) => line.trim() )
  assert.ok( section.length >= 5 && section.length <= 9, `the summary is ${ section.length } lines, want 5–8 plus the pointer` )
  assert.ok( Math.max( ...section.map( ( line ) => line.length ) ) < 600, 'a summary line is a paragraph again' )
  assert.ok( text.includes( 'Read docs/architecture.md before changing how a part works; update it in the same commit when you do.' ) )
  const precedence = text.slice( text.indexOf( '## Precedence' ), text.indexOf( '## Rules that span apps' ) )
  assert.match( precedence, /2\. The TRD and ADRs override[^\n]*docs\/architecture\.md/ )
} )

test( 'the Git section works on release branches and keeps the old rules (v1.1 onwards)', () => {
  const text = read( 'CLAUDE.md' )
  const git = text.slice( text.indexOf( '\n## Git' ), text.indexOf( '\n## Before you stop' ) )
  assert.match( git, /release branch named in the version's `tasks\.md`/ )
  assert.match( git, /release\/1\.1\.0/ )
  assert.match( git, /never on `main`/ )
  assert.match( git, /Push after every commit to that branch/ )
  assert.match( git, /Never merge, never tag, never push to `main`/ )
  assert.match( git, /--no-ff/ )
  assert.match( git, /never equal a tag name/ )
  assert.match( git, /merges `main` into the branch/ )
  assert.match( git, /renumbered after any migration that came from `main`, before it is locked/ )
  assert.doesNotMatch( git, /Work on `main`\./ )
  for( const kept of [ 'Stage files by name', 'never `git add -A`', 'Never `--amend`', 'force-push', 'If a push fails, stop and report it', 'Conventional messages' ] ) {
    assert.ok( git.includes( kept ), `the Git section lost: ${ kept }` )
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
