// Guards for the rewritten docs (task 6.2): the README and the user docs no longer describe
// whisper-server or manual backups, and describe the hosting.
import { strict as assert } from 'node:assert'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )
const read = ( file ) => readFileSync( join( root, file ), 'utf8' )

const OLD_WORDS = /whisper|WHISPER_|BACKUP_DIR|BACKUP_HOST_PATH|Back up now|\.srt/i
// A line may mention the old things when it says they are gone
const SAYS_GONE = /upgrad|no longer|removed|replaced|retired|ignored|instead of|used to|0\.10|ADR 00(02|04|74|51|76)|history|earlier version|Version 0\.[1-9]\.\d adds/i

test( 'the README no longer describes whisper-server or manual backups', () => {
  const offenders = read( 'README.md' ).split( '\n' )
    .map( ( line, index ) => ( { line, number: index + 1 } ) )
    .filter( ( { line } ) => OLD_WORDS.test( line ) && !SAYS_GONE.test( line ) )
  assert.deepEqual( offenders.map( ( { number, line } ) => `${ number }: ${ line.slice( 0, 100 ) }` ), [] )
} )

test( 'the README lists the new variables and the deployment files', () => {
  const text = read( 'README.md' )
  for( const name of [ 'OPENAI_API_KEY', 'OPENAI_BASE_URL', 'TRANSCRIPTION_MODEL', 'VAULT_CREATE_ENABLED', 'LITESTREAM_METRICS_URL', 'VAULT_SYNC_STATUS_DIR', 'COMPOSE_FILE' ] ) {
    assert.match( text, new RegExp( `\`${ name }\`` ), name )
  }
  assert.match( text, /docs\/deploy\.md/ )
} )

test( 'the whisper-server launchd files are gone', () => {
  assert.equal( existsSync( join( root, 'ops/com.naresh.whisper-server.plist' ) ), false )
  assert.equal( existsSync( join( root, 'ops/README.md' ) ), false )
  assert.ok( existsSync( join( root, 'ops/docker-entrypoint.sh' ) ), 'the app image still uses the entrypoint' )
  assert.doesNotMatch( read( '.dockerignore' ), /plist/ )
} )

test( 'the user docs are rewritten for the VM', () => {
  const google = read( 'docs/google-cloud-setup.md' )
  assert.match( google, /\batlas\b.*project|project.*\batlas\b/i )
  assert.match( google, /In production/ )
  assert.doesNotMatch( google, /Mnemosyne/ )

  const phone = read( 'docs/phone-access.md' )
  assert.match( phone, /tailscale serve --bg 3100/ )
  assert.match( phone, /\bVM\b/ )
  assert.doesNotMatch( phone, /Mnemosyne|keep the Mac awake|Prevent automatic sleeping/i )

  const backups = read( 'docs/backups.md' )
  assert.match( backups, /deploy\.md#/ )
  assert.ok( backups.split( '\n' ).length < 25, 'backups.md is only a pointer now' )
  assert.doesNotMatch( backups, /Mnemosyne|BACKUP_HOST_PATH/ )
} )

test( 'the root CLAUDE.md describes the hosting and the deploy folder', () => {
  const text = read( 'CLAUDE.md' )
  assert.match( text, /^\| `deploy\/` \|/m )
  assert.doesNotMatch( text, /\| `ops\/` \| launchd plist/ )
  assert.match( text, /compose\.prod\.yml/ )
  assert.match( text, /docs\/deploy\.md/ )
} )
