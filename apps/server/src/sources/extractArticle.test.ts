// Node
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
// Packages
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
} from 'vitest'
// Shared
import { ArticleSource, ARTICLE_LIMITS } from '@atlas/shared'
// Clients
import { HttpStatusError, TooLargeError } from '../clients/http.client.js'
// Sources
import { ArticleError, extractArticle, fetchArticle } from './extractArticle.js'

const fixture = ( name: string ): string => {
  const file = new URL( `../test-support/articles/${ name }.html`, import.meta.url )

  return readFileSync( file, 'utf8' )
}

const url = 'https://example.com/posts/a/'

describe( 'extractArticle', () => {
  it( 'extracts a blog post', () => {
    const article = extractArticle( fixture( 'blog' ), url )

    expect( article.meta ).toMatchObject( {
      source: url,
      author: 'Ada Lovelace',
      site: 'Example Blog',
      published: '2026-10-01',
      origin: 'fetched',
    } )
    expect( article.meta.title ).toContain( 'How Rust Ownership Works' )
    expect( article.markdown ).toContain( '## The core idea' )
    expect( article.markdown ).toContain( 'Every value has a single owner' )
    expect( article.markdown ).toContain( '-   Move a value into a function' )
    expect( article.markdown ).toContain( '```' )
  } )

  it.each( [ 'blog', 'medium', 'substack' ] )( 'leaves the page furniture out of %s', ( name ) => {
    const { markdown } = extractArticle( fixture( name ), url )

    expect( markdown ).not.toMatch(
      /Privacy policy|Sign in|Get started|Clap|Subscribe|Terms|Join the newsletter|Archive/,
    )
    expect( markdown ).not.toContain( '![' )
  } )

  it( 'extracts a Medium-style post', () => {
    const article = extractArticle( fixture( 'medium' ), 'https://medium.com/@grace/frameworks' )

    expect( article.meta ).toMatchObject( {
      author: 'Grace Hopper',
      site: 'Medium',
      published: '2026-09-12',
    } )
    expect( article.markdown ).toContain( '> The best code is the code you never had to write.' )
  } )

  it( 'extracts a Substack post', () => {
    const article = extractArticle( fixture( 'substack' ), 'https://notes.substack.com/p/habits' )

    expect( article.meta ).toMatchObject( {
      title: 'The Quiet Compounding of Small Habits',
      author: 'Alan Turing',
      site: 'Notes on Work',
      published: '2026-08-30',
    } )
    expect( article.markdown ).toContain( '## What to do on Monday' )
    expect( article.markdown ).toContain( '1.  Pick one habit.' )
  } )

  it( 'resolves relative links against the page URL', () => {
    const { markdown } = extractArticle( fixture( 'relative-links' ), url )

    expect( markdown ).toContain( '[guide](https://example.com/docs/guide)' )
    expect( markdown ).toContain( '[first note](https://example.com/posts/notes/one)' )
    expect( markdown ).toContain( '[second note](https://example.com/posts/a/two.html)' )
    expect( markdown ).toContain( '[outside page](https://other.example/page)' )
  } )

  it( 'gives null for an author and a date the page does not have', () => {
    const { meta } = extractArticle( fixture( 'relative-links' ), url )

    expect( meta.author ).toBeNull()
    expect( meta.published ).toBeNull()
  } )

  it( 'falls back to the hostname for the site, without www', () => {
    const { meta } = extractArticle( fixture( 'relative-links' ), 'https://www.example.org/a' )

    expect( meta.site ).toBe( 'example.org' )
  } )

  it( 'falls back to the hostname for a title the page does not have', () => {
    const body = fixture( 'relative-links' )
      .replace( /<title>.*<\/title>/, '' )
      .replace( '<h1>Links Everywhere</h1>', '' )

    expect( extractArticle( body, url ).meta.title ).toBe( 'example.com' )
  } )

  it( 'produces a valid ArticleSource', () => {
    expect( ArticleSource.safeParse( extractArticle( fixture( 'blog' ), url ) ).success )
      .toBe( true )
  } )

  it( 'refuses a page with almost no text', () => {
    expect( () => extractArticle( fixture( 'stub' ), url ) )
      .toThrow( new ArticleError( 'Not an article page' ) )
  } )

  it( 'refuses an empty document', () => {
    expect( () => extractArticle( '', url ) ).toThrow( 'Not an article page' )
  } )

  it( 'refuses an article over the length limit, saying how long it is', () => {
    const paragraph = `<p>${ 'word '.repeat( 200 ) }</p>`
    const html = `<html><head><title>Big</title></head><body><article><h1>Big</h1>${
      paragraph.repeat( 320 )
    }</article></body></html>`

    expect( () => extractArticle( html, url ) ).toThrow( ArticleError )
    expect( () => extractArticle( html, url ) )
      .toThrow( /^Article is too long to summarize \([\d,]+ characters, limit 300,000\)$/ )
  } )

  it( 'accepts an article just over the minimum length', () => {
    const text = 'x'.repeat( ARTICLE_LIMITS.minExtractedChars + 50 )
    const html = `<html><head><title>T</title></head><body><article><h1>T</h1><p>${ text }</p>`
      + '<p>second paragraph of the same article so readability keeps it</p>'
      + '</article></body></html>'

    expect( extractArticle( html, url ).markdown.length )
      .toBeGreaterThanOrEqual( ARTICLE_LIMITS.minExtractedChars )
  } )
} )

