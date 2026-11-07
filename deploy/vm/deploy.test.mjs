// deploy.sh (ADR 0077, TRD 8.6): on the VM, switches the stack to a version: sets ATLAS_VERSION,
// pulls, restarts the unit and waits for the app's health check. Run here against a temp folder
// and fake docker / systemctl / curl / sleep.
import { spawnSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname( fileURLToPath( import.meta.url ) )
const script = join( here, 'deploy.sh' )

const write = ( path, text ) => {
  writeFileSync( path, text )
  chmodSync( path, 0o755 )
}

// Fakes are written once; they find their folder in FAKE_DIR
const bin = mkdtempSync( join( tmpdir(), 'atlas-deploy-bin-' ) )
for( const name of [ 'systemctl', 'sleep' ] ) {
  write( join( bin, name ), `#!/bin/sh\necho "${ name } $*" >> "$FAKE_DIR/calls"\n` )
}
// docker: `... find ...` prints FIND_RESULT (default a v13 → v14 copy; "none" prints nothing, exit 1)
write( join( bin, 'docker' ), `#!/bin/sh
echo "docker $*" >> "$FAKE_DIR/calls"
case "$*" in
  *" find "*)
    [ "\${FIND_RESULT:-}" = "none" ] && exit 1
    echo "\${FIND_RESULT:-/data/pre-migration/pre-migration-v13-to-v14-20261107-181500.db}"
    ;;
esac
` )
write( join( bin, 'id' ), '#!/bin/sh\necho "$FAKE_UID"\n' )
// Health: with -w (the wait) answers 503 until the HEALTH_OK_AFTER-th call (0 = never); without
// it (the preflight and the report) prints the body in HEALTH_BODY, or fails when it is "none"
write( join( bin, 'curl' ), `#!/bin/sh
echo "curl $*" >> "$FAKE_DIR/calls"
case "$*" in
  *" -w "*)
    n=$(( $(cat "$FAKE_DIR/health" 2>/dev/null || echo 0) + 1 ))
    echo "$n" > "$FAKE_DIR/health"
    if [ "\${HEALTH_OK_AFTER:-3}" -gt 0 ] && [ "$n" -ge "\${HEALTH_OK_AFTER:-3}" ]; then printf 200; else printf 503; fi
    ;;
  *)
    m=$(( $(cat "$FAKE_DIR/bodies" 2>/dev/null || echo 0) + 1 ))
    echo "$m" > "$FAKE_DIR/bodies"
    [ "\${HEALTH_BODY:-}" = "none" ] && exit 7
    if [ "$m" -gt 1 ] && [ -n "\${HEALTH_BODY_AFTER:-}" ]; then printf '%s' "$HEALTH_BODY_AFTER"; exit 0; fi
    printf '%s' "\${HEALTH_BODY:-$DEFAULT_BODY}"
    ;;
esac
` )

const body = ( { schema = 13, configured = true, failing = false, checked = new Date() } = {} ) => JSON.stringify( {
  ok: true,
  version: '0.10.0',
  schema,
  replication: configured
    ? { configured, failing, last_success_at: checked.toISOString(), last_checked_at: checked.toISOString() }
    : { configured, failing: null, last_success_at: null, last_checked_at: null },
} )

const sandbox = ( { uid = 0, current = 'ATLAS_VERSION=0.10.0\nREGISTRY=r.example/atlas\nADMIN_EMAIL=a@b.test\n' } = {} ) => {
  const dir = mkdtempSync( join( tmpdir(), 'atlas-deploy-' ) )
  const etc = join( dir, 'etc' )
  const opt = join( dir, 'opt' )
  mkdirSync( etc )
  mkdirSync( opt )
  writeFileSync( join( etc, 'atlas.env' ), current )
  chmodSync( join( etc, 'atlas.env' ), 0o640 )
  writeFileSync( join( opt, 'docker-compose.yml' ), 'installed\n' )
  writeFileSync( join( opt, 'compose.prod.yml' ), 'installed\n' )
  write( join( opt, 'fetch-secrets.sh' ), '#!/bin/sh\necho "fetch-secrets" >> "$FAKE_DIR/calls"\n' )
  return {
    dir,
    etc,
    opt,
    env: () => readFileSync( join( etc, 'atlas.env' ), 'utf8' ),
    history: () => ( existsSync( join( dir, 'var', 'deploys.log' ) ) ? readFileSync( join( dir, 'var', 'deploys.log' ), 'utf8' ).trim().split( '\n' ) : [] ),
    seedHistory: ( text ) => {
      mkdirSync( join( dir, 'var' ), { recursive: true } )
      writeFileSync( join( dir, 'var', 'deploys.log' ), text )
    },
    calls: () => ( existsSync( join( dir, 'calls' ) ) ? readFileSync( join( dir, 'calls' ), 'utf8' ).trim().split( '\n' ) : [] ),
    run: ( args, env = {}, cwd = undefined ) => spawnSync( 'bash', [ script, ...args ], {
      encoding: 'utf8',
      cwd,
      env: {
        PATH: `${ bin }:/usr/bin:/bin`,
        FAKE_DIR: dir,
        FAKE_UID: String( uid ),
        ATLAS_ETC: etc,
        ATLAS_OPT: opt,
        ATLAS_RUN: join( dir, 'run' ),
        ATLAS_DEPLOYS_LOG: join( dir, 'var', 'deploys.log' ),
        HEALTH_TIMEOUT: '30',
        HEALTH_INTERVAL: '5',
        DEFAULT_BODY: body(),
        ...env,
      },
    } ),
  }
}

const compose = ( box ) => `docker compose --project-directory ${ box.opt } --env-file ${ join( box.etc, 'atlas.env' ) } --env-file ${ join( box.dir, 'run', 'secrets.env' ) } -f ${ join( box.opt, 'docker-compose.yml' ) } -f ${ join( box.opt, 'compose.prod.yml' ) }`

test( 'sets the version, reads the secrets, pulls, restarts the unit and waits for health', () => {
  const box = sandbox()
  const result = box.run( [ '0.10.1' ] )
  assert.equal( result.status, 0, result.stderr )
  assert.equal( box.env(), 'ATLAS_VERSION=0.10.1\nREGISTRY=r.example/atlas\nADMIN_EMAIL=a@b.test\n' )
  assert.equal( statSync( join( box.etc, 'atlas.env' ) ).mode & 0o777, 0o640, 'keeps the mode' )

  const calls = box.calls()
  const pull = calls.indexOf( `${ compose( box ) } pull` )
  const restart = calls.indexOf( 'systemctl restart atlas' )
  assert.ok( calls.indexOf( 'fetch-secrets' ) >= 0 && calls.indexOf( 'fetch-secrets' ) < pull, 'secrets are read before the pull' )
  assert.ok( pull >= 0 && restart > pull, 'pull, then restart' )
  const health = calls.filter( ( call ) => call.startsWith( 'curl ' ) && call.includes( ' -w ' ) )
  assert.equal( health.length, 3, 'asked three times: 503, 503, 200' )
  assert.match( health[ 0 ], /http:\/\/127\.0\.0\.1:3100\/api\/health/ )
  assert.equal( calls.filter( ( call ) => call === 'sleep 5' ).length, 2 )
  assert.match( result.stdout, /Atlas 0\.10\.1 is up/ )
  assert.match( result.stdout, /previous version was 0\.10\.0/ )
} )

test( 'the first deploy has no previous version and offers no rollback', () => {
  const box = sandbox( { current: 'ATLAS_VERSION=\nREGISTRY=r.example/atlas\n' } )
  const result = box.run( [ '0.10.0' ] )
  assert.equal( result.status, 0, result.stderr )
  assert.match( result.stdout, /Atlas 0\.10\.0 is up \(previous version was none\)/ )
  assert.doesNotMatch( result.stdout, /to go back/ )
} )

test( 'runs from any working directory: Compose files are named by absolute path', () => {
  const box = sandbox()
  // Like real Compose, this docker fails when a -f file does not exist relative to where it runs
  const strict = mkdtempSync( join( tmpdir(), 'atlas-deploy-strict-' ) )
  write( join( strict, 'docker' ), `#!/bin/sh
echo "docker $*" >> "$FAKE_DIR/calls"
while [ $# -gt 0 ]; do
  if [ "$1" = "-f" ]; then [ -f "$2" ] || { echo "compose file \"$PWD/$2\" is invalid: no such file" >&2; exit 1; }; shift; fi
  shift
done
` )
  const elsewhere = mkdtempSync( join( tmpdir(), 'atlas-deploy-cwd-' ) )
  const result = box.run( [ '0.10.1' ], { PATH: `${ strict }:${ bin }:/usr/bin:/bin` }, elsewhere )
  assert.equal( result.status, 0, result.stderr )
  assert.ok( box.calls().includes( `${ compose( box ) } pull` ) )
} )

test( 'a version line is added when atlas.env has none', () => {
  const box = sandbox( { current: 'REGISTRY=r.example/atlas\n' } )
  assert.equal( box.run( [ '0.10.1' ] ).status, 0 )
  assert.equal( box.env(), 'REGISTRY=r.example/atlas\nATLAS_VERSION=0.10.1\n' )
} )

test( 'rollback is the same command with the previous version', () => {
  const box = sandbox()
  assert.equal( box.run( [ '0.10.1' ] ).status, 0 )
  const back = box.run( [ '0.10.0' ] )
  assert.equal( back.status, 0, back.stderr )
  assert.match( box.env(), /^ATLAS_VERSION=0\.10\.0$/m )
  assert.match( back.stdout, /previous version was 0\.10\.1/ )
} )

test( '--files installs the Compose files, scripts and unit from a checkout, and reloads systemd for a changed unit', () => {
  const box = sandbox()
  const checkout = mkdtempSync( join( tmpdir(), 'atlas-checkout-' ) )
  const put = ( file, text ) => {
    mkdirSync( dirname( join( checkout, file ) ), { recursive: true } )
    writeFileSync( join( checkout, file ), text )
  }
  put( 'docker-compose.yml', 'new base\n' )
  put( 'compose.prod.yml', 'new prod\n' )
  put( 'deploy/litestream/litestream.yml', 'new litestream\n' )
  put( 'deploy/vm/fetch-secrets.sh', '#!/bin/sh\necho "new fetch" >> "$FAKE_DIR/calls"\n' )
  put( 'deploy/vm/deploy.sh', '#!/bin/sh\n# new deploy\n' )
  put( 'deploy/vm/atlas.service', 'new unit\n' )

  const result = box.run( [ '0.10.1', '--files', checkout ], { ATLAS_UNIT: join( box.dir, 'atlas.service' ) } )
  assert.equal( result.status, 0, result.stderr )
  assert.equal( readFileSync( join( box.opt, 'docker-compose.yml' ), 'utf8' ), 'new base\n' )
  assert.equal( readFileSync( join( box.opt, 'compose.prod.yml' ), 'utf8' ), 'new prod\n' )
  assert.equal( readFileSync( join( box.opt, 'litestream.yml' ), 'utf8' ), 'new litestream\n' )
  assert.match( readFileSync( join( box.opt, 'deploy.sh' ), 'utf8' ), /new deploy/ )
  assert.equal( statSync( join( box.opt, 'fetch-secrets.sh' ) ).mode & 0o777, 0o755 )
  assert.equal( readFileSync( join( box.dir, 'atlas.service' ), 'utf8' ), 'new unit\n' )
  assert.ok( box.calls().includes( 'systemctl daemon-reload' ) )
  assert.ok( box.calls().includes( 'new fetch' ), 'the new fetch script is the one that runs' )
} )

test( 'without --files the installed files are kept', () => {
  const box = sandbox()
  assert.equal( box.run( [ '0.10.1' ] ).status, 0 )
  assert.equal( readFileSync( join( box.opt, 'docker-compose.yml' ), 'utf8' ), 'installed\n' )
  assert.ok( !box.calls().includes( 'systemctl daemon-reload' ) )
} )

test( 'a stack that never answers fails with the last status and the rollback command', () => {
  const box = sandbox()
  const result = box.run( [ '0.10.1' ], { HEALTH_OK_AFTER: '0' } )
  assert.notEqual( result.status, 0 )
  assert.equal( box.calls().filter( ( call ) => call.startsWith( 'curl ' ) && call.includes( ' -w ' ) ).length, 6, '30 s / 5 s attempts' )
  assert.match( result.stderr, /did not become healthy/ )
  assert.match( result.stderr, /deploy\.sh 0\.10\.0/ )
  assert.ok( box.calls().some( ( call ) => call.includes( ' ps' ) ), 'shows the container status' )
  assert.ok( box.calls().some( ( call ) => call.includes( 'logs' ) ), 'shows recent logs' )
} )

test( '--dry-run prints what it would do and changes nothing', () => {
  const box = sandbox()
  const before = box.env()
  const result = box.run( [ '0.10.1', '--dry-run' ] )
  assert.equal( result.status, 0, result.stderr )
  assert.equal( box.env(), before )
  assert.deepEqual( box.calls(), [] )
  assert.match( result.stdout, /ATLAS_VERSION=0\.10\.1/ )
  assert.match( result.stdout, /systemctl restart atlas/ )
} )

test( 'refuses a malformed version, a non-root user and a missing atlas.env', () => {
  const box = sandbox()
  assert.notEqual( box.run( [ 'latest' ] ).status, 0 )
  assert.notEqual( box.run( [] ).status, 0 )
  const user = sandbox( { uid: 1000 } )
  const userResult = user.run( [ '0.10.1' ] )
  assert.notEqual( userResult.status, 0 )
  assert.match( userResult.stderr, /root/ )
  const missing = sandbox()
  const missingResult = missing.run( [ '0.10.1' ], { ATLAS_ETC: join( missing.dir, 'nowhere' ) } )
  assert.notEqual( missingResult.status, 0 )
  assert.match( missingResult.stderr, /atlas\.env/ )
  for( const b of [ box, user, missing ] ) assert.deepEqual( b.calls(), [] )
} )

const minutesAgo = ( minutes ) => new Date( Date.now() - minutes * 60_000 )

test( 'the preflight reads the health body before anything is pulled', () => {
  const box = sandbox()
  const result = box.run( [ '0.10.1' ] )
  assert.equal( result.status, 0, result.stderr )
  const calls = box.calls()
  const first = calls.findIndex( ( call ) => call.startsWith( 'curl ' ) && !call.includes( ' -w ' ) )
  assert.ok( first >= 0 && first < calls.indexOf( `${ compose( box ) } pull` ), 'checked before the pull' )
} )

test( 'refuses to upgrade while replication is failing, and nothing is changed', () => {
  const box = sandbox()
  const before = box.env()
  const result = box.run( [ '0.10.1' ], { HEALTH_BODY: body( { failing: true } ) } )
  assert.notEqual( result.status, 0 )
  assert.match( result.stderr, /replication is failing/ )
  assert.match( result.stderr, /--force/ )
  assert.equal( box.env(), before )
  assert.ok( !box.calls().some( ( call ) => call.endsWith( ' pull' ) || call.startsWith( 'systemctl' ) ) )
} )

test( 'refuses when the last replication check is older than twice the check interval', () => {
  const box = sandbox()
  const stale = box.run( [ '0.10.1' ], { HEALTH_BODY: body( { checked: minutesAgo( 5 ) } ) } )
  assert.notEqual( stale.status, 0 )
  assert.match( stale.stderr, /last replication check was/ )
  // The limit follows STATUS_CHECK_INTERVAL_MINUTES in atlas.env
  const slow = sandbox( { current: 'ATLAS_VERSION=0.10.0\nSTATUS_CHECK_INTERVAL_MINUTES=10\n' } )
  const ok = slow.run( [ '0.10.1' ], { HEALTH_BODY: body( { checked: minutesAgo( 15 ) } ) } )
  assert.equal( ok.status, 0, ok.stderr )
  const tooOld = slow.run( [ '0.10.2' ], { HEALTH_BODY: body( { checked: minutesAgo( 25 ) } ) } )
  assert.notEqual( tooOld.status, 0 )
} )

test( 'refuses when replication was never checked', () => {
  const box = sandbox()
  const never = JSON.stringify( { ok: true, version: '0.10.0', schema: 13, replication: { configured: true, failing: false, last_success_at: null, last_checked_at: null } } )
  const result = box.run( [ '0.10.1' ], { HEALTH_BODY: never } )
  assert.notEqual( result.status, 0 )
  assert.match( result.stderr, /not been checked/ )
} )

test( 'refuses when the app does not answer, and says the first deploy needs --force', () => {
  const box = sandbox()
  const result = box.run( [ '0.10.1' ], { HEALTH_BODY: 'none' } )
  assert.notEqual( result.status, 0 )
  assert.match( result.stderr, /did not answer/ )
  assert.match( result.stderr, /first deploy/ )
  assert.match( result.stderr, /--force/ )
} )

test( 'replication that is not configured passes the preflight', () => {
  const box = sandbox()
  const result = box.run( [ '0.10.1' ], { HEALTH_BODY: body( { configured: false } ) } )
  assert.equal( result.status, 0, result.stderr )
} )

test( '--force deploys anyway and prints why the preflight would have stopped', () => {
  const box = sandbox()
  for( const [ bad, reason ] of [
    [ body( { failing: true } ), /replication is failing/ ],
    [ 'none', /did not answer/ ],
  ] ) {
    const result = box.run( [ '0.10.1', '--force' ], { HEALTH_BODY: bad } )
    assert.equal( result.status, 0, result.stderr )
    assert.match( result.stdout, /--force/ )
    assert.match( result.stdout, reason )
  }
  assert.ok( box.calls().some( ( call ) => call.endsWith( ' pull' ) ) )
} )

test( '--dry-run lists the preflight and does not run it', () => {
  const box = sandbox()
  const result = box.run( [ '0.10.1', '--dry-run' ], { HEALTH_BODY: body( { failing: true } ) } )
  assert.equal( result.status, 0, result.stderr )
  assert.match( result.stdout, /\+ check replication/ )
  assert.deepEqual( box.calls(), [] )
} )

const ISO = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z'

test( 'reports the version and the schema change, and records the deploy', () => {
  const box = sandbox()
  box.seedHistory( '2026-11-01T09:00:00Z 0.10.0 13\n' )
  const result = box.run( [ '0.11.0' ], { HEALTH_BODY_AFTER: body( { schema: 14 } ) } )
  assert.equal( result.status, 0, result.stderr )
  assert.match( result.stdout, /Atlas 0\.11\.0 is up, schema 13 → 14/ )
  const history = box.history()
  assert.equal( history.length, 2 )
  assert.match( history[ 1 ], new RegExp( `^${ ISO } 0\\.11\\.0 14$` ) )
} )

test( 'says schema unchanged when a deploy did not migrate', () => {
  const box = sandbox()
  box.seedHistory( '2026-11-01T09:00:00Z 0.10.0 13\n' )
  const result = box.run( [ '0.10.1' ], { HEALTH_BODY_AFTER: body( { schema: 13 } ) } )
  assert.equal( result.status, 0, result.stderr )
  assert.match( result.stdout, /Atlas 0\.10\.1 is up, schema 13, unchanged/ )
  assert.match( box.history().at( -1 ), / 0\.10\.1 13$/ )
})

test( 'the rollback hint uses the history, and names --restore-pre-migration only across a migration', () => {
  const box = sandbox()
  box.seedHistory( '2026-11-01T09:00:00Z 0.10.0 13\n' )
  const migrated = box.run( [ '0.11.0' ], { HEALTH_BODY_AFTER: body( { schema: 14 } ) } )
  assert.match( migrated.stdout, /to go back: .*deploy\.sh 0\.10\.0 --restore-pre-migration/ )
  const plain = box.run( [ '0.11.1' ], { HEALTH_BODY: body( { schema: 14 } ), HEALTH_BODY_AFTER: body( { schema: 14 } ) } )
  assert.match( plain.stdout, /to go back: [^\n]*deploy\.sh 0\.11\.0\)/ )
  assert.doesNotMatch( plain.stdout, /restore-pre-migration/ )
} )

