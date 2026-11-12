// Packages
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
// App
import { theme } from '#src/theme'
import { TimeBar } from './TimeBar'

const MODES = [ 'light', 'dark' ] as const

const colourOf = ( name: string ): string => (
  getComputedStyle( screen.getByRole( 'img', { name } ) ).backgroundColor
)

describe.each( MODES )( 'TimeBar in %s mode', ( mode ) => {
  it( 'draws measured, logged and calendar as three different colours in proportion', async () => {
    await page.viewport( 390, 844 )
    render(
      <ThemeProvider theme={ theme } defaultMode={ mode } storageManager={ null } noSsr>
        <CssBaseline />
        <TimeBar measured={ 3600 } logged={ 1800 } calendar={ 1800 } scale={ 1 } />
      </ThemeProvider>,
    )

    const colours = [ 'Measured 50%', 'Logged 25%', 'Calendar 25%' ].map( colourOf )

    expect( new Set( colours ).size ).toBe( 3 )
    colours.forEach( ( colour ) => expect( colour ).not.toBe( 'rgba(0, 0, 0, 0)' ) )

    const measured = screen.getByRole( 'img', { name: 'Measured 50%' } ).getBoundingClientRect()
    const calendar = screen.getByRole( 'img', { name: 'Calendar 25%' } ).getBoundingClientRect()

    expect( measured.width ).toBeCloseTo( calendar.width * 2, 0 )
    expect( measured.height ).toBeGreaterThan( 0 )
  } )
} )
