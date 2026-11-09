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
  for( const name of [ 'VAULT_CREATE_ENABLED', 'LITESTREAM_METRICS_URL', 'VAULT_SYNC_STATUS_DIR', 'COMPOSE_FILE' ] ) {
    assert.match( text, new RegExp( `\`${ name }\`` ), name )
  }
  assert.match( text, /docs\/deploy\.md/ )
} )

test( 'the whisper-server launchd files are gone', () => {
  assert.equal( existsSync( join( root, 'ops/com.naresh.whisper-server.plist' ) ), false )
  assert.equal( existsSync( join( root, 'ops/README.md' ) ), false )
  assert.equal( existsSync( join( root, 'ops/docker-entrypoint.sh' ) ), false, 'the entrypoint only updated yt-dlp (ADR 0081)' )
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

  // docs/backups.md was folded into the runbook's "Restoring the database" (1.0 cleanup)
  assert.ok( !existsSync( join( root, 'docs/backups.md' ) ), 'docs/backups.md is gone; the runbook covers it' )
  const deploy = read( 'docs/deploy.md' )
  const restore = deploy.slice( deploy.indexOf( '\n## Restoring the database' ), deploy.indexOf( '\n### Scratch check' ) )
  for( const [ topic, pattern ] of Object.entries( {
    'what is in the replica': /TOKEN_ENCRYPTION_KEY/,
    'the pre-migration copies': /pre-migration\//,
    'the Mac has no replica': /atlas_data/,
    'the Replication row': /Replication/,
  } ) ) assert.match( restore, pattern, `Restoring the database no longer says: ${ topic }` )
  for( const file of [ 'README.md', 'docs/README.md', 'docs/deploy.md', 'docs/phone-access.md', 'docs/google-cloud-setup.md' ] ) {
    assert.doesNotMatch( read( file ), /\(((\.\.\/)?docs\/)?backups\.md\)/, `${ file } links the deleted backups.md` )
  }
} )

test( 'the root CLAUDE.md describes the hosting and the deploy folder', () => {
  const text = read( 'CLAUDE.md' )
  assert.match( text, /^\| `deploy\/` \|/m )
  assert.doesNotMatch( text, /\| `ops\/` \| launchd plist/ )
  assert.match( text, /compose\.prod\.yml/ )
  assert.match( text, /docs\/deploy\.md/ )
} )

// --- Gemini replaces the download pipeline (task 9.6, ADR 0081) ---

const DOWNLOAD_WORDS = /yt-dlp|ffmpeg|ffprobe|openai|pot[-_ ]provider|PO token|bgutil|gpt-transcribe|TRANSCRIPTION_MODEL|OPENAI_/i
// A line may name them when it says they are gone or what replaced them
const SAYS_REMOVED = /no longer|removed|replaced|retired|ignored|instead of|used to|upgrad|0\.10|0\.9|ADR 00(02|03|04|74|78|79|80|81)|history|\bgone\b|delete|revoke|old |earlier|was |were /i

const stale = ( file ) => read( file ).split( '\n' )
  .map( ( line, index ) => ( { line, number: index + 1 } ) )
  .filter( ( { line } ) => DOWNLOAD_WORDS.test( line ) && !SAYS_REMOVED.test( line ) )
  .map( ( { number, line } ) => `${ file }:${ number }: ${ line.slice( 0, 110 ) }` )

test( 'the README and the CLAUDE.md files no longer describe downloading, ffmpeg or OpenAI', () => {
  assert.deepEqual(
    [ 'README.md', 'CLAUDE.md', 'docs/architecture.md', 'apps/server/CLAUDE.md', 'apps/web/CLAUDE.md' ].flatMap( stale ),
    [],
  )
} )

test( 'the runbook and the Google Cloud guide no longer describe them either', () => {
  assert.deepEqual( [ 'docs/deploy.md', 'docs/google-cloud-setup.md', 'docs/phone-access.md' ].flatMap( stale ), [] )
} )

test( 'the README documents the Gemini settings and YouTube-only video', () => {
  const text = read( 'README.md' )
  for( const name of [ 'GEMINI_MODEL', 'GEMINI_API_KEY', 'YOUTUBE_API_KEY' ] ) {
    assert.match( text, new RegExp( `\`${ name }\`` ), name )
  }
  assert.match( text, /Gemini/ )
  assert.match( text, /Only YouTube/i )
  assert.match( text, /AI Studio/ )
} )

// Gemini goes through the Developer API with a key (ADR 0083): Vertex AI, Application Default
// Credentials and the settings that went with them survive only in lines that say they are gone
const VERTEX_WORDS = /vertex|aiplatform|application-default|application default|GOOGLE_CLOUD_PROJECT|GEMINI_LOCATION|GOOGLE_ADC_HOST_PATH|GEMINI_ACCESS_TOKEN|GOOGLE_APPLICATION_CREDENTIALS/i
const SAYS_NOT_VERTEX = /no longer|removed|remove |disable|ignored|instead of|not Vertex|ADR 0083|upgrad|\bwere\b|refuses|refused/i

test( 'no doc describes Vertex AI or Application Default Credentials as how Gemini works', () => {
  const offenders = [
    'README.md', 'CLAUDE.md', 'docs/architecture.md', 'apps/server/CLAUDE.md', 'apps/web/CLAUDE.md',
    'docs/deploy.md', 'docs/google-cloud-setup.md', '.env.example', 'apps/server/.env.example',
  ].flatMap( ( file ) => read( file ).split( '\n' )
    .map( ( line, index ) => ( { line, number: index + 1 } ) )
    .filter( ( { line } ) => VERTEX_WORDS.test( line ) && !SAYS_NOT_VERTEX.test( line ) )
    .map( ( { number, line } ) => `${ file }:${ number }: ${ line.slice( 0, 110 ) }` ) )
  assert.deepEqual( offenders, [] )
} )

test( 'the runbook sets up the Gemini key, the YouTube Data API and six secrets', () => {
  const text = read( 'docs/deploy.md' )
  for( const needle of [ 'generativelanguage.googleapis.com', 'youtube.googleapis.com', 'gemini-api-key', 'youtube-api-key', 'GEMINI_MODEL', 'AI Studio' ] ) {
    assert.ok( text.includes( needle ), `deploy.md lacks ${ needle }` )
  }
  assert.doesNotMatch( text, /for name in [^\n]*openai-api-key/, 'the secrets loops no longer create openai-api-key' )
  assert.match( text, /for name in [^\n]*gemini-api-key/, 'the secrets loops create gemini-api-key' )
  assert.doesNotMatch( text, /^#+ .*(PO token|pot-provider)/im )
  assert.doesNotMatch( text, /services enable[^`]*aiplatform/ )
  assert.doesNotMatch( text, /add-iam-policy-binding "\$PROJECT_ID"[^`]*aiplatform\.user/ )
} )

test( 'the Google Cloud guide covers the AI Studio key and the YouTube Data API key', () => {
  const text = read( 'docs/google-cloud-setup.md' )
  assert.match( text, /YouTube Data API/ )
  assert.match( text, /AI Studio/ )
  assert.match( text, /paid/i )
  assert.match( text, /Generative Language API/ )
} )

test( 'docs/architecture.md describes Gemini and the root CLAUDE.md has no ops folder row', () => {
  const text = read( 'docs/architecture.md' )
  assert.match( text, /Gemini/ )
  assert.match( text, /Only YouTube|YouTube-only|YouTube only/i )
  assert.doesNotMatch( read( 'CLAUDE.md' ), /^\| `ops\/` \|/m )
} )