test( 'with no history, the running app is recorded first so a later rollback can find its schema', () => {
  const box = sandbox()
  const result = box.run( [ '0.11.0' ], { HEALTH_BODY: body( { schema: 13 } ), HEALTH_BODY_AFTER: body( { schema: 14 } ) } )
  assert.equal( result.status, 0, result.stderr )
  const history = box.history()
  assert.equal( history.length, 2 )
  assert.match( history[ 0 ], /^\S+ 0\.10\.0 13$/, 'the version in atlas.env with the schema the app reported' )
  assert.match( history[ 1 ], / 0\.11\.0 14$/ )
  assert.match( result.stdout, /schema 13 → 14/ )
} )

test( 'a failed health wait records the version with an unknown schema, and names --restore-pre-migration', () => {
  const box = sandbox()
  box.seedHistory( '2026-11-01T09:00:00Z 0.10.0 13\n' )
  const result = box.run( [ '0.11.0' ], { HEALTH_OK_AFTER: '0' } )
  assert.notEqual( result.status, 0 )
  assert.match( box.history().at( -1 ), / 0\.11\.0 unknown$/ )
  assert.match( result.stderr, /deploy\.sh 0\.10\.0 --restore-pre-migration/ )
  assert.match( result.stderr, /refuses a database from a newer version/ )
} )

