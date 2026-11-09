// Node
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Packages
import { describe, it, expect } from 'vitest'
// Config
import { loadConfig } from './config.js'

const here = dirname( fileURLToPath( import.meta.url ) )
const read = ( path: string ): string => readFileSync( join( here, path ), 'utf8' )

// Only the e2e Compose override sets it, and it is never copied into a real .env
const TEST_ONLY = [ 'E2E_TEST_SIGNIN' ]

type Entry = { name: string, comment: boolean, section: string }

const names = ( entries: Entry[] ): string[] => entries.map( ( { name } ) => name )

const uncommented = ( entries: Entry[] ): string[] => {
  return entries.filter( ( { comment } ) => !comment ).map( ( { name } ) => name )
}

const parseEnvFile = ( text: string ): Entry[] => {
  const entries: Entry[] = []
  let section = ''
  let previous = ''

  for( const line of text.split( '\n' ) ) {
    const heading = /^# --- (.+) ---$/.exec( line )
    const variable = /^(?:# )?([A-Z][A-Z0-9_]+)=/.exec( line )

    if( heading !== null ) {
      section = heading[ 1 ] ?? ''
    } else if( variable !== null ) {
      entries.push( {
        name: variable[ 1 ] ?? '',
        comment: previous.startsWith( '# ' ) && !/^# [A-Z][A-Z0-9_]+=/.test( previous ),
        section,
      } )
    }

    previous = line
  }

  return entries
}

const schemaKeys = (): string[] => {
  const source = read( 'config.ts' )
  const start = source.indexOf( 'const EnvSchema' )
  const block = source.slice( start, source.indexOf( 'export type Config' ) )

  return [ ...block.matchAll( /^ {4}([A-Z][A-Z0-9_]+):/gm ) ].map( ( match ) => match[ 1 ] ?? '' )
}

const requiredKeys = (): string[] => {
  try {
    loadConfig( {} )
  } catch( error ) {
    const message = error instanceof Error ? error.message : ''

    return [ ...message.matchAll( /→ at ([A-Z][A-Z0-9_]+)/g ) ].map( ( match ) => match[ 1 ] ?? '' )
  }

  return []
}

describe( 'apps/server/.env.example', () => {
  const entries = parseEnvFile( read( '../.env.example' ) )
  it( 'lists every variable config.ts reads, and nothing it does not', () => {
    const expected = schemaKeys().filter( ( name ) => !TEST_ONLY.includes( name ) )

    expect( schemaKeys().length ).toBeGreaterThan( 25 )
    expect( names( entries ).sort() ).toEqual( [ ...expected ].sort() )
  } )

  it( 'has a comment line above every variable', () => {
    expect( uncommented( entries ) ).toEqual( [] )
  } )

  it( 'puts the variables config.ts requires under Required, and no others', () => {
    const required = requiredKeys()

    expect( required ).toContain( 'ANTHROPIC_API_KEY' )
    const listed = entries.filter( ( { section } ) => section === 'Required' )

    expect( listed.map( ( { name } ) => name ).sort() ).toEqual( [ ...required ].sort() )
  } )
} )

describe( 'the other .env examples', () => {
  const known = new Set( [ ...schemaKeys(), 'COMPOSE_FILE', 'VAULTS_HOST_PATH' ] )

  it( 'comment every variable of the Compose .env.example and name only known ones', () => {
    const entries = parseEnvFile( read( '../../../.env.example' ) )

    expect( uncommented( entries ) ).toEqual( [] )
    expect( names( entries ).filter( ( name ) => !known.has( name ) ) ).toEqual( [] )
  } )

  it( 'comment every variable of the VM atlas.env.example', () => {
    const entries = parseEnvFile( read( '../../../deploy/vm/atlas.env.example' ) )
    const vmOnly = [ 'ATLAS_VERSION', 'REGISTRY', 'LITESTREAM_BUCKET' ]
    const unknown = names( entries )
      .filter( ( name ) => !known.has( name ) && !vmOnly.includes( name ) )

    expect( uncommented( entries ) ).toEqual( [] )
    expect( unknown ).toEqual( [] )
  } )
} )
