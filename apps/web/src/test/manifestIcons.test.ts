// Node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// Packages
import { describe, it, expect } from 'vitest'

const ICONS = [
  [ 'icon-192.png', 192 ],
  [ 'icon-512.png', 512 ],
  [ 'icon-maskable-512.png', 512 ],
  [ 'apple-touch-icon-180.png', 180 ],
] as const

describe( 'the icon files', () => {
  it.each( ICONS )( '%s is a PNG %i pixels square', ( name, size ) => {
    const bytes = readFileSync( join( process.cwd(), 'public', 'icons', name ) )

    expect( bytes.subarray( 1, 4 ).toString( 'ascii' ) ).toBe( 'PNG' )
    expect( bytes.readUInt32BE( 16 ) ).toBe( size )
    expect( bytes.readUInt32BE( 20 ) ).toBe( size )
  } )
} )
