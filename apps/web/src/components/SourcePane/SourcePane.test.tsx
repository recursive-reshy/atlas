// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// Shared
import type { SourceDocument, Transcript } from '@atlas/shared'
// App
import { SourcePane } from './SourcePane'

const transcript: Transcript = {
  meta: {
    title: 'A talk',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration_seconds: 300,
    transcribed_at: '2026-10-15T10:00:00.000Z',
    model: 'large-v3-turbo',
  },
  segments: [
    { start: 0, end: 4, text: 'Welcome to the talk.' },
    { start: 4, end: 9, text: 'Today we cover ownership.' },
    { start: 135, end: 140, text: 'Last, borrowing.' },
  ],
}

const video: SourceDocument = { kind: 'video', ...transcript }

describe( 'SourcePane', () => {
  it( 'shows a loading status before the transcript arrives', () => {
    render(
      <SourcePane source={ null } sourceType="video" error={ null } focusSecond={ null } />,
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
        focusSecond={ null }
      />,
    )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Transcript not ready' )
    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
  } )

  it( 'shows paragraphs with a clock stamp each', () => {
    render(
      <SourcePane source={ video } sourceType="video" error={ null } focusSecond={ null } />,
    )

    const pane = screen.getByRole( 'region', { name: 'Transcript' } )

    expect( pane ).toHaveTextContent( '[00:00] Welcome to the talk. Today we cover ownership.' )
    expect( pane ).toHaveTextContent( '[02:15] Last, borrowing.' )
    expect( screen.queryByRole( 'status' ) ).not.toBeInTheDocument()
  } )

  it( 'gives each paragraph an id by its start second', () => {
    const { container } = render(
      <SourcePane source={ video } sourceType="video" error={ null } focusSecond={ null } />,
    )

    expect( container.querySelector( '#transcript-0' ) ).not.toBeNull()
    expect( container.querySelector( '#transcript-135' ) ).not.toBeNull()
  } )

  describe( 'following the summary caret', () => {
    afterEach( () => {
      vi.restoreAllMocks()
    } )

    const stubOffsets = (): void => {
      vi.spyOn( HTMLElement.prototype, 'offsetTop', 'get' ).mockImplementation( function get(
        this: HTMLElement,
      ) {
        const tops: Record< string, number > = { 'transcript-0': 0, 'transcript-135': 500 }

        return tops[ this.id ] ?? 0
      } )
    }

    it( 'marks and scrolls to the paragraph at or before the second', () => {
      stubOffsets()
      const { rerender } = render(
        <SourcePane source={ video } sourceType="video" error={ null } focusSecond={ null } />,
      )
      const pane = screen.getByRole( 'region', { name: 'Transcript' } )

      rerender(
        <SourcePane source={ video } sourceType="video" error={ null } focusSecond={ 140 } />,
      )

      expect( pane.scrollTop ).toBe( 500 )
      expect( document.getElementById( 'transcript-135' ) )
        .toHaveAttribute( 'aria-current', 'true' )
      expect( document.getElementById( 'transcript-0' ) ).not.toHaveAttribute( 'aria-current' )
    } )

    it( 'picks the earlier paragraph for a second inside it', () => {
      stubOffsets()
      render(
        <SourcePane source={ video } sourceType="video" error={ null } focusSecond={ 100 } />,
      )

      expect( document.getElementById( 'transcript-0' ) ).toHaveAttribute( 'aria-current', 'true' )
      expect( screen.getByRole( 'region', { name: 'Transcript' } ).scrollTop ).toBe( 0 )
    } )

    it( 'marks a paragraph that starts a fraction after the whole second cited', () => {
      stubOffsets()
      const fractional: Transcript = {
        ...transcript,
        segments: [
          { start: 0.4, end: 4, text: 'Welcome to the talk.' },
          { start: 135.4, end: 140, text: 'Last, borrowing.' },
        ],
      }

      render(
        <SourcePane
          source={ { kind: 'video', ...fractional } }
          sourceType="video"
          error={ null }
          focusSecond={ 135 }
        />,
      )

      expect( document.getElementById( 'transcript-135' ) )
        .toHaveAttribute( 'aria-current', 'true' )
      expect( document.getElementById( 'transcript-0' ) ).not.toHaveAttribute( 'aria-current' )
    } )

    it( 'does nothing without a second', () => {
      stubOffsets()
      render(
        <SourcePane source={ video } sourceType="video" error={ null } focusSecond={ null } />,
      )

      expect( document.querySelector( '[aria-current]' ) ).toBeNull()
    } )
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
      <SourcePane source={ article } sourceType="article" error={ null } focusSecond={ null } />,
    )

    expect( screen.getByRole( 'region', { name: 'Article' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'region', { name: 'Transcript' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows the title and a link to the source that opens in a new tab', () => {
    render(
      <SourcePane source={ article } sourceType="article" error={ null } focusSecond={ null } />,
    )

    const link = screen.getByRole( 'link', { name: 'https://example.com/habits' } )

    expect( screen.getByRole( 'heading', { name: 'A post about habits' } ) ).toBeInTheDocument()
    expect( link ).toHaveAttribute( 'href', 'https://example.com/habits' )
    expect( link ).toHaveAttribute( 'target', '_blank' )
    expect( link ).toHaveAttribute( 'rel', 'noopener noreferrer' )
  } )

  it( 'shows the Markdown as plain pre-wrapped text, not as HTML', () => {
    const { container } = render(
      <SourcePane source={ article } sourceType="article" error={ null } focusSecond={ null } />,
    )

    const text = container.querySelector( 'pre' )

    expect( text ).toHaveTextContent( '## Habits' )
    expect( text ).toHaveTextContent( 'Small *things* compound.' )
    expect( text ).toHaveStyle( { whiteSpace: 'pre-wrap' } )
    expect( container.querySelector( 'em, h2, ul' ) ).toBeNull()
  } )

  it( 'ignores the focus second', () => {
    render(
      <SourcePane source={ article } sourceType="article" error={ null } focusSecond={ 100 } />,
    )

    expect( document.querySelector( '[aria-current]' ) ).toBeNull()
  } )

  it( 'shows a loading status named for an article before the source arrives', () => {
    render(
      <SourcePane source={ null } sourceType="article" error={ null } focusSecond={ null } />,
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
        focusSecond={ null }
      />,
    )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Transcript not ready' )
  } )
} )
