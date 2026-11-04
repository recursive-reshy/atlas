// The app image's yt-dlp loads the bgutil PO token plugin (ADR 0079, TRD 11). Builds only the
// Dockerfile's `tools` stage, which downloads yt-dlp and the plugin, so it needs Docker and network.
import { spawnSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )
const hasDocker = spawnSync( 'docker', [ 'version' ], { stdio: 'ignore' } ).status === 0
const skip = hasDocker ? false : 'docker is not running'

test( 'the Dockerfile pins one bgutil version', () => {
  const dockerfile = readFileSync( join( root, 'Dockerfile' ), 'utf8' )
  assert.match( dockerfile, /^ARG BGUTIL_VERSION=\d+\.\d+\.\d+$/m )
} )

test( 'yt-dlp in the image loads the bgutil plugin', { skip, timeout: 600_000 }, () => {
  const tag = 'atlas-tools:plugin-test'
  const build = spawnSync( 'docker', [ 'build', '--target', 'tools', '--tag', tag, root ], { encoding: 'utf8' } )
  assert.equal( build.status, 0, build.stderr.slice( -2000 ) )

  // The debug header names the plugin folders it loaded (the "PO Token Providers" line only comes
  // with the first YouTube request, which release check 8.3 covers); the dead address fails at once
  const run = spawnSync( 'docker', [ 'run', '--rm', tag, 'yt-dlp', '-v', '--simulate', 'http://127.0.0.1:1/x' ], { encoding: 'utf8' } )
  const header = run.stderr.split( '\n' ).find( ( line ) => line.includes( 'Plugin directories' ) ) ?? ''
  assert.match( header, /bgutil/i, `yt-dlp -v said: ${ header || run.stderr.slice( 0, 1500 ) }` )
} )
