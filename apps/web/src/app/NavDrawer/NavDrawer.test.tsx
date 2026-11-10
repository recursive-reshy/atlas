// Testing Library
import { screen, within } from '@testing-library/react'
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
import { NavDrawer } from './NavDrawer'
import { ApiError } from '#src/lib/apiError'
import { getStatus } from '#src/features/status/api/status.api'
import { useMe } from '../useMe'
import { useSignOut } from '../useSignOut'
import { meFixture, memberFixture } from '#src/test-support/me.fixture'
import { mutationStub } from '#src/test-support/mutationStub'
import { renderWithClient } from '#src/test-support/renderWithClient'
import {
  failingRowFixture,
  statusFixture,
  statusRowFixture,
} from '#src/features/status/fixtures/status.fixture'

vi.mock( '#src/features/status/api/status.api' )
vi.mock( '../useMe' )
vi.mock( '../useSignOut' )

const mockedGetStatus = vi.mocked( getStatus )

const signOut = vi.fn()

const signedInAs = ( me = meFixture() ): void => {
  vi.mocked( useMe ).mockReturnValue( { me, isLoading: false, error: null } )
}

beforeEach( () => {
  signOut.mockReset()
  signedInAs()
  vi.mocked( useSignOut ).mockReturnValue( mutationStub( { mutate: signOut } ) )
  mockedGetStatus.mockReset()
  mockedGetStatus.mockResolvedValue( statusFixture( [ statusRowFixture() ] ) )
} )

const defaults = {
  id: 'nav',
  isNarrow: false,
  isExpanded: true,
  isOpen: false,
  onClose: vi.fn(),
}

describe( 'NavDrawer, wide', () => {
  it( 'lists Transcriber as a link to the home page', () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.getByRole( 'link', { name: 'Mnemosyne' } ) )
      .toHaveAttribute( 'href', '/transcriber' )
  } )

  it.each( [ '/transcriber', '/transcriber/jobs/3f2b8c1e' ] )(
    'marks Mnemosyne current on %s',
    ( route ) => {
      renderWithClient( <NavDrawer { ...defaults } />, { route } )

      expect( screen.getByRole( 'link', { name: 'Mnemosyne' } ) )
        .toHaveAttribute( 'aria-current', 'page' )
    },
  )

  it( 'keeps the item name when collapsed to icons', () => {
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    expect( screen.getByRole( 'link', { name: 'Mnemosyne' } ) ).toBeInTheDocument()
  } )

  it( 'shows a tooltip with the name on hover when collapsed', async () => {
    const user = userEvent.setup()
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    await user.hover( screen.getByRole( 'link', { name: 'Mnemosyne' } ) )

    expect( await screen.findByRole( 'tooltip' ) ).toHaveTextContent( 'Mnemosyne' )
  } )

  it( 'has the colour mode control, as a group when expanded', () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.getByRole( 'group', { name: 'Colour mode' } ) ).toBeInTheDocument()
  } )

  it( 'has the colour mode control, as one button when collapsed', () => {
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    expect( screen.getByRole( 'button', { name: 'Colour mode' } ) ).toBeInTheDocument()
  } )
} )

describe( 'NavDrawer, Melete item', () => {
  it( 'links to Melete, after Mnemosyne and before Settings', () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    const transcriber = screen.getByRole( 'link', { name: 'Mnemosyne' } )
    const melete = screen.getByRole( 'link', { name: 'Melete' } )
    const settings = screen.getByRole( 'link', { name: 'Settings' } )

    expect( melete ).toHaveAttribute( 'href', '/melete' )
    expect( transcriber.compareDocumentPosition( melete ) )
      .toBe( Node.DOCUMENT_POSITION_FOLLOWING )
    expect( melete.compareDocumentPosition( settings ) )
      .toBe( Node.DOCUMENT_POSITION_FOLLOWING )
  } )

  it.each( [ '/melete', '/melete/subjects/3f2b8c1e', '/melete/notes/3f2b8c1e', '/melete/review' ] )(
    'is current on %s, and Transcriber is not',
    ( route ) => {
      renderWithClient( <NavDrawer { ...defaults } />, { route } )

      expect( screen.getByRole( 'link', { name: 'Melete' } ) )
        .toHaveAttribute( 'aria-current', 'page' )
      expect( screen.getByRole( 'link', { name: 'Mnemosyne' } ) )
        .not.toHaveAttribute( 'aria-current' )
    },
  )

  it.each( [ '/', '/transcriber', '/transcriber/jobs/3f2b8c1e', '/settings' ] )(
    'is not current on %s',
    ( route ) => {
      renderWithClient( <NavDrawer { ...defaults } />, { route } )

      expect( screen.getByRole( 'link', { name: 'Melete' } ) ).not.toHaveAttribute( 'aria-current' )
    },
  )

  it( 'shows a tooltip with the name on hover when collapsed', async () => {
    const user = userEvent.setup()
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    await user.hover( screen.getByRole( 'link', { name: 'Melete' } ) )

    expect( await screen.findByRole( 'tooltip' ) ).toHaveTextContent( 'Melete' )
  } )
} )

