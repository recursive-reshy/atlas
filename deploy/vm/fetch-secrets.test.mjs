// fetch-secrets.sh (ADR 0078, TRD 7): reads the five secrets with gcloud, or with curl against the
// metadata server and the Secret Manager REST API, and writes them to one env file for Compose.
// Every test runs the real script against a fake gcloud / curl; nothing touches Google.
import { spawnSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname( fileURLToPath( import.meta.url ) )
const script = join( here, 'fetch-secrets.sh' )
const root = join( here, '..', '..' )

// Secret name -> variable name -> value. The values are sentinels the output must never show.
const SECRETS = {
  'anthropic-api-key': [ 'ANTHROPIC_API_KEY', 'sk-ant-SENTINEL-1' ],
  'youtube-api-key': [ 'YOUTUBE_API_KEY', 'AIza-youtube-SENTINEL-2' ],
  'agent-secret': [ 'AGENT_SECRET', 'a=b$c"d #e f SENTINEL-3' ],
  'google-client-secret': [ 'GOOGLE_CLIENT_SECRET', 'GOCSPX-SENTINEL-4' ],
  'token-encryption-key': [ 'TOKEN_ENCRYPTION_KEY', 'abc+/SENTINEL5==' ],
}

const write = ( path, text ) => {
  writeFileSync( path, text )
  chmodSync( path, 0o755 )
}

const sandbox = ( { withGcloud }, overrides = {} ) => {
  const dir = mkdtempSync( join( tmpdir(), 'atlas-secrets-' ) )
  const bin = join( dir, 'bin' )
  mkdirSync( bin )
  const values = Object.fromEntries( Object.entries( SECRETS ).map( ( [ name, [ , value ] ] ) => [ name, overrides[ name ] ?? value ] ) )
  writeFileSync( join( dir, 'values.json' ), JSON.stringify( values ) )

  if( withGcloud ) {
    write( join( bin, 'gcloud' ), `#!/bin/sh
echo "gcloud $*" >> "${ dir }/calls"
[ "$1 $2 $3 $4" = "secrets versions access latest" ] || exit 64
name=\${5#--secret=}
[ "$name" = "$FAKE_FAIL" ] && { echo "NOT_FOUND: Secret [$name] not found" >&2; exit 1; }
node -e 'const v = JSON.parse( require( "fs" ).readFileSync( process.argv[ 1 ], "utf8" ) ); process.stdout.write( v[ process.argv[ 2 ] ] )' "${ dir }/values.json" "$name"
` )
  }

  write( join( bin, 'curl' ), `#!/bin/sh
echo "curl $*" >> "${ dir }/calls"
for arg in "$@"; do url="$arg"; done
case "$url" in
  */instance/service-accounts/default/token)
    case "$*" in *"Metadata-Flavor: Google"*) ;; *) echo "missing Metadata-Flavor header" >&2; exit 22 ;; esac
    printf '{"access_token":"TOKEN-SENTINEL","expires_in":3599,"token_type":"Bearer"}' ;;
  */project/project-id)
    case "$*" in *"Metadata-Flavor: Google"*) ;; *) exit 22 ;; esac
    printf 'atlas-test' ;;
  https://secretmanager.googleapis.com/v1/projects/atlas-test/secrets/*/versions/latest:access)
    case "$*" in *"Authorization: Bearer TOKEN-SENTINEL"*) ;; *) echo "missing bearer token" >&2; exit 22 ;; esac
    name=\${url#*/secrets/}; name=\${name%%/*}
    [ "$name" = "$FAKE_FAIL" ] && { echo "curl: (22) The requested URL returned error: 404" >&2; exit 22; }
    data=$(node -e 'const v = JSON.parse( require( "fs" ).readFileSync( process.argv[ 1 ], "utf8" ) ); process.stdout.write( Buffer.from( v[ process.argv[ 2 ] ] ).toString( "base64" ) )' "${ dir }/values.json" "$name")
    printf '{\\n  "name": "projects/1/secrets/%s/versions/3",\\n  "payload": {\\n    "data": "%s"\\n  }\\n}\\n' "$name" "$data" ;;
  *) echo "unexpected url $url" >&2; exit 22 ;;
esac
` )

  const out = join( dir, 'run', 'atlas', 'secrets.env' )
  return {
    dir,
    out,
    calls: () => ( existsSync( join( dir, 'calls' ) ) ? readFileSync( join( dir, 'calls' ), 'utf8' ) : '' ),
    run: ( env = {} ) => spawnSync( 'bash', [ script ], {
      encoding: 'utf8',
      env: {
        // Only the fake bin and the system folders: a gcloud installed on this machine must not be found
        PATH: `${ bin }:${ dirname( process.execPath ) }:/usr/bin:/bin`,
        SECRETS_ENV_FILE: out,
        ...env,
      },
    } ),
  }
}

const expectedLines = ( overrides = {} ) =>
  Object.entries( SECRETS ).map( ( [ , [ variable, value ] ] ) => `${ variable }='${ overrides[ variable ] ?? value }'` )

const assertNothingLeaked = ( result ) => {
  const output = result.stdout + result.stderr
  for( const [ , [ , value ] ] of Object.entries( SECRETS ) ) {
    assert.ok( !output.includes( value ), `output shows a secret value: ${ value.slice( 0, 12 ) }…` )
  }
  assert.ok( !output.includes( 'TOKEN-SENTINEL' ), 'output shows the access token' )
}

test( 'with gcloud: reads each secret\'s latest version into one root-only env file', () => {
  const box = sandbox( { withGcloud: true } )
  const result = box.run()
  assert.equal( result.status, 0, result.stderr )
  assert.deepEqual( readFileSync( box.out, 'utf8' ).trimEnd().split( '\n' ), expectedLines() )
  assert.equal( statSync( box.out ).mode & 0o777, 0o600 )
  assert.equal( statSync( dirname( box.out ) ).mode & 0o777, 0o700 )
  for( const name of Object.keys( SECRETS ) ) {
    assert.match( box.calls(), new RegExp( `gcloud secrets versions access latest --secret=${ name }\\b` ) )
  }
  assert.doesNotMatch( box.calls(), /curl/, 'does not use curl when gcloud is there' )
  assertNothingLeaked( result )
} )

test( 'without gcloud: metadata token, then the Secret Manager REST API', () => {
  const box = sandbox( { withGcloud: false } )
  const result = box.run()
  assert.equal( result.status, 0, result.stderr )
  assert.deepEqual( readFileSync( box.out, 'utf8' ).trimEnd().split( '\n' ), expectedLines() )
  assert.equal( statSync( box.out ).mode & 0o777, 0o600 )
  assert.match( box.calls(), /service-accounts\/default\/token/ )
  assert.match( box.calls(), /secrets\/youtube-api-key\/versions\/latest:access/ )
  assertNothingLeaked( result )
} )

for( const withGcloud of [ true, false ] ) {
  test( `a missing secret fails the whole run and leaves no file (${ withGcloud ? 'gcloud' : 'REST' })`, () => {
    const box = sandbox( { withGcloud } )
    const result = box.run( { FAKE_FAIL: 'agent-secret' } )
    assert.notEqual( result.status, 0 )
    assert.match( result.stderr, /agent-secret/ )
    assert.equal( existsSync( box.out ), false )
    assertNothingLeaked( result )
  } )
}

test( 'a failed run leaves an earlier file as it was', () => {
  const box = sandbox( { withGcloud: true } )
  assert.equal( box.run().status, 0 )
  const before = readFileSync( box.out, 'utf8' )
  const result = box.run( { FAKE_FAIL: 'google-client-secret' } )
  assert.notEqual( result.status, 0 )
  assert.equal( readFileSync( box.out, 'utf8' ), before )
  assert.deepEqual( readdirSync( dirname( box.out ) ).sort(), [ 'secrets.env' ], 'no temporary file is left' )
} )

test( 'a value with a quote or a line break is refused, not written wrongly', () => {
  for( const bad of [ "it's", 'two\nlines', '' ] ) {
    const box = sandbox( { withGcloud: true }, { 'youtube-api-key': bad } )
    const result = box.run()
    assert.notEqual( result.status, 0, `accepted ${ JSON.stringify( bad ) }` )
    assert.match( result.stderr, /youtube-api-key/ )
    assert.equal( existsSync( box.out ), false )
  }
} )

const hasDocker = spawnSync( 'docker', [ 'compose', 'version' ], { stdio: 'ignore' } ).status === 0

test( 'Compose reads the written file back to the exact values', { skip: hasDocker ? false : 'docker is not installed' }, () => {
  const box = sandbox( { withGcloud: true } )
  assert.equal( box.run().status, 0 )
  const composeFile = join( box.dir, 'compose.yml' )
  const variables = Object.values( SECRETS ).map( ( [ variable ] ) => variable )
  writeFileSync( composeFile, `services:\n  probe:\n    image: probe\n    environment:\n${ variables.map( ( v ) => `      ${ v }: \${${ v }}` ).join( '\n' ) }\n` )
  const result = spawnSync( 'docker', [ 'compose', '-f', composeFile, '--env-file', box.out, 'config', '--format', 'json' ], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } } )
  assert.equal( result.status, 0, result.stderr )
  const environment = JSON.parse( result.stdout ).services.probe.environment
  for( const [ , [ variable, value ] ] of Object.entries( SECRETS ) ) {
    // `config` prints a literal $ as $$; an interpolated $c would have vanished instead
    assert.equal( environment[ variable ].replaceAll( '$$', '$' ), value, variable )
  }
} )

