// Packages
import { describe, it, expect } from 'vitest'
// Scripts
import { generateAgentContract } from './generateAgentContract.js'

type Defs = Record< string, Record< string, unknown > >

const generate = ( defs: Defs ): string => generateAgentContract( [ { $defs: defs } ] )

// One definition in, the line(s) of its Zod schema out
const schemaOf = ( node: Record< string, unknown > ): string => {
  const output = generate( { Thing: node } )
  const start = output.indexOf( 'export const Thing = ' ) + 'export const Thing = '.length

  return output.slice( start, output.indexOf( '\nexport type Thing' ) )
}

const object = ( properties: Record< string, unknown >, extra = {} ) => ( {
  type: 'object',
  properties,
  required: Object.keys( properties ),
  ...extra,
} )

describe( 'keywords', () => {
  it.each( [
    [ 'a string', { type: 'string' }, 'z.string()' ],
    [ 'a string with a minimum', { type: 'string', minLength: 1 }, 'z.string().min( 1 )' ],
    [
      'a string with both limits',
      { type: 'string', minLength: 1, maxLength: 300 },
      'z.string().min( 1 ).max( 300 )',
    ],
    [ 'a string with a maximum', { type: 'string', maxLength: 20 }, 'z.string().max( 20 )' ],
    [
      'a string with a pattern',
      { type: 'string', pattern: '^[a-z]{1,3}$' },
      'z.string().regex( /^[a-z]{1,3}$/ )',
    ],
    [
      'a pattern containing a slash',
      { type: 'string', pattern: '^a/b$' },
      'z.string().regex( /^a\\/b$/ )',
    ],
    [
      'a pattern with a slash inside a character class, which needs no escape',
      { type: 'string', pattern: '^[^/.](/[^/]+)*$' },
      'z.string().regex( /^[^/.](\\/[^/]+)*$/ )',
    ],
    [ 'an integer', { type: 'integer' }, 'z.number().int()' ],
    [ 'null', { type: 'null' }, 'z.null()' ],
    [ 'a constant string', { type: 'string', const: 'linked' }, 'z.literal( \'linked\' )' ],
    [
      'an enum',
      { type: 'string', enum: [ 'one', 'two' ] },
      'z.enum( [ \'one\', \'two\' ] )',
    ],
    [
      'an array',
      { type: 'array', items: { type: 'string' } },
      'z.array( z.string() )',
    ],
    [
      'an array with a maximum',
      { type: 'array', items: { type: 'string' }, maxItems: 50 },
      'z.array( z.string() ).max( 50 )',
    ],
    [
      'a nullable field',
      { anyOf: [ { type: 'string', maxLength: 5 }, { type: 'null' } ] },
      'z.string().max( 5 ).nullable()',
    ],
    [ 'a title it ignores', { type: 'string', title: 'Name' }, 'z.string()' ],
  ] )( 'writes %s', ( _name, node, expected ) => {
    expect( schemaOf( node ) ).toBe( expected )
  } )

  it( 'writes an object with every property, spaced and trailing-comma styled', () => {
    const node = object( { name: { type: 'string' }, count: { type: 'integer' } } )

    expect( schemaOf( node ) ).toBe(
      'z.object( {\n  name: z.string(),\n  count: z.number().int(),\n} )',
    )
  } )

  it( 'writes a discriminated union on the named property', () => {
    const output = generate( {
      A: object( { kind: { type: 'string', const: 'a' } } ),
      B: object( { kind: { type: 'string', const: 'b' } } ),
      Either: {
        oneOf: [ { $ref: '#/$defs/A' }, { $ref: '#/$defs/B' } ],
        discriminator: { propertyName: 'kind', mapping: { a: '#/$defs/A', b: '#/$defs/B' } },
      },
    } )

    expect( output ).toContain(
      'export const Either = z.discriminatedUnion( \'kind\', [\n  A,\n  B,\n] )',
    )
  } )

  it( 'writes a type beside every schema', () => {
    const output = generate( { Thing: { type: 'string' } } )

    expect( output ).toContain( 'export type Thing = z.infer< typeof Thing >' )
  } )
} )

