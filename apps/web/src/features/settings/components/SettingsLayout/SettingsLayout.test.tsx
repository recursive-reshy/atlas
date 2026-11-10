// Testing Library
import { screen } from '@testing-library/react'
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
import { getGmailAccount } from '#src/features/gmail/api/gmail.api'
import { useSettings } from '#src/features/settings/hooks/useSettings'
import { gmailAccountFixture } from '#src/features/gmail/fixtures/gmail.fixture'
import { settingsState } from '#src/test-support/hookStates'
import { memberFixture } from '#src/test-support/me.fixture'
import { renderWithRouter } from '#src/test-support/renderWithRouter'

vi.mock( '#src/features/gmail/api/gmail.api' )
vi.mock( '#src/features/settings/hooks/useSettings' )
vi.mock( '../PromptsTab', () => ( { PromptsTab: () => <p>prompts content</p> } ) )
vi.mock( '../ModelsTab', () => ( { ModelsTab: () => <p>models content</p> } ) )
vi.mock( '../SourcesTab', () => ( { SourcesTab: () => <p>sources content</p> } ) )
vi.mock( '#src/features/admin/components/AdminTab', () => (
  { AdminTab: () => <p>admin content</p> }
) )

beforeEach( () => {
  vi.mocked( getGmailAccount ).mockResolvedValue( gmailAccountFixture() )
  vi.mocked( useSettings ).mockReturnValue( settingsState() )
} )

describe( 'SettingsLayout tabs', () => {
  it( 'has the heading and the admin\'s four tabs', () => {
    renderWithRouter( '/settings/prompts' )

    expect( screen.getByRole( 'heading', { level: 2, name: 'Settings' } ) ).toBeInTheDocument()
    expect( screen.getAllByRole( 'tab' ).map( ( tab ) => tab.textContent ) )
      .toEqual( [ 'Prompts', 'Models', 'Sources', 'Admin' ] )
  } )

  it.each( [
    [ 'prompts', 'Prompts', 'prompts content' ],
    [ 'models', 'Models', 'models content' ],
    [ 'sources', 'Sources', 'sources content' ],
    [ 'admin', 'Admin', 'admin content' ],
  ] )( 'selects the %s tab and shows its content', ( path, name, content ) => {
    renderWithRouter( `/settings/${ path }` )

    expect( screen.getByRole( 'tab', { name } ) ).toHaveAttribute( 'aria-selected', 'true' )
    expect( screen.getAllByRole( 'tab', { selected: true } ) ).toHaveLength( 1 )
    expect( screen.getByText( content ) ).toBeInTheDocument()
  } )

  it( 'keeps the Prompts tab selected while a prompt is open', () => {
    renderWithRouter( '/settings/prompts/abc' )

    expect( screen.getByRole( 'tab', { name: 'Prompts' } ) )
      .toHaveAttribute( 'aria-selected', 'true' )
    expect( screen.getByText( 'prompts content' ) ).toBeInTheDocument()
  } )

  it( 'switches tab with a click and puts the tab in the address', async () => {
    const { location } = renderWithRouter( '/settings/prompts' )

    await userEvent.setup().click( screen.getByRole( 'tab', { name: 'Models' } ) )

    expect( location().pathname ).toBe( '/settings/models' )
    expect( screen.getByText( 'models content' ) ).toBeInTheDocument()
    expect( screen.getByRole( 'tab', { name: 'Models' } ) )
      .toHaveAttribute( 'aria-selected', 'true' )
  } )

  it( 'moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup()
    renderWithRouter( '/settings/prompts' )

    await user.tab()
    while( !screen.getByRole( 'tab', { name: 'Prompts' } ).matches( ':focus' ) ) {
      await user.tab()
    }
    await user.keyboard( '{ArrowRight}' )

    expect( screen.getByRole( 'tab', { name: 'Models' } ) ).toHaveFocus()
  } )
} )

describe( 'SettingsLayout redirects', () => {
  it( 'sends /settings to the Prompts tab', () => {
    const { location } = renderWithRouter( '/settings' )

    expect( location().pathname ).toBe( '/settings/prompts' )
    expect( screen.getByText( 'prompts content' ) ).toBeInTheDocument()
  } )

  it( 'sends an unknown tab to the Prompts tab', () => {
    const { location } = renderWithRouter( '/settings/nowhere' )

    expect( location().pathname ).toBe( '/settings/prompts' )
  } )

  it( 'sends the Gmail return from Google to the Sources tab, keeping its query', () => {
    const { location } = renderWithRouter( '/settings?gmail=connected' )

    expect( location().pathname ).toBe( '/settings/sources' )
    expect( location().search ).toBe( '?gmail=connected' )
  } )
} )

describe( 'SettingsLayout loading', () => {
  it( 'announces loading and holds back the tab content', () => {
    vi.mocked( useSettings ).mockReturnValue(
      settingsState( { settings: null, lockedInstructions: null, isLoading: true } ),
    )
    renderWithRouter( '/settings/models' )

    expect( screen.getByRole( 'status' ) ).toHaveTextContent( 'Loading settings…' )
    expect( screen.queryByText( 'models content' ) ).not.toBeInTheDocument()
    expect( screen.getAllByRole( 'tab' ) ).toHaveLength( 4 )
  } )

  it( 'shows an error when the settings cannot be loaded', () => {
    vi.mocked( useSettings ).mockReturnValue( settingsState( {
      settings: null,
      lockedInstructions: null,
      error: 'Could not reach the server',
    } ) )
    renderWithRouter( '/settings/models' )

    expect( screen.getByRole( 'alert' ) ).toHaveTextContent( 'Could not reach the server' )
    expect( screen.queryByText( 'models content' ) ).not.toBeInTheDocument()
  } )
} )

describe( 'SettingsLayout by user', () => {
  const tabNames = (): string[] => {
    return screen.getAllByRole( 'tab' ).map( ( tab ) => tab.textContent ?? '' )
  }

  it( 'shows a Transcriber member no Admin tab', () => {
    const me = memberFixture( { modules: [ 'transcriber' ] } )
    renderWithRouter( '/settings/prompts', { me } )

    expect( tabNames() ).toEqual( [ 'Prompts', 'Models', 'Sources' ] )
  } )

  it( 'shows a Melete-only member Prompts and Models', () => {
    renderWithRouter( '/settings/prompts', { me: memberFixture( { modules: [ 'melete' ] } ) } )

    expect( tabNames() ).toEqual( [ 'Prompts', 'Models' ] )
  } )

  it.each( [ 'admin', 'sources' ] )( 'sends a Melete-only member from %s to Prompts', ( tab ) => {
    const me = memberFixture( { modules: [ 'melete' ] } )
    const { location } = renderWithRouter( `/settings/${ tab }`, { me } )

    expect( location().pathname ).toBe( '/settings/prompts' )
    expect( screen.queryByText( 'admin content' ) ).not.toBeInTheDocument()
    expect( screen.queryByText( 'sources content' ) ).not.toBeInTheDocument()
  } )

  it( 'sends a member from /settings/admin to Prompts', () => {
    const { location } = renderWithRouter( '/settings/admin', { me: memberFixture() } )

    expect( location().pathname ).toBe( '/settings/prompts' )
    expect( screen.queryByText( 'admin content' ) ).not.toBeInTheDocument()
  } )
} )
