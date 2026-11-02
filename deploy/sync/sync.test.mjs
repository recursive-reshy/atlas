// sync.sh (ADR 0075, TRD 5.3): runs Obsidian's `ob sync --continuous` for one vault, restarts it with
// backoff and writes <VAULT_DIR>.json for the server. Every test runs the real script against a fake
// `ob` and a fake `sleep` in a temp folder; nothing touches Obsidian or the network.
import { spawn } from 'node:child_process'
import { strict as assert } from 'node:assert'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = join( dirname( fileURLToPath( import.meta.url ) ), 'sync.sh' )
const HEARTBEAT = 3

const wait = ( ms ) => new Promise( ( resolve ) => setTimeout( resolve, ms ) )

const until = async ( check, what, timeoutMs = 8000 ) => {
  const end = Date.now() + timeoutMs
  for( ;; ) {
    const value = check()
    if( value ) return value
    if( Date.now() > end ) throw new Error( `Timed out waiting for ${ what }` )
    await wait( 20 )
  }
}

const write = ( path, text ) => {
  writeFileSync( path, text )
  chmodSync( path, 0o755 )
}

// A sandbox with a fake `ob` and `sleep`. FAKE_OB_MODE picks the behaviour:
//   stay    - `ob sync` creates a note and keeps running
//   crash   - `ob sync` prints two lines to stderr and exits 1
//   stable  - runs 1 and 2 crash, run 3 stays up for 2.5 s and then crashes, later runs crash
const sandbox = () => {
  const dir = mkdtempSync( join( tmpdir(), 'atlas-sync-' ) )
  const bin = join( dir, 'bin' )
  const status = join( dir, 'status' )
  const vault = join( dir, 'vault' )
  mkdirSync( bin )
  mkdirSync( status )
  mkdirSync( vault )

  write( join( bin, 'ob' ), `#!/bin/sh
if [ "$1" = "--version" ]; then echo 0.0.14; exit 0; fi
[ "$1" = "sync" ] && [ "$2" = "--continuous" ] && [ "$3" = "--path" ] && [ "$4" = "$VAULT_PATH" ] || { echo "unexpected arguments: $*" >&2; exit 64; }
echo run >> "${ dir }/runs"
runs=$(wc -l < "${ dir }/runs" | tr -d ' ')
case "$FAKE_OB_MODE" in
  stay)
    touch "$VAULT_PATH/created.md"
    exec /bin/sleep 30
    ;;
  stable)
    if [ "$runs" -eq 3 ]; then /bin/sleep 2.5; fi
    ;;
esac
echo "progress line" >&2
echo "Error: boom $runs" >&2
exit 1
` )

  // Records every wait. Heartbeat waits are short; backoff waits are long enough for a test to
  // see the failed status between restarts.
  write( join( bin, 'sleep' ), `#!/bin/sh
echo "$1" >> "${ dir }/sleeps"
if [ "$1" = "${ HEARTBEAT }" ]; then exec /bin/sleep 0.05; fi
exec /bin/sleep 0.3
` )

  const statusFile = join( status, 'naresh.json' )
  return {
    dir,
    status,
    vault,
    statusFile,
    runs: () => ( existsSync( join( dir, 'runs' ) ) ? readFileSync( join( dir, 'runs' ), 'utf8' ).trim().split( '\n' ).length : 0 ),
    sleeps: () => ( existsSync( join( dir, 'sleeps' ) )
      ? readFileSync( join( dir, 'sleeps' ), 'utf8' ).trim().split( '\n' ).filter( ( value ) => value !== String( HEARTBEAT ) ).map( Number )
      : [] ),
    readStatus: () => {
      try { return JSON.parse( readFileSync( statusFile, 'utf8' ) ) } catch { return null }
    },
    start: ( mode, extra = {} ) => {
      const previous = process.umask( 0o077 ) // the script must set its own umask
      try {
        const child = spawn( 'sh', [ script ], {
          env: {
            PATH: `${ bin }:${ process.env.PATH }`,
            VAULT_DIR: 'naresh',
            VAULT_PATH: vault,
            STATUS_DIR: status,
            HEARTBEAT_SECONDS: String( HEARTBEAT ),
            BACKOFF_START: '1',
            BACKOFF_MAX: '4',
            UPTIME_RESET_SECONDS: '2',
            FAKE_OB_MODE: mode,
            ...extra,
          },
          stdio: [ 'ignore', 'ignore', 'pipe' ],
        } )
        let stderr = ''
        child.stderr.on( 'data', ( chunk ) => { stderr += chunk } )
        const exited = new Promise( ( resolve ) => child.on( 'exit', ( code, signal ) => resolve( { code, signal } ) ) )
        return { child, exited, stderr: () => stderr }
      } finally {
        process.umask( previous )
      }
    },
  }
}