// --- the unit and the example environment file ---

const read = ( ...parts ) => readFileSync( join( root, ...parts ), 'utf8' )

test( 'atlas.service fetches the secrets, then starts the stack from /opt/atlas', () => {
  const unit = read( 'deploy', 'vm', 'atlas.service' )
  assert.match( unit, /^Type=oneshot$/m )
  assert.match( unit, /^RemainAfterExit=yes$/m )
  assert.match( unit, /^After=.*docker\.service.*network-online\.target/m )
  assert.match( unit, /^ExecStartPre=\/opt\/atlas\/fetch-secrets\.sh$/m )
  const up = unit.match( /^ExecStart=(.*)$/m )[ 1 ]
  assert.match( up, /--env-file \/etc\/atlas\/atlas\.env/ )
  assert.match( up, /--env-file \/run\/atlas\/secrets\.env/ )
  assert.match( up, /-f docker-compose\.yml -f compose\.prod\.yml/ )
  assert.match( up, /up -d --wait/ )
  assert.match( unit, /^ExecStop=.*compose.* down$/m )
  assert.match( unit, /^WorkingDirectory=\/opt\/atlas$/m )
  assert.match( unit, /^WantedBy=multi-user\.target$/m )
} )

test( 'atlas.env.example holds the non-secret settings and none of the secrets', () => {
  const text = read( 'deploy', 'vm', 'atlas.env.example' )
  const keys = text.split( '\n' ).filter( ( line ) => /^[A-Z_]+=/.test( line ) ).map( ( line ) => line.split( '=' )[ 0 ] )
  for( const key of [
    'ATLAS_VERSION', 'REGISTRY', 'ADMIN_EMAIL', 'APP_ORIGINS', 'GOOGLE_CLIENT_ID',
    'VAULTS_HOST_PATH', 'LITESTREAM_BUCKET', 'APP_TIME_ZONE', 'VAULT_CREATE_ENABLED',
  ] ) {
    assert.ok( keys.includes( key ), `missing ${ key }` )
  }
  for( const [ , [ variable ] ] of Object.entries( SECRETS ) ) {
    assert.ok( !keys.includes( variable ), `${ variable } is a secret` )
  }
  assert.match( text, /^VAULT_CREATE_ENABLED=false$/m )
} )

