// Packages
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
// Shared
import type { SourceDocument } from '@atlas/shared'
// App
import { theme } from '#src/theme'
import { SourcePane } from './SourcePane'

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const
const MODES = [ 'light', 'dark' ] as const

const truncated: SourceDocument = {
  kind: 'video',
  meta: {
    title: 'A very long talk',
    source: 'https://www.youtube.com/watch?v=abc',
    channel: 'Channel',
    duration_seconds: 7200,
    transcribed_at: '2026-11-06T10:00:00.000Z',
    model: 'gemini-3.8-flash',
    truncated: true,
  },
  text: `${ 'A sentence that goes on for a while. '.repeat( 20 ) }\n\nLast paragraph.`,
}

describe.each( SIZES )( 'SourcePane notice at $name size', ( { width, height } ) => {
  it.each( MODES )( 'shows inside the pane without sideways scroll, %s', async ( mode ) => {
    await page.viewport( width, height )
    render(
      <ThemeProvider theme={ theme } defaultMode={ mode } storageManager={ null } noSsr>
        <CssBaseline />
        <SourcePane source={ truncated } sourceType="video" error={ null } />
      </ThemeProvider>,
    )

    const note = screen.getByRole( 'note' )
    const pane = screen.getByRole( 'region', { name: 'Transcript' } )

    expect( note ).toBeVisible()
    expect( note.getBoundingClientRect().right ).toBeLessThanOrEqual( window.innerWidth )
    expect( pane.scrollWidth ).toBeLessThanOrEqual( pane.clientWidth )
    expect( document.documentElement.scrollWidth )
      .toBeLessThanOrEqual( document.documentElement.clientWidth )
  } )
} )
