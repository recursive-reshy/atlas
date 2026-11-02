// Packages
import { describe, it, expect } from 'vitest'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'
// Formatters
import { formatMarkdown } from './markdown.formatter.js'

describe( 'formatMarkdown', () => {
  it( 'renders the fixture', () => {
    expect( formatMarkdown( transcriptFixture ) ).toBe(
      [
        '---',
        'title: "Video title"',
        'source: "https://www.youtube.com/watch?v=abc123"',
        'channel: "Channel name"',
        'duration: "41:12"',
        'transcribed: 2026-10-14',
        'model: large-v3-turbo',
        'tags: [transcript, youtube]',
        '---',
        '',
        '# Video title',
        '',
        'Welcome to the talk. Today we cover formatters. They are pure functions.',
        '',
        'No I/O is involved.',
        '',
        'Last, the Markdown output.',
        '',
      ].join( '\n' ),
    )
  } )

  it( 'uses the transcript tag alone for a non-YouTube source', () => {
    const meta = { ...transcriptFixture.meta, source: 'https://vimeo.com/12345' }

    const result = formatMarkdown( { ...transcriptFixture, meta } )

    expect( result ).toContain( 'tags: [transcript]\n' )
    expect( result ).not.toContain( 'youtu.be' )
  } )

  it( 'escapes quotes, backslashes and newlines in quoted fields', () => {
    const meta = { ...transcriptFixture.meta, title: 'He said "hi" \\ bye\nnext', channel: 'a\\b' }

    const result = formatMarkdown( { ...transcriptFixture, meta } )

    expect( result ).toContain( 'title: "He said \\"hi\\" \\\\ bye next"\n' )
    expect( result ).toContain( 'channel: "a\\\\b"\n' )
    expect( result ).toContain( '\n# He said "hi" \\ bye next\n' )
  } )

  it( 'splits a long unbroken transcript into paragraphs', () => {
    const sentence = 'A sentence of moderate length here.'
    const text = Array.from( { length: 60 }, () => sentence ).join( ' ' )

    const result = formatMarkdown( { ...transcriptFixture, text } )

    expect( result.split( '\n\n' ).length ).toBeGreaterThan( 4 )
  } )

  it( 'formats a duration over an hour', () => {
    const meta = { ...transcriptFixture.meta, duration_seconds: 3723 }

    const result = formatMarkdown( { ...transcriptFixture, meta } )

    expect( result ).toContain( 'duration: "1:02:03"\n' )
  } )

  it( 'renders only the frontmatter and heading for an empty transcript', () => {
    const result = formatMarkdown( { ...transcriptFixture, text: '' } )

    expect( result ).toBe(
      [
        '---',
        'title: "Video title"',
        'source: "https://www.youtube.com/watch?v=abc123"',
        'channel: "Channel name"',
        'duration: "41:12"',
        'transcribed: 2026-10-14',
        'model: large-v3-turbo',
        'tags: [transcript, youtube]',
        '---',
        '',
        '# Video title',
        '',
      ].join( '\n' ),
    )
  } )
} )