describe( 'NavDrawer, Themis item', () => {
  const withThemis = (): void => {
    signedInAs( meFixture( { modules: [ 'transcriber', 'melete', 'themis' ] } ) )
  }

  it( 'follows Home, comes before Mnemosyne and Melete, and links to /themis', () => {
    withThemis()
    renderWithClient( <NavDrawer { ...defaults } /> )

    const themis = screen.getByRole( 'link', { name: 'Themis' } )
    const transcriber = screen.getByRole( 'link', { name: 'Mnemosyne' } )
    const melete = screen.getByRole( 'link', { name: 'Melete' } )

    expect( themis ).toHaveAttribute( 'href', '/themis' )
    expect( themis.compareDocumentPosition( transcriber ) )
      .toBe( Node.DOCUMENT_POSITION_FOLLOWING )
    expect( transcriber.compareDocumentPosition( melete ) )
      .toBe( Node.DOCUMENT_POSITION_FOLLOWING )
  } )

  it.each( [ '/themis', '/themis/goals/3f2b8c1e' ] )(
    'is current on %s, and the others are not',
    ( route ) => {
      withThemis()
      renderWithClient( <NavDrawer { ...defaults } />, { route } )

      expect( screen.getByRole( 'link', { name: 'Themis' } ) )
        .toHaveAttribute( 'aria-current', 'page' )
      expect( screen.getByRole( 'link', { name: 'Mnemosyne' } ) )
        .not.toHaveAttribute( 'aria-current' )
    },
  )

  it( 'is not current elsewhere', () => {
    withThemis()
    renderWithClient( <NavDrawer { ...defaults } />, { route: '/melete' } )

    expect( screen.getByRole( 'link', { name: 'Themis' } ) ).not.toHaveAttribute( 'aria-current' )
  } )

  it( 'is hidden from a user without the module', () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.queryByRole( 'link', { name: 'Themis' } ) ).not.toBeInTheDocument()
  } )

  it( 'shows a tooltip with the name on hover when collapsed', async () => {
    const user = userEvent.setup()

    withThemis()
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    await user.hover( screen.getByRole( 'link', { name: 'Themis' } ) )

    expect( await screen.findByRole( 'tooltip' ) ).toHaveTextContent( 'Themis' )
  } )
} )

describe( 'NavDrawer, Settings item', () => {
  it( 'links to the settings page', () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.getByRole( 'link', { name: 'Settings' } ) )
      .toHaveAttribute( 'href', '/settings' )
  } )

  it( 'sits above the colour mode control, after the module items', () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    const transcriber = screen.getByRole( 'link', { name: 'Mnemosyne' } )
    const settings = screen.getByRole( 'link', { name: 'Settings' } )
    const colourMode = screen.getByRole( 'group', { name: 'Colour mode' } )

    expect( transcriber.compareDocumentPosition( settings ) )
      .toBe( Node.DOCUMENT_POSITION_FOLLOWING )
    expect( settings.compareDocumentPosition( colourMode ) )
      .toBe( Node.DOCUMENT_POSITION_FOLLOWING )
  } )

  it( 'is current on /settings, and Transcriber is not', () => {
    renderWithClient( <NavDrawer { ...defaults } />, { route: '/settings' } )

    expect( screen.getByRole( 'link', { name: 'Settings' } ) )
      .toHaveAttribute( 'aria-current', 'page' )
    expect( screen.getByRole( 'link', { name: 'Mnemosyne' } ) )
      .not.toHaveAttribute( 'aria-current' )
  } )

  it.each( [ '/settings/prompts', '/settings/models', '/settings/sources' ] )(
    'is current on %s',
    ( route ) => {
      renderWithClient( <NavDrawer { ...defaults } />, { route } )

      expect( screen.getByRole( 'link', { name: 'Settings' } ) )
        .toHaveAttribute( 'aria-current', 'page' )
    },
  )

  it( 'is not current elsewhere', () => {
    renderWithClient( <NavDrawer { ...defaults } />, { route: '/' } )

    expect( screen.getByRole( 'link', { name: 'Settings' } ) )
      .not.toHaveAttribute( 'aria-current' )
  } )

  it( 'keeps its name when collapsed, with a tooltip on hover', async () => {
    const user = userEvent.setup()
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    await user.hover( screen.getByRole( 'link', { name: 'Settings' } ) )

    expect( await screen.findByRole( 'tooltip' ) ).toHaveTextContent( 'Settings' )
  } )

  it( 'asks a narrow drawer to close when chosen, and navigates', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const { location } = renderWithClient(
      <NavDrawer { ...defaults } isNarrow isOpen onClose={ onClose } />,
    )

    await user.click( screen.getByRole( 'link', { name: 'Settings' } ) )

    expect( onClose ).toHaveBeenCalledTimes( 1 )
    expect( location().pathname ).toBe( '/settings' )
  } )
} )

