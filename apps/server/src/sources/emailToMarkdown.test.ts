// Packages
import { describe, it, expect } from 'vitest'
// Shared
import { ARTICLE_LIMITS } from '@atlas/shared'
// Sources
import { emailToMarkdown } from './emailToMarkdown.js'

const sentence = ( topic: string ): string => {
  return `The ${ topic } section explains one idea in a few plain words, `
    + 'with enough detail to count. '
}

// About `count` characters of readable paragraph text on one topic.
const paragraph = ( topic: string, count = 400 ): string => {
  return sentence( topic ).repeat( Math.ceil( count / sentence( topic ).length ) ).trim()
}

const html = ( body: string ): string => {
  return '<html><head><title>News</title><style>p { color: red }</style></head>'
    + `<body>${ body }</body></html>`
}

describe( 'emailToMarkdown: plain text', () => {
  it( 'returns the text with each line trimmed', () => {
    expect( emailToMarkdown( { html: null, text: '  First line  \r\n\t second line\r\n' } ) )
      .toBe( 'First line\nsecond line' )
  } )

  it( 'collapses runs of blank lines to one', () => {
    expect( emailToMarkdown( { html: null, text: 'a\r\n\r\n\r\n\r\n   \r\n\r\nb' } ) )
      .toBe( 'a\n\nb' )
  } )

  it( 'uses the text when the HTML is empty', () => {
    expect( emailToMarkdown( { html: '', text: 'From the text part' } ) )
      .toBe( 'From the text part' )
  } )

  it( 'cuts an unsubscribe footer in the last third', () => {
    const text = [
      paragraph( 'first' ),
      paragraph( 'second' ),
      paragraph( 'third' ),
      'To unsubscribe, go to https://example.com/unsubscribe/abc',
      '123 Main Street',
    ].join( '\n\n' )

    const result = emailToMarkdown( { html: null, text } )

    expect( result ).toContain( 'third' )
    expect( result ).not.toMatch( /unsubscribe|Main Street/ )
  } )

  it( 'falls back to the text when the HTML has nothing left after cleaning', () => {
    expect( emailToMarkdown( {
      html: html( '<img src="x.png"><div style="display:none">hidden</div>' ),
      text: 'Only in the text part',
    } ) ).toBe( 'Only in the text part' )
  } )

  it( 'returns an empty string for nothing', () => {
    expect( emailToMarkdown( { html: null, text: null } ) ).toBe( '' )
    expect( emailToMarkdown( { html: '  ', text: '\r\n  ' } ) ).toBe( '' )
  } )
} )

describe( 'emailToMarkdown: cleaning', () => {
  it( 'drops images, pictures, styles, scripts and the head', () => {
    const result = emailToMarkdown( { html: html(
      `<p>Hello there.</p><img src="https://t.example.com/pixel.gif" alt="pixel">`
      + '<picture><img src="x.png"></picture><script>track()</script><p>Bye.</p>',
    ), text: null } )

    expect( result ).toBe( 'Hello there.\n\nBye.' )
  } )

  it.each( [
    'display:none',
    'display: none !important',
    'max-height:0',
    'max-height: 0px; overflow: hidden',
    'mso-hide:all',
  ] )( 'drops an element styled %s', ( style ) => {
    const result = emailToMarkdown( { html: html(
      `<p>Visible.</p><div style="${ style }">Hidden words</div><p>Also visible.</p>`,
    ), text: null } )

    expect( result ).toContain( 'Visible.' )
    expect( result ).toContain( 'Also visible.' )
    expect( result ).not.toContain( 'Hidden words' )
  } )

  it( 'drops a first element with opacity:0 as the preheader', () => {
    const result = emailToMarkdown( { html: html(
      '<div style="opacity:0">Preheader teaser</div><p>The body.</p>',
    ), text: null } )

    expect( result ).toBe( 'The body.' )
  } )

  it( 'keeps an opacity:0 element that is not first', () => {
    const result = emailToMarkdown( { html: html(
      '<p>The body.</p><span style="opacity:0">Later</span>',
    ), text: null } )

    expect( result ).toContain( 'Later' )
  } )

  it( 'keeps links in the body', () => {
    const result = emailToMarkdown( { html: html(
      '<p>Read <a href="https://example.com/post">the post</a> today.</p>',
    ), text: null } )

    expect( result ).toBe( 'Read [the post](https://example.com/post) today.' )
  } )

  it( 'does not throw on broken HTML', () => {
    const broken = { html: '<div><p>Open <b>tags<table><tr><td>cell', text: null }

    expect( () => emailToMarkdown( broken ) ).not.toThrow()
    expect( emailToMarkdown( broken ) ).toContain( 'cell' )
  } )
} )

