// Packages
import { describe, it, expect } from 'vitest'
// Shared
import { SourceDocument, TranscriptMeta } from '@atlas/shared'
// Formatters
import { formatNote } from './note.formatter.js'

const meta: TranscriptMeta = {
  title: 'Original title',
  source: 'https://www.youtube.com/watch?v=abc123',
  channel: 'Some Channel',
  duration_seconds: 6130,
  transcribed_at: '2026-10-14T23:30:00.000Z',
  model: 'large-v3-turbo',
}

const video: SourceDocument = { kind: 'video', meta, segments: [] }

const note = ( overrides: Partial< Parameters< typeof formatNote >[ 0 ] > = {} ): string => {
  return formatNote( {
    title: 'How Transformers Work',
    tags: [ 'machine-learning', 'transformers' ],
    body: '## Summary\n\nText.',
    document: video,
    created: '2026-10-15',
    ...overrides,
  } )
}

describe( 'formatNote', () => {
  it( 'renders frontmatter and the body', () => {
    expect( note() ).toBe( [
      '---',
      'title: "How Transformers Work"',
      'source: "https://www.youtube.com/watch?v=abc123"',
      'channel: "Some Channel"',
      'duration: "1:42:10"',
      'created: 2026-10-15',
      'tags: [mnemosyne, machine-learning, transformers]',
      '---',
      '',
      '## Summary',
      '',
      'Text.',
      '',
    ].join( '\n' ) )
  } )

  it( 'uses the edited title, not the video title', () => {
    expect( note( { title: 'Mine' } ) ).toContain( 'title: "Mine"' )
    expect( note( { title: 'Mine' } ) ).not.toContain( 'Original title' )
  } )

  it( 'escapes quotes and flattens newlines in the title', () => {
    expect( note( { title: 'A "big"\nidea' } ) ).toContain( 'title: "A \\"big\\" idea"' )
  } )

  it( 'keeps mnemosyne first and does not repeat it', () => {
    const result = note( { tags: [ 'Mnemosyne', 'rust', 'mnemosyne' ] } )

    expect( result ).toContain( 'tags: [mnemosyne, rust]' )
  } )

  it( 'normalizes and dedupes tags', () => {
    const result = note( { tags: [ 'Machine Learning', 'a, b', '[x]', 'rust', 'RUST', '!!!' ] } )

    expect( result ).toContain( 'tags: [mnemosyne, machine-learning, a-b, x, rust]' )
  } )

  it( 'writes only mnemosyne when there are no usable tags', () => {
    expect( note( { tags: [] } ) ).toContain( 'tags: [mnemosyne]' )
  } )

  it( 'trims the body and ends with one newline', () => {
    const result = note( { body: '\n\n  Text.  \n\n\n' } )

    expect( result.endsWith( '---\n\nText.\n' ) ).toBe( true )
  } )

  it( 'renders short durations as minutes and seconds', () => {
    const result = note( {
      document: { kind: 'video', meta: { ...meta, duration_seconds: 754 }, segments: [] },
    } )

    expect( result ).toContain( 'duration: "12:34"' )
  } )

  describe( 'for an article', () => {
    const article: SourceDocument = {
      kind: 'article',
      meta: {
        title: 'Original post',
        source: 'https://example.com/post',
        author: 'Ada',
        site: 'Example',
        published: '2026-10-01',
        fetched_at: '2026-10-18T10:00:00.000Z',
        origin: 'fetched',
      },
      markdown: 'Text',
    }

    it( 'writes author, site and published instead of channel and duration', () => {
      expect( note( { document: article } ) ).toBe( [
        '---',
        'title: "How Transformers Work"',
        'source: "https://example.com/post"',
        'author: "Ada"',
        'site: "Example"',
        'published: "2026-10-01"',
        'created: 2026-10-15',
        'tags: [mnemosyne, machine-learning, transformers]',
        '---',
        '',
        '## Summary',
        '',
        'Text.',
        '',
      ].join( '\n' ) )
    } )

    it( 'leaves out the fields the article does not have', () => {
      const bare: SourceDocument = {
        ...article,
        meta: { ...article.meta, author: null, site: null, published: null },
      }

      const result = note( { document: bare } )

      expect( result ).not.toContain( 'author' )
      expect( result ).not.toContain( 'site' )
      expect( result ).not.toContain( 'published' )
      expect( result ).not.toContain( 'channel' )
    } )
  } )
} )
