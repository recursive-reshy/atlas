// The test gate (ADR 0106): runs every step, never stops early, prints one table and exits 1 if any step failed.
//   node scripts/gate.mjs [--only shared,server,web,agent,e2e,root] [--tests]
// Not in the gate: `test:integration` (real Claude API) and `pnpm e2e` (needs Docker).
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )

const pnpm = ( folder, pkg, name, kind, script = name ) => ( {
  folder, name: `${ folder } ${ name }`, kind, command: 'pnpm', args: [ '--filter', pkg, script ],
} )

export const STEPS = [
  pnpm( 'shared', '@atlas/shared', 'test', 'test' ),
  pnpm( 'shared', '@atlas/shared', 'lint', 'lint' ),
  pnpm( 'shared', '@atlas/shared', 'typecheck', 'typecheck' ),
  pnpm( 'server', '@atlas/server', 'test', 'test' ),
  pnpm( 'server', '@atlas/server', 'lint', 'lint' ),
  pnpm( 'server', '@atlas/server', 'typecheck', 'typecheck' ),
  pnpm( 'agent', '@atlas/agent', 'test', 'test' ),
  pnpm( 'agent', '@atlas/agent', 'lint', 'lint' ),
  pnpm( 'agent', '@atlas/agent', 'typecheck', 'typecheck' ),
  pnpm( 'web', '@atlas/web', 'test', 'test' ),
  pnpm( 'web', '@atlas/web', 'test:browser', 'test', 'test:browser' ),
  pnpm( 'web', '@atlas/web', 'lint', 'lint' ),
  pnpm( 'web', '@atlas/web', 'typecheck', 'typecheck' ),
  pnpm( 'e2e', '@atlas/e2e', 'test:fakes', 'test', 'test:fakes' ),
  pnpm( 'e2e', '@atlas/e2e', 'lint', 'lint' ),
  pnpm( 'e2e', '@atlas/e2e', 'typecheck', 'typecheck' ),
  { folder: 'root', name: 'root scripts and deploy tests', kind: 'test', command: 'node', args: [ '--test', 'scripts/*.test.mjs', 'deploy/**/*.test.mjs' ] },
]

export const FOLDERS = [ 'shared', 'server', 'web', 'agent', 'e2e', 'root' ]

// `agent` or `shared` also selects the contract step (ADR 0104); there is none until the generator exists.
export const selectSteps = ( steps, { only, tests } = {} ) => {
  if( only ) {
    const unknown = only.filter( ( name ) => !FOLDERS.includes( name ) )
    if( unknown.length ) throw new Error( `unknown folder: ${ unknown.join( ', ' ) } (one of ${ FOLDERS.join( ', ' ) })` )
  }
  return steps.filter( ( step ) => {
    if( tests && step.kind !== 'test' ) return false
    if( !only ) return true
    if( step.kind === 'contract' ) return only.includes( 'agent' ) || only.includes( 'shared' )
    return only.includes( step.folder )
  } )
}

const runStep = ( step ) => new Promise( ( resolve ) => {
  const started = Date.now()
  const chunks = []
  const done = ( ok, extra = '' ) => resolve( { name: step.name, ok, ms: Date.now() - started, output: chunks.join( '' ) + extra } )
  const child = spawn( step.command, step.args, { cwd: root, stdio: [ 'ignore', 'pipe', 'pipe' ], env: { ...process.env, FORCE_COLOR: '0' } } )
  child.stdout.on( 'data', ( data ) => chunks.push( String( data ) ) )
  child.stderr.on( 'data', ( data ) => chunks.push( String( data ) ) )
  child.on( 'error', ( error ) => done( false, `${ error.message }\n` ) )
  child.on( 'close', ( code ) => done( code === 0 ) )
} )

export const runSteps = async ( steps ) => {
  const results = []
  for( const step of steps ) results.push( await runStep( step ) )
  return results
}

export const formatReport = ( results ) => {
  const width = Math.max( 4, ...results.map( ( r ) => r.name.length ) )
  const rows = results.map( ( r ) => `${ r.name.padEnd( width ) }  ${ ( r.ok ? 'pass' : 'FAIL' ).padEnd( 6 ) }${ ( r.ms / 1000 ).toFixed( 1 ) }s` )
  const failed = results.filter( ( r ) => !r.ok )
  const lines = [ `${ 'Step'.padEnd( width ) }  Result  Time`, ...rows, '', `${ results.length - failed.length } passed, ${ failed.length } failed` ]
  for( const r of failed ) lines.push( '', `----- ${ r.name } -----`, r.output.trimEnd() )
  return { text: lines.join( '\n' ), exitCode: failed.length ? 1 : 0 }
}

if( process.argv[ 1 ] && fileURLToPath( import.meta.url ) === process.argv[ 1 ] ) {
  const args = process.argv.slice( 2 )
  const at = args.indexOf( '--only' )
  const options = { tests: args.includes( '--tests' ), only: at >= 0 ? ( args[ at + 1 ] ?? '' ).split( ',' ).filter( Boolean ) : undefined }
  const steps = selectSteps( STEPS, options )
  const { text, exitCode } = formatReport( await runSteps( steps ) )
  console.log( text )
  process.exitCode = exitCode
}
