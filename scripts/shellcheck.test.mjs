// Every shell script in the repo passes shellcheck (TRD 9). Skipped with a message when shellcheck
// isn't installed (brew install shellcheck / apt install shellcheck).
import { execFileSync, spawnSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )

const installed = spawnSync( 'shellcheck', [ '--version' ], { stdio: 'ignore' } ).status === 0
const skip = installed ? false : 'shellcheck is not installed'

// Tracked or new (not ignored) files that are shell scripts: *.sh, or a #! line naming sh or bash
const scripts = () => execFileSync( 'git', [ 'ls-files', '--cached', '--others', '--exclude-standard', 'deploy', 'e2e', 'ops', 'scripts' ], { cwd: root, encoding: 'utf8' } )
  .split( '\n' )
  .filter( ( file ) => file !== '' && !file.includes( 'node_modules' ) )
  .filter( ( file ) => file.endsWith( '.sh' ) || /^#!.*\b(ba)?sh\b/.test( readFileSync( join( root, file ), 'utf8' ).split( '\n' )[ 0 ] ) )

test( 'the repo has shell scripts to check', () => {
  const files = scripts()
  for( const expected of [ 'deploy/sync/sync.sh', 'deploy/vm/fetch-secrets.sh', 'deploy/vm/bootstrap.sh', 'deploy/vm/docker-credential-atlas-gar', 'e2e/run.sh', 'ops/docker-entrypoint.sh' ] ) {
    assert.ok( files.includes( expected ), `${ expected } is not found by the shell-script filter` )
  }
} )

test( 'shellcheck finds nothing in them', { skip }, () => {
  const run = spawnSync( 'shellcheck', scripts(), { cwd: root, encoding: 'utf8' } )
  assert.equal( run.status, 0, run.stdout + run.stderr )
} )
