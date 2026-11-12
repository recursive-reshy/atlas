// The test gate (ADR 0106): runs every step, never stops early, prints one table, exits 1 if any step failed.
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { STEPS, formatReport, runSteps, selectSteps } from './gate.mjs'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )

const fake = ( name, code, kind = 'test', folder = 'server' ) => ( {
  folder, name, kind, command: process.execPath,
  args: [ '-e', `console.log( '${ name } output' ); process.exit( ${ code } )` ],
} )

test( 'pass, fail, pass: all three run, the table lists them, the exit code is 1', async () => {
  const results = await runSteps( [ fake( 'one', 0 ), fake( 'two', 1 ), fake( 'three', 0 ) ] )
  assert.deepEqual( results.map( ( r ) => [ r.name, r.ok ] ), [ [ 'one', true ], [ 'two', false ], [ 'three', true ] ] )
  const { text, exitCode } = formatReport( results )
  assert.equal( exitCode, 1 )
  for( const name of [ 'one', 'two', 'three' ] ) assert.match( text, new RegExp( name ) )
  assert.match( text, /two output/ )
  assert.doesNotMatch( text, /one output/ )
  assert.doesNotMatch( text, /three output/ )
} )

test( 'all passing exits 0', async () => {
  const { exitCode } = formatReport( await runSteps( [ fake( 'one', 0 ) ] ) )
  assert.equal( exitCode, 0 )
} )

test( 'a command that cannot start counts as a failed step', async () => {
  const [ result ] = await runSteps( [ { folder: 'root', name: 'missing', kind: 'test', command: 'no-such-command-atlas', args: [] } ] )
  assert.equal( result.ok, false )
} )

test( '--only keeps the named folders, --tests keeps test steps', () => {
  const steps = [ fake( 'a', 0, 'test', 'server' ), fake( 'b', 0, 'lint', 'server' ), fake( 'c', 0, 'test', 'web' ), fake( 'd', 0, 'contract', 'contract' ) ]
  assert.deepEqual( selectSteps( steps, { only: [ 'server' ] } ).map( ( s ) => s.name ), [ 'a', 'b' ] )
  assert.deepEqual( selectSteps( steps, { tests: true } ).map( ( s ) => s.name ), [ 'a', 'c' ] )
  assert.deepEqual( selectSteps( steps, { only: [ 'web' ], tests: true } ).map( ( s ) => s.name ), [ 'c' ] )
  assert.deepEqual( selectSteps( steps, { only: [ 'agent' ] } ).map( ( s ) => s.name ), [ 'd' ] )
  assert.deepEqual( selectSteps( steps, { only: [ 'shared' ] } ).map( ( s ) => s.name ), [ 'd' ] )
  assert.throws( () => selectSteps( steps, { only: [ 'nope' ] } ), /nope/ )
} )

test( 'the step list covers every package test, lint and typecheck script', () => {
  const folders = { shared: 'packages/shared', server: 'apps/server', web: 'apps/web', agent: 'apps/agent', e2e: 'e2e' }
  const skipped = { 'e2e': [ 'test', 'e2e' ], server: [ 'test:integration' ], web: [ 'build', 'dev', 'preview' ] }
  for( const [ folder, dir ] of Object.entries( folders ) ) {
    const scripts = Object.keys( JSON.parse( readFileSync( join( root, dir, 'package.json' ), 'utf8' ) ).scripts ?? {} )
    const covered = STEPS.filter( ( s ) => s.folder === folder ).map( ( s ) => s.args.at( -1 ) )
    for( const script of scripts.filter( ( s ) => /^(test|lint|typecheck)/.test( s ) && !( skipped[ folder ] ?? [] ).includes( s ) ) ) {
      assert.ok( covered.includes( script ), `${ folder } ${ script } is not in the gate` )
    }
  }
  assert.ok( STEPS.some( ( s ) => s.folder === 'root' ), 'root tests' )
  const contract = STEPS.filter( ( s ) => s.kind === 'contract' )
  assert.equal( contract.length, 1, 'one contract step (ADR 0104)' )
  assert.deepEqual( contract[ 0 ].args, [ 'scripts/contractCheck.mjs' ] )
} )

test( 'root scripts call the gate', () => {
  const { scripts } = JSON.parse( readFileSync( join( root, 'package.json' ), 'utf8' ) )
  assert.equal( scripts.gate, 'node scripts/gate.mjs' )
  assert.equal( scripts.test, 'node scripts/gate.mjs --tests' )
} )
