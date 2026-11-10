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
import { page } from 'vitest/browser'
// App
import { useSignOut } from '#src/app/useSignOut'
import { useVaultChoices } from '#src/hooks/useVaultChoices'
import { createQueryClient } from '#src/queryClient'
import { mutationStub } from '#src/test-support/mutationStub'
import { theme } from '#src/theme'
import { ChooseVault } from './ChooseVault'

vi.mock( '#src/hooks/useVaultChoices' )
vi.mock( '#src/app/useSignOut' )

const MIN_TAP_HEIGHT = 44
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const
const MODES = [ 'light', 'dark' ] as const

const LONG_FOLDER = 'a-very-long-vault-folder-name-for-testing'

const renderPage = (
  mode: ( typeof MODES )[ number ],
  missingVault: string | null = null,
): void => {
  const router = createMemoryRouter(
    [ { path: '/', element: <ChooseVault missingVault={ missingVault } /> } ],
    { initialEntries: [ '/' ] },
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

beforeEach( () => {
  vi.mocked( useSignOut ).mockReturnValue( mutationStub() )
  vi.mocked( useVaultChoices ).mockReturnValue( {
    folders: [ 'naresh', LONG_FOLDER ],
    canCreate: true,
    isLoading: false,
    error: null,
    claim: mutationStub(),
    create: mutationStub(),
  } )
} )

describe.each( SIZES )( 'ChooseVault at $name size', ( { width, height } ) => {
  it.each( MODES )( 'fits the window and has tappable controls, %s', async ( mode ) => {
    await page.viewport( width, height )
    renderPage( mode )

    const { scrollWidth, clientWidth } = document.documentElement
    expect( scrollWidth ).toBeLessThanOrEqual( clientWidth )

    const controls = [
      ...screen.getAllByRole( 'radio' ),
      screen.getByRole( 'button', { name: 'Use this vault' } ),
      screen.getByRole( 'button', { name: 'Create vault' } ),
      screen.getByRole( 'textbox', { name: 'New vault name' } ),
    ]

    for( const control of controls ) {
      const box = ( control.closest( 'label' ) ?? control ).getBoundingClientRect()

      expect( box.height ).toBeGreaterThanOrEqual( MIN_TAP_HEIGHT )
      expect( box.right ).toBeLessThanOrEqual( window.innerWidth )
    }
  } )
} )

describe.each( SIZES )( 'ChooseVault with a missing vault at $name size', ( { width, height } ) => {
  it.each( MODES )( 'shows the notice without a sideways scroll, %s', async ( mode ) => {
    await page.viewport( width, height )
    renderPage( mode, LONG_FOLDER )

    const alert = screen.getByRole( 'alert' )

    expect( alert ).toHaveTextContent( `Your vault folder ${ LONG_FOLDER } is missing` )
    expect( alert.getBoundingClientRect().right ).toBeLessThanOrEqual( window.innerWidth )

    const { scrollWidth, clientWidth } = document.documentElement

    expect( scrollWidth ).toBeLessThanOrEqual( clientWidth )
  } )
} )

describe.each( SIZES )( 'ChooseVault without creating at $name size', ( { width, height } ) => {
  it.each( MODES )( 'shows the ask-the-admin line without sideways scroll, %s', async ( mode ) => {
    vi.mocked( useVaultChoices ).mockReturnValue( {
      folders: [ 'naresh', LONG_FOLDER ],
      canCreate: false,
      isLoading: false,
      error: null,
      claim: mutationStub(),
      create: mutationStub(),
    } )
    await page.viewport( width, height )
    renderPage( mode )

    const line = screen.getByText( /ask the admin to set up its sync/ )

    expect( line.getBoundingClientRect().right ).toBeLessThanOrEqual( window.innerWidth )
    expect( screen.queryByRole( 'button', { name: 'Create vault' } ) ).not.toBeInTheDocument()

    const { scrollWidth, clientWidth } = document.documentElement

    expect( scrollWidth ).toBeLessThanOrEqual( clientWidth )
  } )
} )
