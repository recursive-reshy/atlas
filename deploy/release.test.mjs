// release.sh (ADR 0077, TRD 8.6): builds the app, agent and sync images for linux/amd64 on the Mac
// and pushes them to the registry. Run here against a temp git repo and a fake docker: nothing is
// built or pushed.
import { execFileSync, spawnSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname( fileURLToPath( import.meta.url ) )
const script = join( here, 'release.sh' )
const realRepo = join( here, '..' )

const bin = mkdtempSync( join( tmpdir(), 'atlas-release-bin-' ) )
writeFileSync( join( bin, 'docker' ), '#!/bin/sh\necho "docker $*" >> "$FAKE_DIR/calls"\n' )
chmodSync( join( bin, 'docker' ), 0o755 )

const git = ( repo, ...args ) => execFileSync( 'git', args, {
  cwd: repo,
  encoding: 'utf8',
  env: { PATH: process.env.PATH, HOME: process.env.HOME, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
} )

const sandbox = ( { version = '0.10.0' } = {} ) => {
  const dir = mkdtempSync( join( tmpdir(), 'atlas-release-' ) )
  const repo = join( dir, 'repo' )
  mkdirSync( join( repo, 'deploy' ), { recursive: true } )
  git( repo, 'init', '-q' )
  writeFileSync( join( repo, 'package.json' ), JSON.stringify( { name: 'atlas', version } ) )
  writeFileSync( join( repo, '.gitignore' ), 'deploy/release.env\n' )
  git( repo, 'add', '.' )
  git( repo, 'commit', '-q', '-m', 'init' )
  return {
    dir,
    repo,
    calls: () => ( existsSync( join( dir, 'calls' ) ) ? readFileSync( join( dir, 'calls' ), 'utf8' ).trim().split( '\n' ) : [] ),
    run: ( args, env = {} ) => spawnSync( 'bash', [ script, ...args ], {
      encoding: 'utf8',
      env: { PATH: `${ bin }:/usr/bin:/bin:/usr/local/bin`, HOME: process.env.HOME, FAKE_DIR: dir, ATLAS_REPO: repo, ...env },
    } ),
  }
}

const REGISTRY = 'asia-southeast1-docker.pkg.dev/proj/atlas'

const expectedBuilds = ( repo, version = '0.10.0' ) => [
  `docker buildx build --platform linux/amd64 -f ${ repo }/Dockerfile -t ${ REGISTRY }/app:${ version } --push ${ repo }`,
  `docker buildx build --platform linux/amd64 -f ${ repo }/apps/agent/Dockerfile -t ${ REGISTRY }/agent:${ version } --push ${ repo }/apps/agent`,
  `docker buildx build --platform linux/amd64 -f ${ repo }/deploy/sync/Dockerfile -t ${ REGISTRY }/sync:${ version } --push ${ repo }/deploy/sync`,
]

test( 'builds and pushes the three images for linux/amd64, tagged with the version', () => {
  const box = sandbox()
  const result = box.run( [ '0.10.0' ], { REGISTRY } )
  assert.equal( result.status, 0, result.stderr )
  assert.deepEqual( box.calls(), expectedBuilds( box.repo ) )
} )

test( '--dry-run prints the same commands and runs none', () => {
  const box = sandbox()
  const result = box.run( [ '0.10.0', '--dry-run' ], { REGISTRY } )
  assert.equal( result.status, 0, result.stderr )
  assert.deepEqual( box.calls(), [] )
  for( const command of expectedBuilds( box.repo ) ) {
    assert.ok( result.stdout.includes( command ), `prints: ${ command }` )
  }
} )

test( 'REGISTRY can come from deploy/release.env, which is not part of a clean tree check', () => {
  const box = sandbox()
  writeFileSync( join( box.repo, 'deploy', 'release.env' ), `REGISTRY=${ REGISTRY }\n` )
  const result = box.run( [ '0.10.0' ] )
  assert.equal( result.status, 0, result.stderr )
  assert.deepEqual( box.calls(), expectedBuilds( box.repo ) )
} )

test( 'refuses a dirty tree, a wrong version, a malformed version and a missing registry', () => {
  const dirty = sandbox()
  writeFileSync( join( dirty.repo, 'new.txt' ), 'x' )
  const dirtyResult = dirty.run( [ '0.10.0' ], { REGISTRY } )
  assert.notEqual( dirtyResult.status, 0 )
  assert.match( dirtyResult.stderr, /uncommitted/ )

  const wrong = sandbox()
  const wrongResult = wrong.run( [ '0.10.1' ], { REGISTRY } )
  assert.notEqual( wrongResult.status, 0 )
  assert.match( wrongResult.stderr, /package\.json is 0\.10\.0/ )

  const malformed = sandbox()
  assert.notEqual( malformed.run( [ 'latest' ], { REGISTRY } ).status, 0 )
  assert.notEqual( malformed.run( [], { REGISTRY } ).status, 0 )

  const none = sandbox()
  const noneResult = none.run( [ '0.10.0' ] )
  assert.notEqual( noneResult.status, 0 )
  assert.match( noneResult.stderr, /REGISTRY/ )

  for( const box of [ dirty, wrong, malformed, none ] ) assert.deepEqual( box.calls(), [], 'nothing was built' )
} )

test( 'deploy/release.env is ignored by git and has an example', () => {
  const ignored = spawnSync( 'git', [ 'check-ignore', '-q', 'deploy/release.env' ], { cwd: realRepo } )
  assert.equal( ignored.status, 0 )
  assert.match( readFileSync( join( here, 'release.env.example' ), 'utf8' ), /^REGISTRY=.+-docker\.pkg\.dev\/.+$/m )
} )