test( 'trailing whitespace is trimmed from a value, interior text stays', () => {
  const box = sandbox( { withGcloud: true }, { 'youtube-api-key': 'AIza-youtube-SENTINEL-2 \t\r\n', 'agent-secret': 'a b\n\n' } )
  const result = box.run()
  assert.equal( result.status, 0, result.stderr )
  const lines = readFileSync( box.out, 'utf8' ).trimEnd().split( '\n' )
  assert.ok( lines.includes( "YOUTUBE_API_KEY='AIza-youtube-SENTINEL-2'" ), lines.join( '|' ) )
  assert.ok( lines.includes( "AGENT_SECRET='a b'" ) )
} )

test( 'anything else cleaning would remove is refused, naming the secret and never showing the value', () => {
  const cases = [
    [ '\u001bAIza-youtube-SENTINEL-2', 'leading escape (a key pasted through read)' ],
    [ 'sk-\u001b[31mx-SENTINEL-2', 'escape in the middle' ],
    [ 'sk-ab\u0007cd-SENTINEL-2', 'bell' ],
    [ 'a\u007fb-SENTINEL-2', 'DEL' ],
    [ 'sk-SENTINEL-2\u001b', 'trailing escape' ],
    [ '  sk-SENTINEL-2', 'leading space' ],
  ]
  for( const [ bad, what ] of cases ) {
    const box = sandbox( { withGcloud: true }, { 'youtube-api-key': bad } )
    const result = box.run()
    assert.notEqual( result.status, 0, `accepted ${ what }` )
    assert.match( result.stderr, /youtube-api-key/, what )
    assert.doesNotMatch( result.stderr, /SENTINEL-2/, what )
    assert.equal( existsSync( box.out ), false )
  }
} )

test( 'production renders with the real example file and a fetched secrets file', { skip: hasDocker ? false : 'docker is not installed' }, () => {
  const box = sandbox( { withGcloud: true } )
  assert.equal( box.run().status, 0 )
  const result = spawnSync( 'docker', [
    'compose', '--project-directory', root,
    '-f', join( root, 'docker-compose.yml' ), '-f', join( root, 'compose.prod.yml' ),
    '--env-file', join( root, 'deploy', 'vm', 'atlas.env.example' ), '--env-file', box.out,
    'config', '--quiet',
  ], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ATLAS_VERSION: '0.10.0' } } )
  assert.equal( result.status, 0, result.stderr )
} )
