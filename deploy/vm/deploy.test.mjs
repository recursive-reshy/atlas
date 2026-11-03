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
for( const name of [ 'docker', 'systemctl', 'sleep' ] ) {
  write( join( bin, name ), `#!/bin/sh\necho "${ name } $*" >> "$FAKE_DIR/calls"\n` )
}
write( join( bin, 'id' ), '#!/bin/sh\necho "$FAKE_UID"\n' )
// Health: answers 503 until the HEALTH_OK_AFTER-th call (0 = never)
write( join( bin, 'curl' ), `#!/bin/sh
echo "curl $*" >> "$FAKE_DIR/calls"
n=$(( $(cat "$FAKE_DIR/health" 2>/dev/null || echo 0) + 1 ))
echo "$n" > "$FAKE_DIR/health"
if [ "\${HEALTH_OK_AFTER:-3}" -gt 0 ] && [ "$n" -ge "\${HEALTH_OK_AFTER:-3}" ]; then printf 200; else printf 503; fi
` )

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
        HEALTH_TIMEOUT: '30',
        HEALTH_INTERVAL: '5',
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
  const health = calls.filter( ( call ) => call.startsWith( 'curl ' ) )
  assert.equal( health.length, 3, 'asked three times: 503, 503, 200' )
  assert.match( health[ 0 ], /http:\/\/127\.0\.0\.1:3100\/api\/health/ )
  assert.equal( calls.filter( ( call ) => call === 'sleep 5' ).length, 2 )
  assert.match( result.stdout, /Atlas 0\.10\.1 is up/ )
  assert.match( result.stdout, /previous version was 0\.10\.0/ )
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
  assert.equal( box.calls().filter( ( call ) => call.startsWith( 'curl ' ) ).length, 6, '30 s / 5 s attempts' )
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
