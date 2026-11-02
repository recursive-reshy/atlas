// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
// Shared
import type { SourceDocument } from '@atlas/shared'
// App
import { SourcePane } from './SourcePane'

const video: SourceDocument = {
  kind: 'video',
  meta: {
    title: 'A talk',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration_seconds: 300,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'gpt-transcribe',
  },
  text: 'Welcome to the talk. Today we cover ownership.\n\nLast, borrowing.',
}

describe( 'SourcePane', () => {
  it( 'shows a loading status before the transcript arrives', () => {
    render(
      <SourcePane source={ null } sourceType="video" error={ null } />,
    )

    expect( screen.getByRole( 'region', { name: 'Transcript' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading transcript…' )
  } )

  it( 'shows the error', () => {
    render(
      <SourcePane
        source={ null }
        sourceType="video"
        error="Transcript not ready"
      />,
    )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Transcript not ready' )
    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
  } )

  it( 'shows each paragraph of the text without a stamp', () => {
    render(
      <SourcePane source={ video } sourceType="video" error={ null } />,
    )

    const pane = screen.getByRole( 'region', { name: 'Transcript' } )

    expect( screen.getByText( 'Welcome to the talk. Today we cover ownership.' ) ).toBeVisible()
    expect( screen.getByText( 'Last, borrowing.' ) ).toBeVisible()
    expect( pane ).not.toHaveTextContent( /\[\d\d:\d\d\]/ )
    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
  } )

  it( 'splits a long unbroken text into several paragraphs', () => {
    const sentence = 'A sentence of moderate length here.'
    const text = Array.from( { length: 60 }, () => sentence ).join( ' ' )
    const { container } = render(
      <SourcePane
        source={ { ...video, text } }
        sourceType="video"
        error={ null }
      />,
    )

    expect( container.querySelectorAll( 'p' ).length ).toBeGreaterThan( 2 )
  } )
} )

describe( 'SourcePane for an article', () => {
  const article: SourceDocument = {
    kind: 'article',
    meta: {
      title: 'A post about habits',
      source: 'https://example.com/habits',
      author: 'Ada',
      site: 'Example',
      published: '2026-10-01',
      fetched_at: '2026-10-18T10:00:00.000Z',
      origin: 'fetched',
    },
    markdown: '## Habits\n\nSmall *things* compound.\n\n- one\n- two',
  }

  it( 'is a region named Article', () => {
    render(
      <SourcePane source={ article } sourceType="article" error={ null } />,
    )

    expect( screen.getByRole( 'region', { name: 'Article' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'region', { name: 'Transcript' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows the title and a link to the source that opens in a new tab', () => {
    render(
      <SourcePane source={ article } sourceType="article" error={ null } />,
    )

    const link = screen.getByRole( 'link', { name: 'https://example.com/habits' } )

    expect( screen.getByRole( 'heading', { name: 'A post about habits' } ) ).toBeInTheDocument()
    expect( link ).toHaveAttribute( 'href', 'https://example.com/habits' )
    expect( link ).toHaveAttribute( 'target', '_blank' )
    expect( link ).toHaveAttribute( 'rel', 'noopener noreferrer' )
  } )

  it( 'shows the Markdown as plain pre-wrapped text, not as HTML', () => {
    const { container } = render(
      <SourcePane source={ article } sourceType="article" error={ null } />,
    )

    const text = container.querySelector( 'pre' )

    expect( text ).toHaveTextContent( '## Habits' )
    expect( text ).toHaveTextContent( 'Small *things* compound.' )
    expect( text ).toHaveStyle( { whiteSpace: 'pre-wrap' } )
    expect( container.querySelector( 'em, h2, ul' ) ).toBeNull()
  } )

  it( 'shows a loading status named for an article before the source arrives', () => {
    render(
      <SourcePane source={ null } sourceType="article" error={ null } />,
    )

    expect( screen.getByRole( 'region', { name: 'Article' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading article…' )
  } )

  it( 'shows the error', () => {
    render(
      <SourcePane
        source={ null }
        sourceType="article"
        error="Transcript not ready"
      />,
    )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Transcript not ready' )
  } )
} )
