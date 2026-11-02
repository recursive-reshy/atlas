// bootstrap.sh (ADR 0077, TRD 8.3): sets up a fresh Debian VM, and can be run again after any
// change without doing anything twice. The real script runs here against fake apt-get, systemctl,
// swapon, chown, curl, ... with every path under a temp folder (ATLAS_ROOT); nothing is installed.
import { spawnSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname( fileURLToPath( import.meta.url ) )
const script = join( here, 'bootstrap.sh' )
const repo = join( here, '..', '..' )

const write = ( path, text ) => {
  writeFileSync( path, text )
  chmodSync( path, 0o755 )
}

// The fakes are written once (macOS scans every new executable the first time it runs) and find
// their per-test folder in FAKE_DIR.
const shared = mkdtempSync( join( tmpdir(), 'atlas-bootstrap-bin-' ) )
const bin = join( shared, 'bin' )
const gcloudBin = join( shared, 'gcloud-bin' )
mkdirSync( bin )
mkdirSync( gcloudBin )
const log = 'echo "$FAKE_NAME $*" >> "$FAKE_DIR/calls"'
for( const name of [ 'mkswap', 'chown', 'gpg', 'docker' ] ) {
  write( join( bin, name ), `#!/bin/sh\nFAKE_NAME=${ name }; ${ log }\n` )
}
write( join( gcloudBin, 'gcloud' ), `#!/bin/sh\nFAKE_NAME=gcloud; ${ log }\n` )
write( join( bin, 'systemctl' ), `#!/bin/sh
echo "systemctl $*" >> "$FAKE_DIR/calls"
case "$1" in
  is-enabled) [ -f "$FAKE_DIR/enabled-$3" ]; exit $? ;;
  enable) touch "$FAKE_DIR/enabled-$2" ;;
esac
` )
write( join( bin, 'id' ), '#!/bin/sh\necho "$FAKE_UID"\n' )
write( join( bin, 'fallocate' ), `#!/bin/sh\necho "fallocate $*" >> "$FAKE_DIR/calls"\nfor last; do :; done\n: > "$last"\n` )
write( join( bin, 'swapon' ), `#!/bin/sh
echo "swapon $*" >> "$FAKE_DIR/calls"
if [ "$1" = "--show=NAME" ]; then [ -f "$FAKE_DIR/swap-on" ] && echo /swapfile; exit 0; fi
touch "$FAKE_DIR/swap-on"
` )
write( join( bin, 'dpkg' ), `#!/bin/sh
if [ "$1" = "--print-architecture" ]; then echo amd64; exit 0; fi
if [ "$1" = "-s" ]; then [ -f "$FAKE_DIR/installed/$2" ]; exit $?; fi
exit 64
` )
write( join( bin, 'apt-get' ), `#!/bin/sh
echo "apt-get $*" >> "$FAKE_DIR/calls"
if [ "$1" = "install" ]; then
  shift
  for arg in "$@"; do case "$arg" in -*) ;; *) touch "$FAKE_DIR/installed/$arg" ;; esac; done
fi
` )
write( join( bin, 'curl' ), `#!/bin/sh
echo "curl $*" >> "$FAKE_DIR/calls"
out=
while [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then out=$2; fi; shift; done
if [ -n "$out" ]; then echo "KEY FROM CURL" > "$out"; else echo "KEY OR LIST FROM CURL"; fi
` )

const sandbox = ( { withGcloud = false, uid = 0 } = {} ) => {
  const dir = mkdtempSync( join( tmpdir(), 'atlas-bootstrap-' ) )
  const root = join( dir, 'root' )
  mkdirSync( join( root, 'etc' ), { recursive: true } )
  mkdirSync( join( dir, 'installed' ) )
  writeFileSync( join( dir, 'os-release' ), 'ID=debian\nVERSION_CODENAME=bookworm\n' )
  const calls = join( dir, 'calls' )

  return {
    dir,
    root,
    calls: () => ( existsSync( calls ) ? readFileSync( calls, 'utf8' ) : '' ),
    clearCalls: () => writeFileSync( calls, '' ),
    run: ( env = {} ) => spawnSync( 'bash', [ script ], {
      encoding: 'utf8',
      env: {
        PATH: `${ withGcloud ? `${ gcloudBin }:` : '' }${ bin }:${ dirname( process.execPath ) }:/usr/bin:/bin`,
        FAKE_DIR: dir,
        FAKE_UID: String( uid ),
        ATLAS_ROOT: root,
        ATLAS_SRC: repo,
        OS_RELEASE: join( dir, 'os-release' ),
        ...env,
      },
    } ),
  }
}

// path -> mode and content of every file and folder under root, to compare two runs
const snapshot = ( root ) => {
  const result = {}
  const walk = ( dir ) => {
    for( const name of readdirSync( dir ).sort() ) {
      const path = join( dir, name )
      const stat = lstatSync( path )
      const key = relative( root, path )
      if( stat.isDirectory() ) {
        result[ key ] = `dir ${ ( stat.mode & 0o777 ).toString( 8 ) }`
        walk( path )
      } else {
        result[ key ] = `file ${ ( stat.mode & 0o777 ).toString( 8 ) } ${ readFileSync( path, 'utf8' ) }`
      }
    }
  }
  walk( root )
  return result
}

const read = ( box, path ) => readFileSync( join( box.root, path ), 'utf8' )

test( 'a first run sets up the packages, swap, Docker, folders, files and the unit', () => {
  const box = sandbox()
  const result = box.run()
  assert.equal( result.status, 0, result.stderr )
  const calls = box.calls()

  // Docker and Tailscale come from their own apt repositories
  assert.match( read( box, 'etc/apt/sources.list.d/docker.sources' ), /Suites: bookworm\nComponents: stable\nArchitectures: amd64\nSigned-By: \/etc\/apt\/keyrings\/docker\.asc/ )
  assert.match( read( box, 'etc/apt/sources.list.d/tailscale.list' ), /KEY FROM CURL/ )
  assert.ok( existsSync( join( box.root, 'etc/apt/keyrings/docker.asc' ) ) )
  assert.ok( existsSync( join( box.root, 'usr/share/keyrings/tailscale-archive-keyring.gpg' ) ) )
  assert.match( calls, /apt-get install .*docker-ce\b.*docker-compose-plugin/ )
  assert.match( calls, /apt-get install .*\btailscale\b/ )
  assert.match( calls, /apt-get install .*unattended-upgrades/ )
  assert.match( read( box, 'etc/apt/apt.conf.d/20auto-upgrades' ), /Unattended-Upgrade "1"/ )

  // 2 GB swap
  assert.match( calls, /fallocate -l 2G .*swapfile/ )
  assert.match( calls, /mkswap .*swapfile/ )
  assert.match( calls, /swapon .*swapfile/ )
  assert.equal( read( box, 'etc/fstab' ).split( '\n' ).filter( ( line ) => line === '/swapfile none swap sw 0 0' ).length, 1 )
  assert.equal( lstatSync( join( box.root, 'swapfile' ) ).mode & 0o777, 0o600 )

  // Docker log rotation
  assert.deepEqual( JSON.parse( read( box, 'etc/docker/daemon.json' ) ), { 'log-driver': 'json-file', 'log-opts': { 'max-size': '10m', 'max-file': '3' } } )

  // Folders the containers write to belong to UID 1000
  for( const folder of [ 'srv/atlas/vaults', 'srv/atlas/vaults/naresh', 'srv/atlas/data', 'srv/atlas/sync-status' ] ) {
    assert.ok( existsSync( join( box.root, folder ) ), folder )
    assert.match( calls, new RegExp( `chown 1000:1000 .*${ folder.replaceAll( '/', '\\/' ) }$`, 'm' ) )
  }

  // What the unit runs
  for( const file of [ 'docker-compose.yml', 'compose.prod.yml', 'litestream.yml', 'fetch-secrets.sh', 'deploy.sh' ] ) {
    assert.equal( read( box, `opt/atlas/${ file }` ), readFileSync( join( repo, file === 'litestream.yml' ? 'deploy/litestream/litestream.yml' : file === 'fetch-secrets.sh' || file === 'deploy.sh' ? `deploy/vm/${ file }` : file ), 'utf8' ), file )
  }
  assert.equal( lstatSync( join( box.root, 'opt/atlas/fetch-secrets.sh' ) ).mode & 0o777, 0o755 )
  assert.equal( lstatSync( join( box.root, 'opt/atlas/deploy.sh' ) ).mode & 0o777, 0o755 )
  assert.equal( read( box, 'etc/systemd/system/atlas.service' ), readFileSync( join( here, 'atlas.service' ), 'utf8' ) )
  assert.match( calls, /systemctl daemon-reload/ )
  assert.match( calls, /systemctl enable atlas\b/ )
  assert.doesNotMatch( calls, /systemctl (start|restart) atlas/, 'the stack is started by the first deploy, not by bootstrap' )

  // Settings start from the example
  assert.equal( read( box, 'etc/atlas/atlas.env' ), readFileSync( join( here, 'atlas.env.example' ), 'utf8' ) )
  assert.equal( lstatSync( join( box.root, 'etc/atlas/atlas.env' ) ).mode & 0o777, 0o640 )
} )

test( 'a second run changes nothing, and an edited atlas.env is kept', () => {
  const box = sandbox()
  assert.equal( box.run().status, 0 )
  writeFileSync( join( box.root, 'etc/atlas/atlas.env' ), 'ATLAS_VERSION=0.10.1\nMY_SETTING=1\n' )
  const before = snapshot( box.root )
  box.clearCalls()

  const result = box.run()
  assert.equal( result.status, 0, result.stderr )
  assert.deepEqual( snapshot( box.root ), before )
  assert.equal( read( box, 'etc/atlas/atlas.env' ), 'ATLAS_VERSION=0.10.1\nMY_SETTING=1\n' )
  const calls = box.calls()
  for( const forbidden of [ /apt-get install/, /fallocate/, /mkswap/, /systemctl (daemon-reload|enable|restart)/ ] ) {
    assert.doesNotMatch( calls, forbidden )
  }
} )

test( 'a changed file in the checkout reaches /opt/atlas and reloads systemd on the next run', () => {
  const box = sandbox()
  assert.equal( box.run().status, 0 )
  const src = mkdtempSync( join( tmpdir(), 'atlas-src-' ) )
  for( const file of [
    'docker-compose.yml', 'compose.prod.yml', 'deploy/litestream/litestream.yml', 'deploy/vm/fetch-secrets.sh', 'deploy/vm/deploy.sh',
    'deploy/vm/atlas.service', 'deploy/vm/atlas.env.example', 'deploy/vm/docker-credential-atlas-gar',
  ] ) {
    mkdirSync( dirname( join( src, file ) ), { recursive: true } )
    writeFileSync( join( src, file ), readFileSync( join( repo, file ) ) )
  }
  writeFileSync( join( src, 'deploy/vm/atlas.service' ), `${ readFileSync( join( here, 'atlas.service' ), 'utf8' ) }# changed\n` )
  writeFileSync( join( src, 'compose.prod.yml' ), `${ readFileSync( join( repo, 'compose.prod.yml' ), 'utf8' ) }# changed\n` )
  box.clearCalls()
  assert.equal( box.run( { ATLAS_SRC: src } ).status, 0 )
  assert.match( read( box, 'etc/systemd/system/atlas.service' ), /# changed/ )
  assert.match( read( box, 'opt/atlas/compose.prod.yml' ), /# changed/ )
  assert.match( box.calls(), /systemctl daemon-reload/ )
} )

test( 'a changed Docker log setting restarts Docker once it is installed', () => {
  const box = sandbox()
  assert.equal( box.run().status, 0 )
  writeFileSync( join( box.root, 'etc/docker/daemon.json' ), '{}\n' )
  box.clearCalls()
  assert.equal( box.run().status, 0 )
  assert.match( box.calls(), /systemctl restart docker/ )
  assert.deepEqual( JSON.parse( read( box, 'etc/docker/daemon.json' ) )[ 'log-driver' ], 'json-file' )
} )

test( 'registry login uses gcloud when it is installed', () => {
  const box = sandbox( { withGcloud: true } )
  const result = box.run( { REGISTRY_HOST: 'asia-southeast1-docker.pkg.dev' } )
  assert.equal( result.status, 0, result.stderr )
  assert.match( box.calls(), /gcloud auth configure-docker --quiet asia-southeast1-docker\.pkg\.dev/ )
  assert.equal( existsSync( join( box.root, 'usr/local/bin/docker-credential-atlas-gar' ) ), false )
} )

test( 'without gcloud, a credential helper that uses the metadata token logs in to the registry', () => {
  const box = sandbox()
  const result = box.run( { REGISTRY_HOST: 'asia-southeast1-docker.pkg.dev' } )
  assert.equal( result.status, 0, result.stderr )
  const helper = join( box.root, 'usr/local/bin/docker-credential-atlas-gar' )
  assert.equal( readFileSync( helper, 'utf8' ), readFileSync( join( here, 'docker-credential-atlas-gar' ), 'utf8' ) )
  assert.equal( lstatSync( helper ).mode & 0o777, 0o755 )
  assert.deepEqual( JSON.parse( read( box, 'root/.docker/config.json' ) ), { credHelpers: { 'asia-southeast1-docker.pkg.dev': 'atlas-gar' } } )
} )

test( 'the credential helper answers `get` with the metadata token, and only `get`', () => {
  const dir = mkdtempSync( join( tmpdir(), 'atlas-helper-' ) )
  write( join( dir, 'curl' ), '#!/bin/sh\ncase "$*" in *"Metadata-Flavor: Google"*) ;; *) exit 22 ;; esac\nprintf \'{"access_token":"TOKEN-1","expires_in":3599,"token_type":"Bearer"}\'\n' )
  const helper = join( here, 'docker-credential-atlas-gar' )
  const env = { PATH: `${ dir }:/usr/bin:/bin` }
  const get = spawnSync( 'sh', [ helper, 'get' ], { input: 'asia-southeast1-docker.pkg.dev\n', encoding: 'utf8', env } )
  assert.equal( get.status, 0, get.stderr )
  assert.deepEqual( JSON.parse( get.stdout ), { ServerURL: 'asia-southeast1-docker.pkg.dev', Username: 'oauth2accesstoken', Secret: 'TOKEN-1' } )
  for( const verb of [ 'store', 'erase', 'list' ] ) {
    assert.notEqual( spawnSync( 'sh', [ helper, verb ], { input: '', encoding: 'utf8', env } ).status, 0, verb )
  }
} )

test( 'it refuses to run as anyone but root', () => {
  const box = sandbox( { uid: 1000 } )
  const result = box.run()
  assert.notEqual( result.status, 0 )
  assert.match( result.stderr, /root/ )
  assert.equal( box.calls(), '' )
} )