test( '--dry-run writes no history', () => {
  const box = sandbox()
  assert.equal( box.run( [ '0.11.0', '--dry-run' ] ).status, 0 )
  assert.deepEqual( box.history(), [] )
} )

const RUNNING = '2026-11-07T09:00:00Z 0.10.0 13\n2026-11-07T10:00:00Z 0.11.0 14\n'
const copy = '/data/pre-migration/pre-migration-v13-to-v14-20261107-181500.db'
const cli = 'app node dist/src/scripts/preMigration.js'

test( '--restore-pre-migration: finds the copy, stops, swaps, then deploys the previous version', () => {
  const box = sandbox( { current: 'ATLAS_VERSION=0.11.0\nREGISTRY=r.example/atlas\n' } )
  box.seedHistory( RUNNING )
  const result = box.run( [ '0.10.0', '--restore-pre-migration' ], { HEALTH_BODY: body( { schema: 13 } ) } )
  assert.equal( result.status, 0, result.stderr )

  const calls = box.calls()
  const at = ( text ) => calls.findIndex( ( call ) => call.includes( text ) )
  const order = [
    at( 'fetch-secrets' ),
    at( `${ cli } find 13 14` ),
    at( 'systemctl stop atlas' ),
    at( `${ cli } swap ${ copy }` ),
    calls.findIndex( ( call ) => call.endsWith( ' pull' ) ),
    at( 'systemctl restart atlas' ),
  ]
  assert.ok( order.every( ( index ) => index >= 0 ), `every step ran: ${ order }` )
  assert.deepEqual( order, [ ...order ].sort( ( a, b ) => a - b ), 'in this order' )
  assert.match( calls[ order[ 1 ] ], /run --rm -T --no-deps app node/ )
  assert.match( box.env(), /^ATLAS_VERSION=0\.10\.0$/m )
  assert.ok( !calls.some( ( call ) => call.startsWith( 'curl ' ) && !call.includes( ' -w ' ) && calls.indexOf( call ) < order[ 4 ] ), 'no preflight: the app is stopped' )
  assert.match( result.stdout, /Atlas 0\.10\.0 is up, schema 14 → 13/ )
  assert.match( box.history().at( -1 ), / 0\.10\.0 13$/ )
  assert.doesNotMatch( result.stdout, /to go back: [^\n]*restore-pre-migration/, 'going forward again is a plain deploy' )
} )