describe( 'emailToMarkdown: layout', () => {
  it( 'keeps a short email laid out in tables, a cell at a time', () => {
    const result = emailToMarkdown( { html: html(
      '<table><tr><td><h1>Weekly note</h1></td></tr><tr><td><p>One short paragraph.</p></td></tr>'
      + '<tr><td><table><tr><td>Nested cell</td></tr></table></td></tr></table>',
    ), text: null } )

    expect( result ).toBe( '# Weekly note\n\nOne short paragraph.\n\nNested cell' )
  } )

  it( 'keeps every section of a long newsletter built from tables', () => {
    const sections = [ 'alpha', 'bravo', 'charlie', 'delta', 'echo' ]
    const rows = sections
      .map( ( topic ) => {
        return `<tr><td><h2>${ topic } heading</h2><p>${ paragraph( topic ) }</p></td></tr>`
      } )
      .join( '' )

    const result = emailToMarkdown( { html: html( `<table>${ rows }</table>` ), text: null } )

    expect( result.length ).toBeGreaterThan( ARTICLE_LIMITS.minExtractedChars )

    for( const topic of sections ) {
      expect( result ).toContain( `${ topic } heading` )
      expect( result ).toContain( `The ${ topic } section` )
    }

    expect( result ).not.toMatch( /\|\s*---|<table|<td/ )
  } )

  it( 'collapses blank lines', () => {
    const spaced = html( '<p>a</p><br><br><br><br><p>b</p>' )
    const result = emailToMarkdown( { html: spaced, text: null } )

    expect( result ).not.toMatch( /\n{3,}/ )
  } )
} )

describe( 'emailToMarkdown: header and footer', () => {
  const body = ( ...topics: string[] ): string => {
    return topics.map( ( topic ) => `<p>${ paragraph( topic ) }</p>` ).join( '' )
  }

  it.each( [
    '<p><a href="https://t.example.com/v/1">View in browser</a></p>',
    '<p><a href="https://t.example.com/v/1">View this email in your browser</a></p>',
    '<p><a href="https://t.example.com/v/1">Read online</a></p>',
    '<p><a href="https://t.example.com/v/1">View online</a></p>',
    '<p>View in browser (https://t.example.com/v/1)</p>',
  ] )( 'drops a leading view-in-browser line: %s', ( line ) => {
    const result = emailToMarkdown( { html: html( `${ line }${ body( 'main' ) }` ), text: null } )

    expect( result ).not.toMatch( /browser|online|t\.example\.com/i )
    expect( result ).toContain( 'The main section' )
  } )

  it( 'keeps a view-online mention that is not the first line', () => {
    const result = emailToMarkdown( { html: html(
      `${ body( 'main' ) }<p>You can also <a href="https://t.example.com">read online</a> `
      + 'later.</p>',
    ), text: null } )

    expect( result ).toContain( 'read online' )
  } )

  it.each( [
    '<a href="https://x.example.com/u/1">Unsubscribe</a>',
    '<a href="https://x.example.com/u/1">Manage your preferences</a>',
    '<a href="https://x.example.com/u/1">manage subscription</a>',
    '<a href="https://x.example.com/u/1">Email preferences</a>',
    '<a href="https://x.example.com/unsubscribe/abc">click here</a>',
  ] )( 'cuts the footer from the block with %s', ( link ) => {
    const result = emailToMarkdown( { html: html(
      `${ body( 'one', 'two', 'three' ) }<p>You got this because you signed up. ${ link }</p>`
      + '<p>Company Inc, 1 Main Street</p><p>Sent with love</p>',
    ), text: null } )

    expect( result ).toContain( 'The three section' )
    expect( result ).not.toMatch( /signed up|Main Street|Sent with love|unsubscribe|preferences/i )
  } )

  it( 'cuts from the last matching block, not an earlier one', () => {
    const result = emailToMarkdown( { html: html(
      `<p>Short note on <a href="https://x.example.com/p">unsubscribe etiquette</a>.</p>`
      + `${ body( 'one', 'two', 'three', 'four', 'five' ) }`
      + '<p><a href="https://x.example.com/u/1">Unsubscribe</a></p>',
    ), text: null } )

    expect( result ).toContain( 'unsubscribe etiquette' )
    expect( result ).toContain( 'The five section' )
    expect( result ).not.toMatch( /\[Unsubscribe\]/ )
  } )

  it( 'keeps an unsubscribe link that starts before the final third', () => {
    const result = emailToMarkdown( { html: html(
      `${ body( 'one' ) }<p><a href="https://x.example.com/u/1">Unsubscribe</a></p>`
      + `${ body( 'two', 'three', 'four' ) }`,
    ), text: null } )

    expect( result ).toContain( 'Unsubscribe' )
    expect( result ).toContain( 'The four section' )
  } )

  it( 'keeps a plain mention of unsubscribing that has no link', () => {
    const result = emailToMarkdown( { html: html(
      `${ body( 'one', 'two' ) }<p>Readers often ask how to unsubscribe from a mailing list.</p>`,
    ), text: null } )

    expect( result ).toContain( 'how to unsubscribe' )
  } )
} )
