// Testing Library
import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// Vitest
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
// App
import { ColorModeControl } from './ColorModeControl'
import { renderWithClient } from '#src/test-support/renderWithClient'
import { mockMatchMedia } from '#src/test-support/matchMedia'

const colorScheme = vi.hoisted( () => ( { override: null as { mode: undefined } | null } ) )

vi.mock( '@mui/material/styles', async ( importOriginal ) => {
  const original = await importOriginal< typeof import( '@mui/material/styles' ) >()

  return {
    ...original,
    useColorScheme: () => colorScheme.override ?? original.useColorScheme(),
  }
} )

const choice = ( name: string ): HTMLElement => screen.getByRole( 'button', { name } )

beforeEach( () => {
  colorScheme.override = null
  window.localStorage.clear()
  document.documentElement.className = ''
} )

describe( 'ColorModeControl, expanded', () => {
  it( 'offers Light, Dark and System, with System selected by default', () => {
    renderWithClient( <ColorModeControl isCollapsed={ false } /> )

    const group = screen.getByRole( 'group', { name: 'Colour mode' } )

    expect( within( group ).getAllByRole( 'button' ).map( ( button ) => button.textContent ) )
      .toEqual( [ 'Light', 'Dark', 'System' ] )
    expect( choice( 'System' ) ).toHaveAttribute( 'aria-pressed', 'true' )
  } )

  it( 'changes and remembers the mode when one is chosen', async () => {
    const user = userEvent.setup()
    renderWithClient( <ColorModeControl isCollapsed={ false } /> )

    await user.click( choice( 'Dark' ) )

    expect( choice( 'Dark' ) ).toHaveAttribute( 'aria-pressed', 'true' )
    expect( choice( 'System' ) ).toHaveAttribute( 'aria-pressed', 'false' )
    expect( window.localStorage.getItem( 'mui-mode' ) ).toBe( 'dark' )
  } )

  it( 'keeps the chosen mode when the user clicks it again', async () => {
    const user = userEvent.setup()
    renderWithClient( <ColorModeControl isCollapsed={ false } /> )

    await user.click( choice( 'Dark' ) )
    await user.click( choice( 'Dark' ) )

    expect( choice( 'Dark' ) ).toHaveAttribute( 'aria-pressed', 'true' )
  } )

  it( 'follows the OS while System is chosen', () => {
    const os = mockMatchMedia( { isDark: false } )
    renderWithClient( <ColorModeControl isCollapsed={ false } /> )

    expect( document.documentElement ).toHaveClass( 'light' )

    act( () => os.setDark( true ) )

    expect( document.documentElement ).toHaveClass( 'dark' )
  } )

  it( 'is disabled until the mode resolves', () => {
    colorScheme.override = { mode: undefined }
    renderWithClient( <ColorModeControl isCollapsed={ false } /> )

    for( const button of screen.getAllByRole( 'button' ) ) {
      expect( button ).toBeDisabled()
    }
  } )
} )

describe( 'ColorModeControl, collapsed', () => {
  it( 'is one icon button that opens a menu with the same three choices', async () => {
    const user = userEvent.setup()
    renderWithClient( <ColorModeControl isCollapsed /> )

    expect( screen.queryByRole( 'group' ) ).not.toBeInTheDocument()

    await user.click( screen.getByRole( 'button', { name: 'Colour mode' } ) )

    const items = screen.getAllByRole( 'menuitemradio' )

    expect( items.map( ( item ) => item.textContent ) ).toEqual( [ 'Light', 'Dark', 'System' ] )
    expect( screen.getByRole( 'menuitemradio', { name: 'System' } ) )
      .toHaveAttribute( 'aria-checked', 'true' )
  } )

  it( 'changes the mode and closes the menu when a choice is picked', async () => {
    const user = userEvent.setup()
    renderWithClient( <ColorModeControl isCollapsed /> )

    await user.click( screen.getByRole( 'button', { name: 'Colour mode' } ) )
    await user.click( screen.getByRole( 'menuitemradio', { name: 'Light' } ) )

    expect( window.localStorage.getItem( 'mui-mode' ) ).toBe( 'light' )
    expect( screen.queryByRole( 'menu' ) ).not.toBeInTheDocument()
  } )

  it( 'is disabled until the mode resolves', () => {
    colorScheme.override = { mode: undefined }
    renderWithClient( <ColorModeControl isCollapsed /> )

    expect( screen.getByRole( 'button', { name: 'Colour mode' } ) ).toBeDisabled()
  } )
} )
