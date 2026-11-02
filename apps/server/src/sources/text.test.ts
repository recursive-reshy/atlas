// Packages
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from 'vitest'
// Shared
import { ArticleSource } from '@atlas/shared'
// Sources
import { articleFromText } from './text.js'

const NOW = '2026-10-18T12:00:00.000Z'
const url = 'https://www.example.com/blog/post'

const from = ( text: string, extra: Partial< Parameters< typeof articleFromText >[ 0 ] > = {} ) => {
  return articleFromText( { url, text, origin: 'pasted', ...extra } )
}

beforeEach( () => {
  vi.useFakeTimers()
  vi.setSystemTime( new Date( NOW ) )
} )

afterEach( () => {
  vi.useRealTimers()
} )

describe( 'articleFromText', () => {
  it( 'builds an article source from the text', () => {
    const article = from( '# A post\n\nSome text.' )

    expect( article ).toEqual( {
      kind: 'article',
      meta: {
        title: 'A post',
        source: url,
        author: null,
        site: null,
        published: null,
        fetched_at: NOW,
        origin: 'pasted',
      },
      markdown: '# A post\n\nSome text.',
    } )
    expect( ArticleSource.safeParse( article ).success ).toBe( true )
  } )

  it( 'trims the text', () => {
    expect( from( '\n\n  Some text.  \n\n' ).markdown ).toBe( 'Some text.' )
  } )

  describe( 'title', () => {
    it( 'uses the given title first, trimmed', () => {
      expect( from( '# Heading\n\nText', { title: '  Mine  ' } ).meta.title ).toBe( 'Mine' )
    } )

    it( 'uses the first Markdown heading of any level, without its markup', () => {
      expect( from( 'Intro line\n\n## A **bold** [linked](https://x.test) `title`\n\nText' ).meta.title )
        .toBe( 'A bold linked title' )
      expect( from( '###### Deep heading\n\nText' ).meta.title ).toBe( 'Deep heading' )
    } )

    it( 'ignores closing hashes and a # that is not a heading', () => {
      expect( from( '## Closed ##\n\nText' ).meta.title ).toBe( 'Closed' )
      expect( from( '#hashtag first line\n\nText' ).meta.title ).toBe( '#hashtag first line' )
    } )

    it( 'uses the first non-empty line when there is no heading', () => {
      expect( from( '\n\n  First line here\nSecond line' ).meta.title ).toBe( 'First line here' )
    } )

    it( 'cuts a long first line to 120 characters', () => {
      const title = from( `${ 'word '.repeat( 60 ) }\nnext` ).meta.title

      expect( title ).toHaveLength( 119 )
      expect( title.startsWith( 'word word' ) ).toBe( true )
    } )

    it( 'falls back to the hostname without www when the text has no usable line', () => {
      expect( from( '# \n\n   \n' ).meta.title ).toBe( 'example.com' )
    } )
  } )

  it( 'passes origin, author, site and published through', () => {
    const article = from( 'Text here', {
      origin: 'feed',
      author: 'Ada',
      site: 'A blog',
      published: '2026-10-01',
    } )

    expect( article.meta ).toMatchObject( {
      origin: 'feed',
      author: 'Ada',
      site: 'A blog',
      published: '2026-10-01',
    } )
  } )
} )