const stop = async ( { child, exited } ) => {
  child.kill( 'SIGTERM' )
  const result = await Promise.race( [ exited, wait( 3000 ).then( () => null ) ] )
  if( result === null ) {
    child.kill( 'SIGKILL' )
    assert.fail( 'sync.sh did not stop within 3 s of SIGTERM' )
  }
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/

test( 'a running client writes a status file whose heartbeat advances', async () => {
  const box = sandbox()
  const run = box.start( 'stay' )
  try {
    const first = await until( () => {
      const status = box.readStatus()
      return status?.state === 'running' ? status : null
    }, 'a running status' )

    assert.deepEqual( Object.keys( first ).sort(), [ 'cli_version', 'heartbeat_at', 'last_error', 'since', 'state' ] )
    assert.match( first.since, ISO )
    assert.match( first.heartbeat_at, ISO )
    assert.equal( first.last_error, null )
    assert.equal( first.cli_version, '0.0.14' )

    const later = await until( () => {
      const status = box.readStatus()
      return status && status.heartbeat_at !== first.heartbeat_at ? status : null
    }, 'a later heartbeat' )
    assert.equal( later.state, 'running' )
    assert.equal( later.since, first.since, 'since stays the time this run started' )
    assert.ok( later.heartbeat_at > first.heartbeat_at )

    // files made by ob and the status file are readable by the agent (umask 022 even from a stricter caller)
    assert.equal( statSync( join( box.vault, 'created.md' ) ).mode & 0o777, 0o644 )
    assert.equal( statSync( box.statusFile ).mode & 0o777, 0o644 )
  } finally {
    await stop( run )
  }
  assert.deepEqual( readdirSync( box.status ), [ 'naresh.json' ], 'no temporary file is left behind' )
} )

test( 'a crash is written as failed with the last stderr line, then ob is started again', async () => {
  const box = sandbox()
  const run = box.start( 'crash' )
  try {
    const failed = await until( () => {
      const status = box.readStatus()
      return status?.state === 'failed' ? status : null
    }, 'a failed status' )
    assert.equal( failed.last_error, 'Error: boom 1' )
    assert.match( failed.heartbeat_at, ISO )
    assert.equal( failed.cli_version, '0.0.14' )

    await until( () => box.runs() >= 2, 'a second start' )
    await until( () => box.readStatus()?.last_error === 'Error: boom 2', 'the second error' )
  } finally {
    await stop( run )
  }
} )

test( 'the wait between restarts doubles up to the maximum', async () => {
  const box = sandbox()
  const run = box.start( 'crash' )
  try {
    await until( () => box.sleeps().length >= 5, 'five waits' )
  } finally {
    await stop( run )
  }
  assert.deepEqual( box.sleeps().slice( 0, 5 ), [ 1, 2, 4, 4, 4 ] )
} )

test( 'a start that stayed up resets the wait', async () => {
  const box = sandbox()
  const run = box.start( 'stable' )
  try {
    await until( () => box.sleeps().length >= 5, 'five waits' )
  } finally {
    await stop( run )
  }
  // runs 1 and 2 crash at once (waits 1, 2); run 3 stays up 2.5 s (the reset is at 2 s, which a crash cannot reach even across a clock-second boundary), so the wait starts again at 1
  assert.deepEqual( box.sleeps().slice( 0, 5 ), [ 1, 2, 1, 2, 4 ] )
} )

test( 'it refuses a missing or path-like VAULT_DIR and writes nothing', async () => {
  const box = sandbox()
  for( const VAULT_DIR of [ '', '../escape', 'a/b', 'Upper' ] ) {
    const run = box.start( 'stay', { VAULT_DIR } )
    const result = await Promise.race( [ run.exited, wait( 3000 ).then( () => null ) ] )
    assert.ok( result !== null && result.code !== 0, `exits non-zero for VAULT_DIR=${ JSON.stringify( VAULT_DIR ) }` )
    assert.match( run.stderr(), /VAULT_DIR/ )
  }
  assert.deepEqual( readdirSync( box.status ), [], 'writes nothing' )
} )
