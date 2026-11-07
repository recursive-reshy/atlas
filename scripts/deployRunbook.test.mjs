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
    'upgrading': /^## Upgrading/im,
    'rolling back': /^## Rolling back/im,
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

test( 'the runbook names the flags a deploy and a rollback need (ADR 0086)', () => {
  const text = read( 'docs/deploy.md' )
  const section = ( heading ) => {
    const found = new RegExp( `\\n## (\\d+\\. )?${ heading }\\b` ).exec( text )
    assert.ok( found, `no section ${ heading }` )
    const end = text.indexOf( '\n## ', found.index + 1 )
    return text.slice( found.index, end === -1 ? undefined : end )
  }
  assert.match( section( 'Rolling back' ), /--restore-pre-migration/ )
  assert.match( section( 'Rolling back' ), /rolled-back/, 'says where the lost writes are kept' )
  assert.match( section( 'Upgrading' ), /--force/, 'says when --force is needed' )
  assert.match( section( 'First deploy' ), /--force/, 'the first deploy has no app to ask' )
  assert.match( section( 'Upgrading' ), /deploys\.log|schema/, 'says what the report shows' )
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

test( 'the restore section has the scratch check and the new-VM procedure, each with a record (TRD 5)', () => {
  const text = read( 'docs/deploy.md' )
  const start = text.indexOf( '\n## Restoring the database' )
  assert.ok( start !== -1, 'no section Restoring the database' )
  const end = text.indexOf( '\n## ', start + 1 )
  const restore = text.slice( start, end === -1 ? undefined : end )
  const sub = ( heading ) => {
    const found = new RegExp( `\\n### ${ heading }[^\\n]*` ).exec( restore )
    assert.ok( found, `no subsection "${ heading }" under Restoring the database` )
    const next = restore.indexOf( '\n### ', found.index + 1 )
    return restore.slice( found.index, next === -1 ? undefined : next )
  }
  const scratch = sub( 'Scratch check' )
  const newVm = sub( 'A new VM' )
  sub( 'An earlier point in time' )
  for( const [ name, body ] of [ [ 'Scratch check', scratch ], [ 'A new VM', newVm ] ] ) {
    assert.match( body, /\| Date \| Time taken \| Restore point against last write \| Result \|/, `${ name } has no record table` )
  }
  assert.match( scratch, /litestream\/litestream:.* restore -o / )
  assert.match( scratch, /user_version/, 'the scratch check prints the schema' )
  assert.match( newVm, /bootstrap/ )
  assert.match( newVm, /restore. service|`restore`/ )
  assert.match( newVm, /Repoint Tailscale/ )
  assert.match( restore, /seconds to a minute/ )
  assert.doesNotMatch( text, /has not been tried yet/ )
  assert.doesNotMatch( text, /restore into a scratch path\./, 'Release checks should point at the scratch check, not the task list' )
} )

test( 'the restore commands use the same pinned Litestream image as Compose', () => {
  const pinned = /litestream\/litestream:[\d.]+@sha256:[0-9a-f]{64}/
  const fromCompose = pinned.exec( read( 'compose.prod.yml' ) )?.[ 0 ]
  assert.ok( fromCompose, 'compose.prod.yml pins Litestream' )
  const text = read( 'docs/deploy.md' )
  const named = [ ...text.matchAll( /litestream\/litestream:[\d.]+(@sha256:[0-9a-f]+)?/g ) ].map( ( match ) => match[ 0 ] )
  assert.ok( named.length >= 2, 'the runbook names the image' )
  for( const image of named ) assert.equal( image, fromCompose, 'the runbook names a different Litestream image than compose.prod.yml' )
} )

test( 'A new VM warns that it is for when the old VM is gone (ADR 0088)', () => {
  const text = read( 'docs/deploy.md' )
  const start = text.indexOf( '### A new VM' )
  assert.ok( start !== -1 )
  const intro = text.slice( start, text.indexOf( '\n1. ', start ) )
  assert.match( intro, /\*\*Warning/ )
  assert.match( intro, /second Litestream writer/ )
  assert.match( intro, /gs:\/\/<bucket>\/atlas\.db/ )
  assert.match( intro, /Obsidian Sync/ )
  assert.match( intro, /separate replica path/ )
  assert.match( intro, /fork/ )
  assert.match( intro, /redirect URIs/ )
  assert.match( intro, /APP_ORIGINS/ )
  assert.match( intro, /ADR 0088/ )
} )

test( 'Upgrading explains the first upgrade from 0.10.0 (health without schema or replication)', () => {
  const text = read( 'docs/deploy.md' )
  const start = text.indexOf( '\n## Upgrading\n' )
  const section = text.slice( start, text.indexOf( '\n## ', start + 1 ) )
  assert.match( section, /first upgrade from 0\.10\.0/i )
  assert.match( section, /deploy\/vm\/deploy\.sh/, 'the installed 0.10.0 script does not know --force' )
  assert.match( section, /deploys\.log/ )
  assert.match( section, /schema unknown/ )
  assert.match( section, /unchanged/ )
} )

test( 'the runbook has no section left from the 0.10 move to Gemini', () => {
  const headings = read( 'docs/deploy.md' ).split( '\n' ).filter( ( line ) => line.startsWith( '## ' ) ).join( '\n' )
  assert.doesNotMatch( headings, /OpenAI|yt-dlp/i )
} )