describe( 'NavDrawer, narrow', () => {
  it( 'shows nothing while closed', () => {
    renderWithClient( <NavDrawer { ...defaults } isNarrow /> )

    expect( screen.queryByRole( 'link', { name: 'Mnemosyne' } ) ).not.toBeInTheDocument()
  } )

  it( 'lists the items with labels when open, even if the wide drawer is collapsed', () => {
    renderWithClient( <NavDrawer { ...defaults } isNarrow isOpen isExpanded={ false } /> )

    expect( screen.getByRole( 'link', { name: 'Mnemosyne' } ) ).toBeVisible()
    expect( screen.getByRole( 'group', { name: 'Colour mode' } ) ).toBeInTheDocument()
  } )

  it( 'asks to close when an item is chosen', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithClient( <NavDrawer { ...defaults } isNarrow isOpen onClose={ onClose } /> )

    await user.click( screen.getByRole( 'link', { name: 'Mnemosyne' } ) )

    expect( onClose ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'asks to close on Escape', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithClient( <NavDrawer { ...defaults } isNarrow isOpen onClose={ onClose } /> )

    await user.keyboard( '{Escape}' )

    expect( onClose ).toHaveBeenCalled()
  } )
} )

describe( 'NavDrawer, failing badge on Settings', () => {
  const failing = ( count: number ) => {
    return statusFixture( Array.from( { length: count }, ( _, index ) => {
      return failingRowFixture( { kind: 'feed', id: `f${ index }`, name: `Feed ${ index }` } )
    } ) )
  }

  const badgeOf = ( link: HTMLElement ): Element | null => {
    return link.querySelector( '.MuiBadge-badge:not(.MuiBadge-invisible)' )
  }

  it( 'shows the number of failing things and says it in the name', async () => {
    mockedGetStatus.mockResolvedValue( failing( 3 ) )
    renderWithClient( <NavDrawer { ...defaults } /> )

    const link = await screen.findByRole( 'link', { name: 'Settings, 3 failing' } )

    expect( link ).toHaveAttribute( 'href', '/settings' )
    expect( badgeOf( link ) ).toHaveTextContent( '3' )
    expect( link ).toHaveTextContent( 'Settings' )
  } )

  it( 'counts one failing thing too', async () => {
    mockedGetStatus.mockResolvedValue( failing( 1 ) )
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( await screen.findByRole( 'link', { name: 'Settings, 1 failing' } ) )
      .toBeInTheDocument()
  } )

  it( 'counts the Gmail connection when it needs a reconnect', async () => {
    mockedGetStatus.mockResolvedValue( statusFixture( [
      failingRowFixture( { kind: 'gmail_connection', name: 'Gmail connection' } ),
      statusRowFixture(),
    ] ) )
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( await screen.findByRole( 'link', { name: 'Settings, 1 failing' } ) )
      .toBeInTheDocument()
  } )

  it( 'still shows the number and the name when collapsed to icons', async () => {
    const user = userEvent.setup()

    mockedGetStatus.mockResolvedValue( failing( 2 ) )
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    const link = await screen.findByRole( 'link', { name: 'Settings, 2 failing' } )

    await user.hover( link )

    expect( badgeOf( link ) ).toHaveTextContent( '2' )
    expect( await screen.findByRole( 'tooltip' ) ).toHaveTextContent( 'Settings, 2 failing' )
  } )

  it( 'shows it in the narrow drawer too', async () => {
    mockedGetStatus.mockResolvedValue( failing( 2 ) )
    renderWithClient( <NavDrawer { ...defaults } isNarrow isOpen /> )

    expect( await screen.findByRole( 'link', { name: 'Settings, 2 failing' } ) ).toBeVisible()
  } )

  it( 'shows no badge and keeps the plain name when nothing is failing', async () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    await vi.waitFor( () => expect( mockedGetStatus ).toHaveBeenCalled() )

    const link = screen.getByRole( 'link', { name: 'Settings' } )

    expect( badgeOf( link ) ).toBeNull()
    expect( screen.queryByRole( 'link', { name: /failing/ } ) ).not.toBeInTheDocument()
  } )

  it( 'shows no badge while loading or when the status can not be read', async () => {
    mockedGetStatus.mockRejectedValue( new ApiError( 'Could not reach the server', null ) )
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.queryByRole( 'link', { name: /failing/ } ) ).not.toBeInTheDocument()
    await vi.waitFor( () => expect( mockedGetStatus ).toHaveBeenCalled() )
    expect( screen.queryByRole( 'link', { name: /failing/ } ) ).not.toBeInTheDocument()
    expect( badgeOf( screen.getByRole( 'link', { name: 'Settings' } ) ) ).toBeNull()
  } )
} )

