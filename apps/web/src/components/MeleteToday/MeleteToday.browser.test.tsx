// Packages
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
// Testing Library
import { render, screen } from '@testing-library/react'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { page, userEvent } from 'vitest/browser'
// App
import { useMeleteToday } from '#src/hooks/useMeleteToday'
import { createQueryClient } from '#src/queryClient'
import { meleteTodayFixture } from '#src/test-support/melete.fixture'
import { theme } from '#src/theme'
import { MeleteToday } from './MeleteToday'

vi.mock( '#src/hooks/useMeleteToday' )

const MIN_TAP_HEIGHT = 44
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const
const MODES = [ 'light', 'dark' ] as const

// One path with no break opportunity, longer than a phone is wide
const LONG_PATH = `Learning/${ 'Supercalifragilisticexpialidocious'.repeat( 4 ) }/Notes.md`
const PATHS = [ LONG_PATH, ...[ 'A', 'B', 'C', 'D', 'E' ].map( ( name ) => `Learning/${ name }` ) ]

const renderToday = ( mode: ( typeof MODES )[ number ] ): void => {
  const router = createMemoryRouter(
    [ { path: '/melete', element: <MeleteToday /> } ],
    { initialEntries: [ '/melete' ] },
  )

  render(
    <ThemeProvider theme={ theme } defaultMode={ mode } storageManager={ null } noSsr>
      <CssBaseline />
      <QueryClientProvider client={ createQueryClient() }>
        <RouterProvider router={ router } />
      </QueryClientProvider>
    </ThemeProvider>,
  )
}

const scrollbarFree = (): boolean => {
  const { scrollWidth, clientWidth } = document.documentElement

  return scrollWidth <= clientWidth
}

beforeEach( () => {
  vi.mocked( useMeleteToday ).mockReturnValue( {
    today: meleteTodayFixture( { skipped_paths: PATHS } ),
    isLoading: false,
    error: null,
  } )
  window.scrollTo( 0, 0 )
} )

describe.each( SIZES )( 'MeleteToday notice at $name size', ( { width, height } ) => {
  it.each( MODES )( 'fits the window with a long path, %s', async ( mode ) => {
    await page.viewport( width, height )
    renderToday( mode )

    const alert = screen.getByRole( 'alert' )

    expect( alert ).toHaveTextContent( 'Melete couldn\'t read 6 folders or notes' )
    expect( scrollbarFree() ).toBe( true )

    await userEvent.click( screen.getByRole( 'button', { name: 'Show' } ) )
    await expect.poll( () => screen.queryAllByRole( 'listitem' ).length ).toBe( 6 )

    const box = screen.getByText( LONG_PATH ).getBoundingClientRect()

    expect( scrollbarFree() ).toBe( true )
    expect( box.right ).toBeLessThanOrEqual( window.innerWidth )
    expect( screen.getByRole( 'button', { name: 'Hide' } ).getBoundingClientRect().height )
      .toBeGreaterThanOrEqual( MIN_TAP_HEIGHT )
  } )
} )