describe( 'references and order', () => {
  it( 'refers to another definition by name', () => {
    const output = generate( {
      Inner: { type: 'string' },
      Outer: object( { inner: { $ref: '#/$defs/Inner' } } ),
    } )

    expect( output ).toContain( '  inner: Inner,' )
  } )

  it( 'writes a definition before the ones that use it, whatever the input order', () => {
    const output = generate( {
      A: object( { b: { $ref: '#/$defs/B' } } ),
      B: object( { c: { $ref: '#/$defs/C' } } ),
      C: { type: 'string' },
    } )

    const names = [ 'const C =', 'const B =', 'const A =' ]
    const positions = names.map( ( text ) => output.indexOf( text ) )

    expect( positions ).toEqual( [ ...positions ].sort( ( a, b ) => a - b ) )
    expect( positions.every( ( position ) => position > -1 ) ).toBe( true )
  } )

  it( 'orders independent definitions alphabetically', () => {
    const output = generate( { B: { type: 'string' }, A: { type: 'string' } } )

    expect( output.indexOf( 'const A =' ) ).toBeLessThan( output.indexOf( 'const B =' ) )
  } )

  it( 'merges the definitions of several files', () => {
    const output = generateAgentContract( [
      { $defs: { A: { type: 'string' } } },
      { $defs: { B: { type: 'string' } } },
    ] )

    expect( output ).toContain( 'export const A =' )
    expect( output ).toContain( 'export const B =' )
  } )

  it( 'refuses a definition that two files both define', () => {
    expect( () => generateAgentContract( [
      { $defs: { A: { type: 'string' } } },
      { $defs: { A: { type: 'string' } } },
    ] ) ).toThrow( /A is defined in more than one contract/ )
  } )

  it( 'refuses a reference to nothing', () => {
    expect( () => generate( { A: object( { b: { $ref: '#/$defs/Missing' } } ) } ) )
      .toThrow( /Missing.*#\/\$defs\/A/ )
  } )

  it( 'refuses a cycle', () => {
    expect( () => generate( {
      A: object( { b: { $ref: '#/$defs/B' } } ),
      B: object( { a: { $ref: '#/$defs/A' } } ),
    } ) ).toThrow( /cycle.*A.*B/ )
  } )
} )

describe( 'what it refuses', () => {
  it.each( [
    [ 'default', { type: 'string', default: 'x' }, '#/$defs/Thing' ],
    [ 'format', { type: 'string', format: 'date-time' }, '#/$defs/Thing' ],
    [ 'minimum', { type: 'integer', minimum: 0 }, '#/$defs/Thing' ],
    [ 'allOf', { allOf: [ { type: 'string' } ] }, '#/$defs/Thing' ],
    [ 'minItems', { type: 'array', items: { type: 'string' }, minItems: 1 }, '#/$defs/Thing' ],
    [
      'additionalProperties',
      object( { a: { type: 'string' } }, { additionalProperties: { type: 'string' } } ),
      '#/$defs/Thing',
    ],
    [
      'format',
      object( { a: { type: 'string', maxLength: 5, pattern: 'x', format: 'uri' } } ),
      '#/$defs/Thing/properties/a',
    ],
  ] )( 'throws on %s with its path', ( keyword, node, path ) => {
    const escaped = path.replace( /\$/g, '\\$' )

    expect( () => schemaOf( node ) ).toThrow( new RegExp( `${ keyword }.*${ escaped }` ) )
  } )

  it( 'throws on a property that is not required', () => {
    const node = { type: 'object', properties: { a: { type: 'string' } }, required: [] }

    expect( () => schemaOf( node ) ).toThrow( /a is not required.*#\/\$defs\/Thing/ )
  } )

  it( 'throws on a union that is not nullable and not discriminated', () => {
    const node = { anyOf: [ { type: 'string' }, { type: 'integer' } ] }

    expect( () => schemaOf( node ) ).toThrow( /anyOf.*#\/\$defs\/Thing/ )
  } )

  it( 'throws on an unknown type', () => {
    expect( () => schemaOf( { type: 'number' } ) ).toThrow( /type number.*#\/\$defs\/Thing/ )
  } )
} )

describe( 'the file', () => {
  it( 'starts with a header saying it is generated, and from where', () => {
    const output = generate( { Thing: { type: 'string' } } )

    expect( output.startsWith( '// Generated' ) ).toBe( true )
    expect( output ).toContain( 'pnpm --filter @atlas/shared generate:agent' )
    expect( output ).toContain( 'Do not edit by hand' )
  } )

  it( 'imports zod and ends with one newline', () => {
    const output = generate( { Thing: { type: 'string' } } )

    expect( output ).toContain( 'import { z } from \'zod\'' )
    expect( output.endsWith( '\n' ) ).toBe( true )
    expect( output.endsWith( '\n\n' ) ).toBe( false )
  } )
} )