describe( 'NavDrawer, by module', () => {
  it( 'lists both modules for the admin', () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.getByRole( 'link', { name: 'Mnemosyne' } ) ).toBeInTheDocument()
    expect( screen.getByRole( 'link', { name: 'Melete' } ) ).toBeInTheDocument()
  } )

  it( 'lists only Transcriber for a Transcriber-only member', () => {
    signedInAs( memberFixture( { modules: [ 'transcriber' ] } ) )
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.getByRole( 'link', { name: 'Mnemosyne' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'link', { name: 'Melete' } ) ).not.toBeInTheDocument()
  } )

  it( 'lists only Melete for a Melete-only member', () => {
    signedInAs( memberFixture( { modules: [ 'melete' ] } ) )
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.getByRole( 'link', { name: 'Melete' } ) ).toBeInTheDocument()
    expect( screen.queryByRole( 'link', { name: 'Mnemosyne' } ) ).not.toBeInTheDocument()
  } )

  it( 'keeps Settings for every member', () => {
    signedInAs( memberFixture( { modules: [ 'melete' ] } ) )
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.getByRole( 'link', { name: /^Settings/ } ) ).toBeInTheDocument()
  } )
} )

describe( 'NavDrawer, sign out', () => {
  it( 'has a Sign out button that signs out', async () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    await userEvent.click( screen.getByRole( 'button', { name: 'Sign out' } ) )

    expect( signOut ).toHaveBeenCalledTimes( 1 )
  } )

  it( 'keeps Sign out as a named button when collapsed, with a tooltip', async () => {
    renderWithClient( <NavDrawer { ...defaults } isExpanded={ false } /> )

    await userEvent.hover( screen.getByRole( 'button', { name: 'Sign out' } ) )

    expect( await screen.findByRole( 'tooltip' ) ).toHaveTextContent( 'Sign out' )
  } )

  it( 'puts Sign out after Settings', () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    const settings = screen.getByRole( 'link', { name: /^Settings/ } )
    const signOutButton = screen.getByRole( 'button', { name: 'Sign out' } )

    expect( settings.compareDocumentPosition( signOutButton ) )
      .toBe( Node.DOCUMENT_POSITION_FOLLOWING )
  } )
} )

describe( 'NavDrawer, Home item', () => {
  it( 'puts Home first, then Themis, Mnemosyne and Melete, for a user with Themis', () => {
    signedInAs( meFixture( { modules: [ 'transcriber', 'melete', 'themis' ] } ) )
    renderWithClient( <NavDrawer { ...defaults } /> )

    const names = within( screen.getByRole( 'navigation', { name: 'Main' } ) )
      .getAllByRole( 'link' ).map( ( link ) => link.textContent )

    expect( names ).toEqual( [ 'Home', 'Themis', 'Mnemosyne', 'Melete' ] )
    expect( screen.getByRole( 'link', { name: 'Home' } ) ).toHaveAttribute( 'href', '/' )
  } )

  it( 'has no Home without Themis', () => {
    renderWithClient( <NavDrawer { ...defaults } /> )

    expect( screen.queryByRole( 'link', { name: 'Home' } ) ).not.toBeInTheDocument()
  } )

  it( 'is current on / exactly', () => {
    signedInAs( meFixture( { modules: [ 'themis' ] } ) )
    renderWithClient( <NavDrawer { ...defaults } />, { route: '/' } )

    expect( screen.getByRole( 'link', { name: 'Home' } ) ).toHaveAttribute( 'aria-current', 'page' )
  } )

  it.each( [ '/themis', '/themis/calendar', '/settings' ] )( 'is not current on %s', ( route ) => {
    signedInAs( meFixture( { modules: [ 'themis' ] } ) )
    renderWithClient( <NavDrawer { ...defaults } />, { route } )

    expect( screen.getByRole( 'link', { name: 'Home' } ) ).not.toHaveAttribute( 'aria-current' )
  } )
} )
