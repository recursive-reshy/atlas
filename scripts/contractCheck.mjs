// The contract step of the gate (ADR 0104): regenerate the agent's JSON Schema and its Zod mirror,
// and fail if either changed. It compares before and after, so it also works before the commit.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join( dirname( fileURLToPath( import.meta.url ) ), '..' )

export const WATCHED = [ 'apps/agent/schema', 'packages/shared/src/agent.generated.ts' ]

const collect = ( base, path, files ) => {
  const full = join( base, path )
  if( !existsSync( full ) ) return
  if( statSync( full ).isDirectory() ) {
    for( const name of readdirSync( full ).sort() ) collect( base, join( path, name ), files )
    return
  }
  files.set( path, readFileSync( full, 'utf8' ) )
}

export const snapshot = ( base, paths ) => {
  const files = new Map()
  for( const path of paths ) collect( base, path, files )
  return files
}

export const changedFiles = ( before, after ) => (
  [ ...new Set( [ ...before.keys(), ...after.keys() ] ) ].sort()
    .filter( ( path ) => before.get( path ) !== after.get( path ) )
)

const COMMANDS = [
  { command: 'uv', args: [ 'run', 'python', '-m', 'atlas_agent.contract.export' ], cwd: 'apps/agent' },
  { command: 'pnpm', args: [ '--filter', '@atlas/shared', 'generate:agent' ], cwd: '.' },
]

const main = () => {
  const before = snapshot( root, WATCHED )
  for( const { command, args, cwd } of COMMANDS ) {
    const result = spawnSync( command, args, { cwd: join( root, cwd ), encoding: 'utf8' } )
    if( result.status !== 0 ) {
      console.error( `${ command } ${ args.join( ' ' ) } failed\n${ result.stdout }${ result.stderr }` )
      process.exit( 1 )
    }
  }
  const changed = changedFiles( before, snapshot( root, WATCHED ) )
  if( changed.length ) {
    console.error( `The contract was out of date; regenerated, now commit:\n  ${ changed.join( '\n  ' ) }` )
    process.exit( 1 )
  }
}

if( process.argv[ 1 ] === fileURLToPath( import.meta.url ) ) main()
