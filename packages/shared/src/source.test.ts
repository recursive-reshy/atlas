// Packages
import { describe, it, expect } from 'vitest'
// Source
import {
  ARTICLE_LIMITS,
  ArticleMeta,
  ArticleSource,
  SourceDocument,
  SourceType,
  VideoSource,
} from './source.js'

const videoMeta = {
  title: 'A talk',
  source: 'https://www.youtube.com/watch?v=abc',
  channel: 'Some Channel',
  duration_seconds: 120,
  transcribed_at: '2026-10-14T10:00:00.000Z',
  model: 'large-v3',
}

const video = {
  kind: 'video',
  meta: videoMeta,
  text: 'Hello',
}

const articleMeta = {
  title: 'A post',
  source: 'https://example.com/post',
  author: 'Ada',
  site: 'Example',
  published: '2026-10-01',
  fetched_at: '2026-10-18T10:00:00.000Z',
  origin: 'fetched',
}

const article = { kind: 'article', meta: articleMeta, markdown: 'Some text.' }

describe( 'SourceType', () => {
  it( 'accepts video and article only', () => {
    expect( SourceType.safeParse( 'video' ).success ).toBe( true )
    expect( SourceType.safeParse( 'article' ).success ).toBe( true )
    expect( SourceType.safeParse( 'email' ).success ).toBe( false )
  } )
} )

describe( 'VideoSource', () => {
  it( 'accepts a transcript with kind video', () => {
    expect( VideoSource.safeParse( video ).success ).toBe( true )
  } )
} )

describe( 'ArticleMeta', () => {
  it( 'accepts known and unknown optional fields', () => {
    expect( ArticleMeta.safeParse( articleMeta ).success ).toBe( true )
    expect( ArticleMeta.safeParse( {
      ...articleMeta, author: null, site: null, published: null,
    } ).success ).toBe( true )
  } )

  it.each( [ 'fetched', 'pasted', 'feed', 'email' ] )( 'accepts origin %s', ( origin ) => {
    expect( ArticleMeta.safeParse( { ...articleMeta, origin } ).success ).toBe( true )
  } )

  it( 'rejects an unknown origin', () => {
    expect( ArticleMeta.safeParse( { ...articleMeta, origin: 'rss' } ).success ).toBe( false )
  } )

  it( 'rejects an empty title', () => {
    expect( ArticleMeta.safeParse( { ...articleMeta, title: '' } ).success ).toBe( false )
  } )

  it( 'rejects a source that is not a URL', () => {
    expect( ArticleMeta.safeParse( { ...articleMeta, source: 'nope' } ).success ).toBe( false )
  } )

  it( 'rejects a published date that is not YYYY-MM-DD', () => {
    expect( ArticleMeta.safeParse( { ...articleMeta, published: '1 Oct 2026' } ).success )
      .toBe( false )
    expect( ArticleMeta.safeParse( { ...articleMeta, published: '2026-10-01T00:00:00Z' } ).success )
      .toBe( false )
  } )

  it( 'rejects a fetched_at that is not an ISO datetime', () => {
    expect( ArticleMeta.safeParse( { ...articleMeta, fetched_at: 'yesterday' } ).success )
      .toBe( false )
  } )
} )

describe( 'ArticleSource', () => {
  it( 'accepts an article', () => {
    expect( ArticleSource.safeParse( article ).success ).toBe( true )
  } )

  it( 'rejects empty markdown', () => {
    expect( ArticleSource.safeParse( { ...article, markdown: '' } ).success ).toBe( false )
  } )
} )

describe( 'SourceDocument', () => {
  it( 'parses a video document', () => {
    const parsed = SourceDocument.parse( video )

    expect( parsed.kind ).toBe( 'video' )
  } )

  it( 'parses an article document', () => {
    const parsed = SourceDocument.parse( article )

    expect( parsed.kind ).toBe( 'article' )
  } )

  it( 'rejects a video with empty text', () => {
    expect( SourceDocument.safeParse( { ...video, text: '' } ).success ).toBe( false )
  } )

  it( 'rejects a video with segments and no text', () => {
    const { kind, meta } = video

    expect( SourceDocument.safeParse( { kind, meta, segments: [] } ).success ).toBe( false )
  } )

  it( 'rejects a document without kind', () => {
    expect( SourceDocument.safeParse( { meta: videoMeta, text: 'Hello' } ).success ).toBe( false )
  } )

  it( 'rejects an unknown kind', () => {
    expect( SourceDocument.safeParse( { ...article, kind: 'email' } ).success ).toBe( false )
  } )

  it( 'rejects a kind that does not match the rest of the document', () => {
    expect( SourceDocument.safeParse( { ...article, kind: 'video' } ).success ).toBe( false )
  } )
} )

describe( 'ARTICLE_LIMITS', () => {
  it( 'has the agreed limits', () => {
    expect( ARTICLE_LIMITS ).toEqual( {
      minExtractedChars: 500,
      minPastedChars: 200,
      maxChars: 300_000,
    } )
  } )
} )
