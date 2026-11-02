// deploy/litestream/litestream.yml (ADR 0076, TRD 6.2). The text is checked here; when the pinned
// Litestream image is already on this machine, the real binary parses the file too (no pull, no network).
import { spawnSync } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const here = dirname( fileURLToPath( import.meta.url ) )
const file = join( here, 'litestream.yml' )
const PINNED = 'litestream/litestream:0.5.17'

test( 'replicates atlas.db to a GCS bucket every second, with daily snapshots kept 7 days', () => {
  const text = readFileSync( file, 'utf8' )
  assert.match( text, /^addr: ":9090"$/m )
  assert.match( text, /^sync-interval: 1s$/m )
  assert.match( text, /^snapshot:\n {2}interval: 24h\n {2}retention: 168h$/m )
  assert.match( text, /path: \/data\/atlas\.db/ )
  assert.match( text, /type: gs$/m ) // Litestream's name for Google Cloud Storage
  assert.match( text, /bucket: \$\{LITESTREAM_BUCKET\}/ )
  assert.match( text, /^ {6}path: atlas\.db$/m )
  const settings = text.split( '\n' ).filter( ( line ) => !line.trim().startsWith( '#' ) ).join( '\n' )
  assert.doesNotMatch( settings, /access-key|secret|credentials/i, 'no key: the VM service account is used' )
} )

const imagePresent = spawnSync( 'docker', [ 'image', 'inspect', PINNED ], { stdio: 'ignore' } ).status === 0

test( 'the pinned Litestream reads the file and finds the database', { skip: imagePresent ? false : `${ PINNED } is not pulled` }, () => {
  const run = spawnSync( 'docker', [
    'run', '--rm', '--network', 'none', '-e', 'LITESTREAM_BUCKET=example-bucket',
    '-v', `${ file }:/etc/litestream.yml:ro`, PINNED, 'databases',
  ], { encoding: 'utf8' } )
  assert.equal( run.status, 0, run.stderr )
  assert.match( run.stdout, /\/data\/atlas\.db/ )
  assert.match( run.stdout, /\/data\/atlas\.db\s+gs/ )
} )