test( '--restore-pre-migration refuses without a history entry for the target', () => {
  const noLog = sandbox()
  const first = noLog.run( [ '0.10.0', '--restore-pre-migration' ] )
  assert.notEqual( first.status, 0 )
  assert.match( first.stderr, /no deploy history/ )

  const box = sandbox()
  box.seedHistory( RUNNING )
  const unknown = box.run( [ '0.9.0', '--restore-pre-migration' ] )
  assert.notEqual( unknown.status, 0 )
  assert.match( unknown.stderr, /0\.9\.0 is not in the deploy history/ )
  for( const b of [ noLog, box ] ) assert.deepEqual( b.calls(), [] )
} )

test( '--restore-pre-migration refuses when the schema is the same, and points at a plain deploy', () => {
  const box = sandbox()
  box.seedHistory( '2026-11-01T09:00:00Z 0.10.0 13\n2026-11-02T09:00:00Z 0.10.1 13\n' )
  const result = box.run( [ '0.10.0', '--restore-pre-migration' ] )
  assert.notEqual( result.status, 0 )
  assert.match( result.stderr, /same schema \(13\)/ )
  assert.match( result.stderr, /deploy\.sh 0\.10\.0` is enough|deploy\.sh 0\.10\.0 is enough/ )
  assert.deepEqual( box.calls(), [] )
} )

test( '--restore-pre-migration refuses when no copy exists, before stopping anything', () => {
  const box = sandbox()
  box.seedHistory( RUNNING )
  const result = box.run( [ '0.10.0', '--restore-pre-migration' ], { FIND_RESULT: 'none' } )
  assert.notEqual( result.status, 0 )
  assert.match( result.stderr, /no pre-migration copy for schema 13 → 14/ )
  assert.match( result.stderr, /Restoring the database/ )
  assert.ok( !box.calls().some( ( call ) => call.startsWith( 'systemctl' ) || call.includes( ' swap ' ) ) )
  assert.match( box.env(), /^ATLAS_VERSION=0\.10\.0$/m, 'atlas.env untouched' )
} )

test( 'after a failed deploy the running schema is unknown, and the copy is found from the target schema alone', () => {
  const box = sandbox( { current: 'ATLAS_VERSION=0.11.0\n' } )
  box.seedHistory( '2026-11-07T09:00:00Z 0.10.0 13\n2026-11-07T10:00:00Z 0.11.0 unknown\n' )
  const result = box.run( [ '0.10.0', '--restore-pre-migration' ], { HEALTH_BODY: body( { schema: 13 } ) } )
  assert.equal( result.status, 0, result.stderr )
  assert.ok( box.calls().some( ( call ) => call.endsWith( `${ cli } find 13` ) ) )
  assert.ok( box.calls().some( ( call ) => call.includes( `${ cli } swap ${ copy }` ) ) )
} )

test( '--restore-pre-migration --dry-run prints the whole sequence and runs nothing', () => {
  const box = sandbox()
  box.seedHistory( RUNNING )
  const result = box.run( [ '0.10.0', '--restore-pre-migration', '--dry-run' ] )
  assert.equal( result.status, 0, result.stderr )
  assert.deepEqual( box.calls(), [] )
  const lines = result.stdout.split( '\n' )
  const at = ( pattern ) => lines.findIndex( ( line ) => pattern.test( line ) )
  const order = [ /read the secrets/, /find the pre-migration copy.*13 → 14/, /systemctl stop atlas/, /swap/, /pull the 0\.10\.0 images/, /ATLAS_VERSION=0\.10\.0/, /systemctl restart atlas/ ].map( at )
  assert.ok( order.every( ( index ) => index >= 0 ), `every step is listed: ${ order }` )
  assert.deepEqual( order, [ ...order ].sort( ( a, b ) => a - b ) )
  assert.doesNotMatch( result.stdout, /check replication/, 'no preflight' )
} )
