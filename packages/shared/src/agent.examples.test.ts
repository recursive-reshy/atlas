// Node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
// Packages
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
// Agent
import {
  InstructionsResponse,
  LinkNote,
  LinkRequest,
  LinkResponse,
  LinkSuggestion,
  AgentUsage,
} from './agent.js'

const examplesPath = fileURLToPath(
  new URL( '../../../apps/agent/schema/examples', import.meta.url ),
)

const schemas: Record< string, z.ZodType > = {
  LinkNote,
  LinkRequest,
  LinkSuggestion,
  AgentUsage,
  LinkResponse,
  InstructionsResponse,
}

const requiredValid = [
  'link-request.json',
  'link-request-empty-vault.json',
  'link-response-linked.json',
  'link-response-linked-empty.json',
  'link-response-failed.json',
  'instructions-response.json',
]

const requiredInvalid = [
  'link-request-empty-body.json',
  'link-request-no-model.json',
  'link-request-no-vault-dir.json',
  'link-request-bad-vault-dir.json',
  'link-response-unknown-kind.json',
  'link-response-failed-no-reason.json',
  'link-response-failed-with-suggestions.json',
  'link-response-linked-with-reason.json',
]

type Example = { schema: string, value: unknown }

const readExamples = ( folder: string ): [ string, Example ][] => (
  readdirSync( join( examplesPath, folder ) )
    .filter( ( name ) => name.endsWith( '.json' ) )
    .sort()
    .map( ( name ) => [
      name,
      JSON.parse( readFileSync( join( examplesPath, folder, name ), 'utf8' ) ) as Example,
    ] )
)

const schemaFor = ( name: string ): z.ZodType => {
  const schema = schemas[ name ]

  if( schema === undefined ) {
    throw new Error( `Unknown schema name '${ name }'` )
  }

  return schema
}

const valid = readExamples( 'valid' )
const invalid = readExamples( 'invalid' )

describe( 'golden examples', () => {
  it( 'includes the required files', () => {
    expect( valid.map( ( [ name ] ) => name ) ).toEqual( expect.arrayContaining( requiredValid ) )
    expect( invalid.map( ( [ name ] ) => name ) )
      .toEqual( expect.arrayContaining( requiredInvalid ) )
  } )

  it( 'fails on an unknown schema name', () => {
    expect( () => schemaFor( 'Nope' ) ).toThrow( 'Nope' )
  } )

  it.each( valid )( 'accepts valid/%s', ( _name, example ) => {
    expect( schemaFor( example.schema ).safeParse( example.value ).success ).toBe( true )
  } )

  it.each( invalid )( 'rejects invalid/%s', ( _name, example ) => {
    expect( schemaFor( example.schema ).safeParse( example.value ).success ).toBe( false )
  } )
} )
