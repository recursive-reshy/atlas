// Packages
import { describe, it, expect } from 'vitest'
// Filename
import { transcriptFilename } from './filename.js'

describe( 'transcriptFilename', () => {
  it( 'replaces unsafe characters and collapses whitespace', () => {
    expect( transcriptFilename( 'How Rust Works: Ownership #1', 'md' ) ).toBe(
      'How Rust Works Ownership 1.md',
    )
  } )

  it( 'replaces every unsafe character and control characters', () => {
    expect( transcriptFilename( 'a/b\\c:d*e?f"g<h>i|j#k^l[m]n\to\nz', 'txt' ) ).toBe(
      'a b c d e f g h i j k l m n o z.txt',
    )
  } )

  it.each( [ 'md', 'txt' ] as const )( 'appends the %s extension', ( format ) => {
    expect( transcriptFilename( 'Title', format ) ).toBe( `Title.${ format }` )
  } )

  it( 'keeps non-English titles', () => {
    expect( transcriptFilename( '日本語のタイトル', 'md' ) ).toBe( '日本語のタイトル.md' )
  } )

  it( 'falls back to transcript when nothing is left', () => {
    expect( transcriptFilename( '???', 'md' ) ).toBe( 'transcript.md' )
    expect( transcriptFilename( '...', 'txt' ) ).toBe( 'transcript.txt' )
  } )

  it( 'trims trailing dots', () => {
    expect( transcriptFilename( 'Title...', 'md' ) ).toBe( 'Title.md' )
    expect( transcriptFilename( 'Title. . ', 'md' ) ).toBe( 'Title.md' )
  } )

  it( 'cuts to 100 characters', () => {
    const result = transcriptFilename( 'a'.repeat( 150 ), 'md' )

    expect( result ).toBe( `${ 'a'.repeat( 100 ) }.md` )
  } )

  it( 'trims again after the cut', () => {
    const title = `${ 'a'.repeat( 99 ) } bbb`

    expect( transcriptFilename( title, 'md' ) ).toBe( `${ 'a'.repeat( 99 ) }.md` )
  } )

  it( 'does not split a surrogate pair at the cut', () => {
    const title = `${ 'a'.repeat( 99 ) }😀tail`

    expect( transcriptFilename( title, 'md' ) ).toBe( `${ 'a'.repeat( 99 ) }.md` )
  } )
} )
