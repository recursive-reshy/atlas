// Guards for the runbook docs/deploy.md (TRD 8, task 6.1): it covers every step it should, names only
// files that exist, and labels every cloud command as one for the admin to run.
import { execFileSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )
const read = ( file ) => readFileSync( join( root, file ), 'utf8' )

// Files the runbook may name that are created by the reader, not committed
const NOT_COMMITTED = new Set( [ 'deploy/release.env' ] )

test( 'the runbook exists and has a section for every step', () => {
  assert.ok( existsSync( join( root, 'docs/deploy.md' ) ), 'docs/deploy.md' )
  const headings = read( 'docs/deploy.md' ).split( '\n' ).filter( ( line ) => line.startsWith( '## ' ) ).join( '\n' )
  for( const [ topic, pattern ] of Object.entries( {
    'Google Cloud resources': /google cloud/i,
    'bootstrap': /bootstrap/i,
    'Tailscale': /tailscale/i,
    'Obsidian login': /obsidian/i,
    'first deploy': /first deploy/i,
    'deploy': /deploying/i,
    'rollback': /roll(ing)? back|rollback/i,
    'secret rotation': /rotat/i,
    'restore': /restor/i,
    'resize': /resiz/i,
    'second user': /second user/i,
    'old project': /old project|shut/i,
    'memory check': /memory/i,
  } ) ) {
    assert.match( headings, pattern, `no section about: ${ topic }` )
  }
} )

test( 'the runbook only names files that exist', () => {
  const tracked = new Set( execFileSync( 'git', [ 'ls-files', '--cached', '--others', '--exclude-standard' ], { cwd: root, encoding: 'utf8' } ).split( '\n' ) )
  // Every deploy/... path, in prose, links and command blocks (not ~/atlas-src/deploy/..., which is on the VM)
  const named = [ ...read( 'docs/deploy.md' ).matchAll( /(?<![\w./~-])(deploy\/[A-Za-z0-9_./-]*[A-Za-z0-9_])/g ) ].map( ( match ) => match[ 1 ] )
  assert.ok( named.length > 5, 'names the deploy files' )
  for( const file of named ) {
    assert.ok( tracked.has( file ) || NOT_COMMITTED.has( file ), `${ file } is named in docs/deploy.md but does not exist` )
  }
} )

test( 'every command block that uses gcloud is labelled as one you run', () => {
  const lines = read( 'docs/deploy.md' ).split( '\n' )
  let inFence = false
  let start = 0
  lines.forEach( ( line, index ) => {
    if( !line.startsWith( '```' ) ) return
    if( !inFence ) {
      inFence = true
      start = index
      return
    }
    inFence = false
    const block = lines.slice( start + 1, index ).join( '\n' )
    if( !/\bgcloud\b/.test( block ) ) return
    let before = start - 1
    while( before >= 0 && lines[ before ].trim() === '' ) before -= 1
    assert.match( lines[ before ], /^\*\*You run:\*\*/, `the gcloud block at line ${ start + 1 } is not preceded by "**You run:**"` )
  } )
} )

test( 'the runbook states that prices are Google\'s, not copied here', () => {
  const text = read( 'docs/deploy.md' )
  assert.match( text, /price/i )
  assert.doesNotMatch( text, /\$\d+\.\d+ ?(\/|per) ?month/i, 'a hard-coded monthly price would go stale' )
} )

test( 'docs/README.md links the runbook', () => {
  assert.match( read( 'docs/README.md' ), /\(deploy\.md\)/ )
} )

test( 'the dc helper names the Compose files by absolute path, and secrets are piped through tr', () => {
  const text = read( 'docs/deploy.md' )
  assert.match( text, /-f \/opt\/atlas\/docker-compose\.yml -f \/opt\/atlas\/compose\.prod\.yml "\$@"/ )
  assert.doesNotMatch( text, /-f docker-compose\.yml/ )
  const lines = text.split( '\n' ).filter( ( line ) => /\| gcloud secrets (create|versions add)/.test( line ) )
  assert.ok( lines.length >= 5, 'secret-creating commands are in the runbook' )
  for( const line of lines ) {
    assert.ok( line.includes( "tr -d '\\000-\\037\\177'" ), `no control-character filter: ${ line }` )
  }
} )
