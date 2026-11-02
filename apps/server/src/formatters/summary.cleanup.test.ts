// Packages
import { describe, it, expect } from 'vitest'
// Shared
import { SourceDocument, VideoSource } from '@atlas/shared'
// Clients
import type { Summary, SummaryResult } from '../clients/claude.client.js'
// Formatters
import { cleanSummary } from './summary.cleanup.js'

const transcript: Pick< VideoSource, 'meta' | 'text' > = {
  meta: {
    title: 'A talk',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration_seconds: 100,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'large-v3-turbo',
  },
  text: 'Rust has  an ownership model that is\nunusual. Memory safety comes free.',
}

const video: SourceDocument = { kind: 'video', ...transcript }

const result = ( overrides: Partial< SummaryResult > = {} ): Summary => ( {
  kind: 'video',
  overview: 'Overview',
  key_points: [],
  quotes: [],
  tags: [],
  ...overrides,
} )

describe( 'cleanSummary quotes', () => {
  it( 'keeps a quote that appears verbatim, ignoring whitespace differences', () => {
    const quotes = [ 'ownership model that is unusual.', 'Memory safety comes free.' ]

    expect( cleanSummary( result( { quotes } ), video ).quotes ).toEqual( quotes )
  } )

  it( 'drops a quote that is not in the transcript', () => {
    const quotes = [ 'Memory safety comes for free.', 'memory safety comes free.' ]

    expect( cleanSummary( result( { quotes } ), video ).quotes ).toEqual( [] )
  } )

  it( 'drops an empty quote', () => {
    expect( cleanSummary( result( { quotes: [ '   ' ] } ), video ).quotes ).toEqual( [] )
  } )

  it( 'keeps every key point as it is, with no range to check', () => {
    const points = [ 'First point', 'A point not quoted from the text' ]

    expect( cleanSummary( result( { key_points: points } ), video ).key_points ).toEqual( points )
  } )
} )

describe( 'cleanSummary tags', () => {
  const tags = ( input: string[] ): string[] => {
    return cleanSummary( result( { tags: input } ), video ).tags
  }

  it( 'lowercases and hyphenates spaces', () => {
    expect( tags( [ 'Machine Learning' ] ) ).toEqual( [ 'machine-learning' ] )
  } )

  it( 'strips other invalid characters', () => {
    expect( tags( [ '#Rust!', 'c++', 'a/b' ] ) ).toEqual( [ 'rust', 'c', 'ab' ] )
  } )

  it( 'collapses repeated hyphens and trims them', () => {
    expect( tags( [ ' -Deep  Learning- ' ] ) ).toEqual( [ 'deep-learning' ] )
  } )

  it( 'dedupes in order and drops mnemosyne and empties', () => {
    expect( tags( [ 'Rust', 'rust', 'Mnemosyne', '!!!', 'Go' ] ) ).toEqual( [ 'rust', 'go' ] )
  } )

  it( 'caps at five', () => {
    expect( tags( [ 'a', 'b', 'c', 'd', 'e', 'f', 'g' ] ) ).toEqual( [ 'a', 'b', 'c', 'd', 'e' ] )
  } )
} )

describe( 'cleanSummary', () => {
  it( 'keeps the overview and does not mutate its input', () => {
    const input = result( {
      key_points: [ 'late' ],
      tags: [ 'Rust' ],
    } )
    const snapshot = structuredClone( input )

    const cleaned = cleanSummary( input, video )

    expect( cleaned.overview ).toBe( 'Overview' )
    expect( input ).toEqual( snapshot )
  } )
} )

describe( 'cleanSummary for an article', () => {
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
    markdown: [
      '## Habits',
      '',
      'Small things *compound* over time, and \u201Cboring\u201D wins; it\u2019s true.',
      '',
      'Read the [guide](https://example.com/guide) and use `fetch` or snake_case names.',
      '',
      'Spread   over\nlines.',
    ].join( '\n' ),
  }

  const summaryOf = ( overrides: Partial< SummaryResult > = {} ): Summary => ( {
    kind: 'article',
    overview: 'Overview',
    key_points: [],
    quotes: [],
    tags: [],
    ...overrides,
  } )

  const quotes = ( input: string[] ): string[] => {
    return cleanSummary( summaryOf( { quotes: input } ), article ).quotes
  }

  it( 'keeps a quote found in the Markdown after normalizing both', () => {
    expect( quotes( [
      'Small things compound over time',
      'Small things *compound* over time',
    ] ) ).toEqual( [ 'Small things compound over time', 'Small things *compound* over time' ] )
  } )

  it( 'matches curly and straight quotes and apostrophes alike', () => {
    expect( quotes( [ 'and "boring" wins; it\'s true.' ] ) )
      .toEqual( [ 'and "boring" wins; it\'s true.' ] )
  } )

  it( 'matches link text without the URL and inline code without backticks', () => {
    expect( quotes( [ 'Read the guide and use fetch or snake_case names.' ] ) )
      .toEqual( [ 'Read the guide and use fetch or snake_case names.' ] )
  } )

  it( 'ignores whitespace and line breaks', () => {
    expect( quotes( [ 'Spread over lines.' ] ) ).toEqual( [ 'Spread over lines.' ] )
  } )

  it( 'drops a quote that is not in the article and an empty one', () => {
    expect( quotes( [ 'Small things compound quickly', '   ', 'Invented sentence.' ] ) )
      .toEqual( [] )
  } )

  it( 'keeps every key point as it is', () => {
    const points = [ 'First point', 'A point not quoted from the text' ]

    expect( cleanSummary( summaryOf( { key_points: points } ), article ).key_points )
      .toEqual( points )
  } )

  it( 'cleans tags like a video summary', () => {
    const cleaned = cleanSummary(
      summaryOf( {
        tags: [ 'Machine Learning', 'rust', 'Rust', 'Mnemosyne', 'a', 'b', 'c', 'd' ],
      } ),
      article,
    )

    expect( cleaned.tags ).toEqual( [ 'machine-learning', 'rust', 'a', 'b', 'c' ] )
  } )

  it( 'keeps the kind and the overview', () => {
    expect( cleanSummary( summaryOf(), article ) )
      .toEqual( { kind: 'article', overview: 'Overview', key_points: [], quotes: [], tags: [] } )
  } )
} )
