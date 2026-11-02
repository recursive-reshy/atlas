// Packages
import { describe, it, expect } from 'vitest'
// Clients
import type { Summary, SummaryResult } from '../clients/claude.client.js'
// Formatters
import { formatSummary } from './summary.formatter.js'

const base: SummaryResult = {
  overview: 'First paragraph.\n\nSecond paragraph.',
  key_points: [ 'Ownership is central', 'Borrowing follows' ],
  quotes: [ 'Memory safety comes free.' ],
  tags: [],
}

const summary: Summary = { kind: 'video', ...base }

describe( 'formatSummary', () => {
  it( 'renders the three sections with no timestamps or YouTube links', () => {
    expect( formatSummary( summary ) ).toBe( [
      '## Summary',
      '',
      'First paragraph.',
      '',
      'Second paragraph.',
      '',
      '## Key points',
      '',
      '- Ownership is central',
      '- Borrowing follows',
      '',
      '## Notable quotes',
      '',
      '> "Memory safety comes free."',
      '',
    ].join( '\n' ) )
  } )

  it( 'omits empty key points and quotes sections but always writes the summary', () => {
    const body = formatSummary( { ...summary, key_points: [], quotes: [] } )

    expect( body ).toBe( '## Summary\n\nFirst paragraph.\n\nSecond paragraph.\n' )
  } )

  it( 'omits only the empty section', () => {
    const body = formatSummary( { ...summary, quotes: [] } )

    expect( body ).toContain( '## Key points' )
    expect( body ).not.toContain( '## Notable quotes' )
  } )

  it( 'keeps a multi-line point and quote on one line', () => {
    const body = formatSummary(
      { ...summary, key_points: [ 'Two\nlines' ], quotes: [ 'Also\ntwo' ] },
    )

    expect( body ).toContain( '- Two lines' )
    expect( body ).toContain( '> "Also two"' )
  } )
} )

describe( 'formatSummary for an article summary', () => {
  const summaryOf = ( overrides: Partial< SummaryResult > = {} ): Summary => ( {
    kind: 'article',
    overview: 'First paragraph.\n\nSecond paragraph.',
    key_points: [ 'Habits compound', 'Start small' ],
    quotes: [ 'Do it daily.' ],
    tags: [],
    ...overrides,
  } )

  it( 'renders the three sections with no timestamps', () => {
    expect( formatSummary( summaryOf() ) ).toBe( [
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
    expect( formatSummary( summaryOf( { key_points: [], quotes: [] } ) ) )
      .toBe( '## Summary\n\nFirst paragraph.\n\nSecond paragraph.\n' )
  } )

  it( 'keeps a multi-line point and quote on one line', () => {
    const body = formatSummary(
      summaryOf( { key_points: [ 'Two\nlines' ], quotes: [ 'Also\ntwo' ] } ),
    )

    expect( body ).toContain( '- Two lines' )
    expect( body ).toContain( '> "Also two"' )
  } )
} )
