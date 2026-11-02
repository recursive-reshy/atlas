// Packages
import { describe, it, expect } from 'vitest'
// Shared
import { ARTICLE_LIMITS } from '@atlas/shared'
// Sources
import { emailToMarkdown } from './emailToMarkdown.js'
// Test support
import { NEWSLETTER_FIXTURES, loadGmailFixture } from '../test-support/gmailFixture.js'

const MIN_COVERAGE = 0.9
const PROBE_CHARS = 40
const MIN_PARAGRAPH_CHARS = 60

const normalize = ( text: string ): string => {
  return text.toLowerCase().replace( /[^\p{L}\p{N}]+/gu, ' ' ).trim()
}

const FOOTER_LINK = /unsubscribe|manage (your )?(preferences|subscription)|email preferences/i
const FOOTER = new RegExp(
  `${ FOOTER_LINK.source }|you (are )?receiv|view (it )?in (your )?browser`,
  'i',
)

// The paragraphs of the plain-text part that are body copy: long, no URL, after the preheader
// (the text before "View in browser", which the HTML hides) and before the footer.
const bodyParagraphs = ( text: string ): string[] => {
  const paragraphs = text
    .split( /(?:\r?\n){2,}/ )
    .map( ( block ) => block.replace( /\s+/g, ' ' ).trim() )
  const footerAt = paragraphs.findIndex( ( block, index ) => {
    return index > paragraphs.length * 0.6 && FOOTER.test( block )
  } )
  const viewAt = paragraphs.findIndex( ( block ) => /^view in browser/i.test( block ) )
  const body = ( footerAt === -1 ? paragraphs : paragraphs.slice( 0, footerAt ) )
    .slice( viewAt === -1 ? 0 : viewAt + 1 )

  return body.filter( ( block ) => {
    return block.length >= MIN_PARAGRAPH_CHARS && !/https?:|\[\d+\]/.test( block )
  } )
}

describe.each( NEWSLETTER_FIXTURES )( 'emailToMarkdown on the %s newsletter', ( name ) => {
  const { html, text, subject } = loadGmailFixture( name )
  const markdown = emailToMarkdown( { html, text } )

  it( 'is long enough to summarize', () => {
    expect( markdown.length ).toBeGreaterThan( ARTICLE_LIMITS.minPastedChars )
  } )

  it( 'keeps the body: most paragraphs of the plain-text part are in it', () => {
    const haystack = normalize( markdown )
    const probes = bodyParagraphs( text ?? '' )
      .map( ( block ) => normalize( block ).slice( 0, PROBE_CHARS ) )
    const missing = probes.filter( ( probe ) => !haystack.includes( probe ) )
    const coverage = probes.length === 0 ? 1 : 1 - missing.length / probes.length


    expect( probes.length ).toBeGreaterThan( 0 )
    expect( coverage, `${ subject }: missing ${ missing.join( ' | ' ) }` )
      .toBeGreaterThanOrEqual( MIN_COVERAGE )
  } )

  it( 'has no images and no tracking pixels', () => {
    expect( markdown ).not.toMatch( /!\[/ )
    expect( markdown ).not.toMatch( /<img/i )
  } )

  it( 'has no table syntax or HTML', () => {
    expect( markdown ).not.toMatch( /^\s*\|.*\|\s*$/m )
    expect( markdown ).not.toMatch( /\|\s*-{3,}|<\/?(table|tr|td|div|span)\b/i )
  } )

  // A subscription box in the middle of the email stays (it starts before the final third);
  // what must go is the footer at the end.
  it( 'does not end in an unsubscribe or preferences footer', () => {
    const lastBlock = markdown.split( /\n{2,}/ ).at( -1 ) ?? ''
    const tail = markdown.slice( Math.floor( markdown.length * 0.9 ) )

    expect( lastBlock ).not.toMatch( FOOTER_LINK )
    expect( tail ).not.toMatch( FOOTER_LINK )
  } )

  it( 'does not start with a view-in-browser line', () => {
    expect( markdown.split( '\n' )[ 0 ] ).not.toMatch( /browser|view online|read online/i )
  } )

  it( 'has no run of three blank lines and no surrounding blank space', () => {
    expect( markdown ).not.toMatch( /\n{3,}/ )
    expect( markdown ).toBe( markdown.trim() )
  } )
} )
