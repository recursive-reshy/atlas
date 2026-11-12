// Testing Library
import { screen, waitFor } from '@testing-library/react'
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
import { AppShell } from './AppShell'
import { getGmailAccount } from '#src/features/gmail/api/gmail.api'
import { useMe } from '../useMe'
import { gmailAccountFixture } from '#src/features/gmail/fixtures/gmail.fixture'
import { meFixture } from '#src/test-support/me.fixture'
import { mockMatchMedia } from '#src/test-support/matchMedia'
import { renderWithClient } from '#src/test-support/renderWithClient'

vi.mock( '#src/features/gmail/api/gmail.api' )
vi.mock( '../useMe' )

const hamburger = (): HTMLElement => screen.getByRole( 'button', { name: /navigation$/ } )

beforeEach( () => {
  vi.mocked( useMe ).mockReturnValue( { me: meFixture(), isLoading: false, error: null } )
  vi.mocked( getGmailAccount ).mockResolvedValue( gmailAccountFixture() )
  window.localStorage.clear()
} )

describe( 'AppShell, wide', () => {
  it( 'shows the app name as the h1 and the page content', () => {
    renderWithClient( <AppShell><p>Page</p></AppShell> )

    expect( screen.getByRole( 'heading', { level: 1, name: 'Atlas' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'main' ) ).toHaveTextContent( 'Page' )
  } )

  it( 'starts with the drawer expanded and the hamburger offering to close it', () => {
    renderWithClient( <AppShell><p>Page</p></AppShell> )

    expect( hamburger() ).toHaveAccessibleName( 'Close navigation' )
    expect( hamburger() ).toHaveAttribute( 'aria-expanded', 'true' )
  } )

  it( 'points the hamburger at the drawer', () => {
    renderWithClient( <AppShell><p>Page</p></AppShell> )

    const drawerId = hamburger().getAttribute( 'aria-controls' )

    expect( drawerId ).toBeTruthy()
    expect( document.getElementById( drawerId! ) ).toContainElement(
      screen.getByRole( 'link', { name: 'Mnemosyne' } ),
    )
  } )

  it( 'collapses and expands the drawer, and remembers it', async () => {
    const user = userEvent.setup()
    renderWithClient( <AppShell><p>Page</p></AppShell> )

    await user.click( hamburger() )

    expect( hamburger() ).toHaveAccessibleName( 'Open navigation' )
    expect( hamburger() ).toHaveAttribute( 'aria-expanded', 'false' )
    expect( screen.getByRole( 'link', { name: 'Mnemosyne' } ) ).toBeInTheDocument()
    expect( window.localStorage.getItem( 'atlas:nav-drawer' ) ).toBe( 'collapsed' )

    await user.click( hamburger() )

    expect( hamburger() ).toHaveAttribute( 'aria-expanded', 'true' )
  } )

  it( 'starts collapsed when that was the stored choice', () => {
    window.localStorage.setItem( 'atlas:nav-drawer', 'collapsed' )
    renderWithClient( <AppShell><p>Page</p></AppShell> )

    expect( hamburger() ).toHaveAttribute( 'aria-expanded', 'false' )
  } )
} )

describe( 'AppShell, narrow', () => {
  beforeEach( () => {
    mockMatchMedia( { isWide: false } )
  } )

  it( 'keeps the drawer closed until the hamburger is used', async () => {
    const user = userEvent.setup()
    renderWithClient( <AppShell><p>Page</p></AppShell> )

    expect( hamburger() ).toHaveAccessibleName( 'Open navigation' )
    expect( hamburger() ).toHaveAttribute( 'aria-expanded', 'false' )
    expect( screen.queryByRole( 'link', { name: 'Mnemosyne' } ) ).not.toBeInTheDocument()

    await user.click( hamburger() )

    expect( await screen.findByRole( 'link', { name: 'Mnemosyne' } ) ).toBeVisible()
  } )

  it( 'closes the overlay when an item is chosen, and goes there', async () => {
    const user = userEvent.setup()
    const { location } = renderWithClient(
      <AppShell><p>Page</p></AppShell>,
      { route: '/transcriber/jobs/abc' },
    )

    await user.click( hamburger() )
    await user.click( await screen.findByRole( 'link', { name: 'Mnemosyne' } ) )

    expect( location().pathname ).toBe( '/transcriber' )
    await waitFor( () => {
      expect( screen.queryByRole( 'link', { name: 'Mnemosyne' } ) ).not.toBeInTheDocument()
    } )
  } )

  it( 'closes the overlay on Escape', async () => {
    const user = userEvent.setup()
    renderWithClient( <AppShell><p>Page</p></AppShell> )

    await user.click( hamburger() )
    await screen.findByRole( 'link', { name: 'Mnemosyne' } )
    await user.keyboard( '{Escape}' )

    await waitFor( () => {
      expect( screen.queryByRole( 'link', { name: 'Mnemosyne' } ) ).not.toBeInTheDocument()
    } )
  } )

  it( 'does not change the remembered wide-window choice', async () => {
    const user = userEvent.setup()
    renderWithClient( <AppShell><p>Page</p></AppShell> )

    await user.click( hamburger() )

    expect( window.localStorage.getItem( 'atlas:nav-drawer' ) ).toBeNull()
  } )
} )
