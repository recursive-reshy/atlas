// Packages
import { describe, it, expect } from 'vitest'
// Fixtures
import { transcriptFixture } from '../test-support/transcript.fixture.js'
// Formatters
import { formatTxt } from './txt.formatter.js'

describe( 'formatTxt', () => {
  it( 'renders paragraphs separated by a blank line', () => {
    expect( formatTxt( transcriptFixture ) ).toBe(
      'Welcome to the talk. Today we cover formatters. They are pure functions.\n' +
        '\n' +
        'No I/O is involved.\n' +
        '\n' +
        'Last, the Markdown output.\n',
    )
  } )

  it( 'returns an empty string for an empty transcript', () => {
    expect( formatTxt( { ...transcriptFixture, text: '' } ) ).toBe( '' )
  } )

  it( 'returns an empty string when the text is only whitespace', () => {
    expect( formatTxt( { ...transcriptFixture, text: '  \n\n ' } ) ).toBe( '' )
  } )
} )
