// fetch-identity-token.sh (ADR 0110, TRD 4.3): asks the metadata server for the VM's Google
// identity token and puts it where the containers read it. The real script runs against a fake
// curl; nothing touches Google.
import { spawnSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname( fileURLToPath( import.meta.url ) )
const script = join( here, 'fetch-identity-token.sh' )

// Three base64url segments, as a Google identity token has; a sentinel the output must never show
const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJTRU5USU5FTC0xIn0.c2lnLVNFTlRJTkVMLTI_-x'

const write = ( path, text ) => {
  writeFileSync( path, text )
  chmodSync( path, 0o755 )
}

// FAKE_ANSWER is what the metadata server says; FAKE_FAIL makes curl fail like an HTTP error
const sandbox = ( answer = TOKEN ) => {
  const dir = mkdtempSync( join( tmpdir(), 'atlas-identity-' ) )
  const bin = join( dir, 'bin' )
  mkdirSync( bin )
  write( join( bin, 'curl' ), `#!/bin/sh
echo "curl $*" >> "${ dir }/calls"
case "$*" in *"Metadata-Flavor: Google"*) ;; *) echo "missing Metadata-Flavor header" >&2; exit 22 ;; esac
[ -n "$FAKE_FAIL" ] && { echo "curl: (22) The requested URL returned error: 404" >&2; exit 22; }
printf '%s' "$FAKE_ANSWER"
` )

  const out = join( dir, 'run', 'identity' )

  return {
    dir,
    out,
    token: join( out, 'token' ),
    calls: () => ( existsSync( join( dir, 'calls' ) ) ? readFileSync( join( dir, 'calls' ), 'utf8' ) : '' ),
    run: ( env = {} ) => spawnSync( 'bash', [ script ], {
      encoding: 'utf8',
      env: {
        PATH: `${ bin }:/usr/bin:/bin`,
        IDENTITY_TOKEN_DIR: out,
        FAKE_ANSWER: answer,
        ...env,
      },
    } ),
  }
}

const assertNothingLeaked = ( result ) => {
  assert.ok( !( result.stdout + result.stderr ).includes( 'SENTINEL' ), 'output shows the token' )
  assert.ok( !( result.stdout + result.stderr ).includes( TOKEN.slice( 0, 12 ) ), 'output shows the token' )
}

test( 'writes the token the metadata server gives, world-readable in a folder everyone can enter', () => {
  const box = sandbox()
  const result = box.run()

  assert.equal( result.status, 0, result.stderr )
  assert.equal( readFileSync( box.token, 'utf8' ), TOKEN )
  assert.equal( statSync( box.token ).mode & 0o777, 0o644 )
  assert.equal( statSync( box.out ).mode & 0o777, 0o755 )
  assert.deepEqual( readdirSync( box.out ), [ 'token' ], 'no temporary file is left' )
  assertNothingLeaked( result )
} )

test( 'asks for the full token for the Anthropic audience, with the metadata header', () => {
  const box = sandbox()

  box.run()

  assert.match( box.calls(), /Metadata-Flavor: Google/ )
  assert.match(
    box.calls(),
    /metadata\.google\.internal\/computeMetadata\/v1\/instance\/service-accounts\/default\/identity\?audience=https:\/\/api\.anthropic\.com&format=full/,
  )
} )

test( 'the metadata address, folder and audience can be overridden for a test', () => {
  const box = sandbox()

  box.run( { METADATA_URL: 'http://127.0.0.1:9/v1', IDENTITY_AUDIENCE: 'https://example.test' } )

  assert.match( box.calls(), /127\.0\.0\.1:9\/v1\/instance\/service-accounts\/default\/identity\?audience=https:\/\/example\.test&format=full/ )
} )

test( 'trims a trailing newline from the answer', () => {
  const box = sandbox( `${ TOKEN }\n` )

  assert.equal( box.run().status, 0 )
  assert.equal( readFileSync( box.token, 'utf8' ), TOKEN )
} )

for( const [ name, answer ] of [
  [ 'an HTML error page', '<html><body>SENTINEL not found</body></html>' ],
  [ 'two segments', 'aaa.bbb' ],
  [ 'four segments', 'aaa.bbb.ccc.ddd' ],
  [ 'an empty segment', 'aaa..ccc' ],
  [ 'a space inside', 'aaa.bbb ccc.ddd' ],
  [ 'nothing at all', '' ],
] ) {
  test( `refuses ${ name } and writes nothing`, () => {
    const box = sandbox( answer )
    const result = box.run()

    assert.notEqual( result.status, 0 )
    assert.equal( existsSync( box.token ), false )
    assertNothingLeaked( result )
  } )
}

test( 'a failed run leaves the earlier token as it was, and no temporary file', () => {
  const box = sandbox()

  assert.equal( box.run().status, 0 )

  const failed = box.run( { FAKE_FAIL: '1' } )
  const refused = box.run( { FAKE_ANSWER: 'not a token' } )

  assert.notEqual( failed.status, 0 )
  assert.notEqual( refused.status, 0 )
  assert.equal( readFileSync( box.token, 'utf8' ), TOKEN )
  assert.deepEqual( readdirSync( box.out ), [ 'token' ] )
} )

test( 'replaces an earlier token in one step', () => {
  const box = sandbox()
  const newer = 'eyJuZXc.eyJuZXc.bmV3'

  assert.equal( box.run().status, 0 )
  assert.equal( box.run( { FAKE_ANSWER: newer } ).status, 0 )
  assert.equal( readFileSync( box.token, 'utf8' ), newer )
} )

const unit = ( name ) => readFileSync( join( here, name ), 'utf8' )

test( 'atlas.service runs the helper after fetch-secrets, so the stack never starts without a token', () => {
  const lines = unit( 'atlas.service' ).split( '\n' ).filter( ( line ) => line.startsWith( 'ExecStartPre=' ) )

  assert.deepEqual( lines, [
    'ExecStartPre=/opt/atlas/fetch-secrets.sh',
    'ExecStartPre=/opt/atlas/fetch-identity-token.sh',
  ] )
} )

test( 'the helper runs as a oneshot unit, started by a timer at boot and every 20 minutes', () => {
  const service = unit( 'atlas-identity-token.service' )
  const timer = unit( 'atlas-identity-token.timer' )

  assert.match( service, /^Type=oneshot$/m )
  assert.match( service, /^ExecStart=\/opt\/atlas\/fetch-identity-token\.sh$/m )
  assert.match( timer, /^OnBootSec=0$/m )
  assert.match( timer, /^OnUnitActiveSec=20min$/m )
  assert.match( timer, /^WantedBy=timers\.target$/m )
  assert.doesNotMatch( timer, /^Unit=/m, 'it starts the service of the same name' )
} )