describe( 'fetchArticle', () => {
  let server: Server
  let respond: ( res: import( 'node:http' ).ServerResponse ) => void
  let base = ''

  beforeEach( async () => {
    respond = ( res ) => {
      res.setHeader( 'Content-Type', 'text/html; charset=utf-8' )
      res.end( fixture( 'blog' ) )
    }
    server = createServer( ( _req, res ) => respond( res ) )
    await new Promise< void >( ( resolve ) => {
      server.listen( 0, '127.0.0.1', resolve )
    } )
    base = `http://127.0.0.1:${ ( server.address() as AddressInfo ).port }/post`
  } )

  afterEach( async () => {
    server.closeAllConnections()
    await new Promise( ( resolve ) => server.close( resolve ) )
  } )

  it( 'fetches a page and extracts it, with the final URL as the source', async () => {
    const article = await fetchArticle( base )

    expect( article.meta.source ).toBe( base )
    expect( article.meta.author ).toBe( 'Ada Lovelace' )
    expect( article.markdown ).toContain( 'Every value has a single owner' )
  } )

  it( 'refuses a content type that is not HTML', async () => {
    respond = ( res ) => {
      res.setHeader( 'Content-Type', 'application/pdf' )
      res.end( '%PDF-1.4' )
    }

    await expect( fetchArticle( base ) ).rejects.toThrow( 'Not an article page' )
  } )

  it( 'accepts XHTML', async () => {
    respond = ( res ) => {
      res.setHeader( 'Content-Type', 'application/xhtml+xml' )
      res.end( fixture( 'blog' ) )
    }

    await expect( fetchArticle( base ) ).resolves.toMatchObject( { kind: 'article' } )
  } )

  it( 'passes on the paywall message for a 403', async () => {
    respond = ( res ) => {
      res.writeHead( 403 )
      res.end()
    }

    await expect( fetchArticle( base ) ).rejects.toThrow( HttpStatusError )
    await expect( fetchArticle( base ) ).rejects.toThrow( 'The page needs a login or is paywalled' )
  } )

  it( 'refuses a page over 5 MB', async () => {
    respond = ( res ) => {
      res.setHeader( 'Content-Type', 'text/html' )
      res.end( 'x'.repeat( 5 * 1024 * 1024 + 10 ) )
    }

    await expect( fetchArticle( base ) ).rejects.toThrow( TooLargeError )
  } )
} )
