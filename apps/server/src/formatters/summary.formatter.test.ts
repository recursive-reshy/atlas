// Packages
import { describe, it, expect } from 'vitest'
// Clients
import { SourceDocument } from '@atlas/shared'
import type { Summary, SummaryResult } from '../clients/claude.client.js'
// Formatters
import { formatSummary } from './summary.formatter.js'

const youtube = 'https://www.youtube.com/watch?v=abc123'

const videoDocument = ( source: string ): SourceDocument => ( {
  kind: 'video',
  meta: {
    title: 'A talk',
    source,
    channel: 'Channel',
    duration_seconds: 4000,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'large-v3-turbo',
  },
  segments: [],
} )

const base: SummaryResult = {
  overview: 'First paragraph.\n\nSecond paragraph.',
  key_points: [
    { text: 'Ownership is central', seconds: 754 },
    { text: 'Borrowing follows', seconds: 3920.9 },
  ],
  quotes: [ { text: 'Memory safety comes free.', seconds: 3920 } ],
  tags: [],
}

const summary: Summary = { kind: 'video', ...base }

describe( 'formatSummary', () => {
  it( 'renders the three sections with YouTube timestamp links', () => {
    expect( formatSummary( summary, videoDocument( youtube ) ) ).toBe( [
      '## Summary',
      '',
      'First paragraph.',
      '',
      'Second paragraph.',
      '',
      '## Key points',
      '',
      '- Ownership is central ([12:34](https://youtu.be/abc123?t=754))',
      '- Borrowing follows ([1:05:20](https://youtu.be/abc123?t=3920))',
      '',
      '## Notable quotes',
      '',
      '> "Memory safety comes free." ([1:05:20](https://youtu.be/abc123?t=3920))',
      '',
    ].join( '\n' ) )
  } )

  it( 'uses plain timestamps for non-YouTube sources', () => {
    const body = formatSummary( summary, videoDocument( 'https://vimeo.com/123' ) )

    expect( body ).toContain( '- Ownership is central (12:34)' )
    expect( body ).toContain( '> "Memory safety comes free." (1:05:20)' )
    expect( body ).not.toContain( 'youtu.be' )
  } )

  it( 'omits empty key points and quotes sections but always writes the summary', () => {
    const body = formatSummary(
      { ...summary, key_points: [], quotes: [] },
      videoDocument( youtube ),
    )

    expect( body ).toBe( '## Summary\n\nFirst paragraph.\n\nSecond paragraph.\n' )
  } )

  it( 'omits only the empty section', () => {
    const body = formatSummary( { ...summary, quotes: [] }, videoDocument( youtube ) )

    expect( body ).toContain( '## Key points' )
    expect( body ).not.toContain( '## Notable quotes' )
  } )

  it( 'keeps a multi-line point on one line', () => {
    const body = formatSummary(
      { ...summary, key_points: [ { text: 'Two\nlines', seconds: 5 } ], quotes: [] },
      videoDocument( youtube ),
    )

    expect( body ).toContain( '- Two lines ([00:05](https://youtu.be/abc123?t=5))' )
  } )
} )

describe( 'formatSummary for an article', () => {
  const article: SourceDocument = {
    kind: 'article',
    meta: {
      title: 'A post',
      source: 'https://example.com/post',
      author: null,
      site: null,
      published: null,
      fetched_at: '2026-10-18T10:00:00.000Z',
      origin: 'fetched',
    },
    markdown: 'Text',
  }

  const summaryOf = ( overrides: Partial< Extract< Summary, { kind: 'article' } > > = {} ) => ( {
    kind: 'article' as const,
    overview: 'First paragraph.\n\nSecond paragraph.',
    key_points: [ 'Habits compound', 'Start small' ],
    quotes: [ 'Do it daily.' ],
    tags: [],
    ...overrides,
  } )

  it( 'renders the three sections with no timestamps', () => {
    expect( formatSummary( summaryOf(), article ) ).toBe( [
      '## Summary',
      '',
      'First paragraph.',
      '',
      'Second paragraph.',
      '',
      '## Key points',
      '',
      '- Habits compound',
      '- Start small',
      '',
      '## Notable quotes',
      '',
      '> "Do it daily."',
      '',
    ].join( '\n' ) )
  } )

  it( 'omits empty sections but always writes the summary', () => {
    expect( formatSummary( summaryOf( { key_points: [], quotes: [] } ), article ) )
      .toBe( '## Summary\n\nFirst paragraph.\n\nSecond paragraph.\n' )
  } )

  it( 'keeps a multi-line point and quote on one line', () => {
    const body = formatSummary(
      summaryOf( { key_points: [ 'Two\nlines' ], quotes: [ 'Also\ntwo' ] } ),
      article,
    )

    expect( body ).toContain( '- Two lines' )
    expect( body ).toContain( '> "Also two"' )
  } )
} )
